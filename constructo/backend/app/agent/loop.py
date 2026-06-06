"""The agent (2.1) — a constrained, scoped turn that ends in a terminal tool.

``run_turn`` is the single @nivaan entry point. It is deterministic-first: the
common Hinglish question templates route straight to the aggregation reducers
(no model, ₹0), and anything it can't ground returns a single clarify — it can
NEVER emit free-text prose. The result kind is always one of the terminal tools
(answer / clarify / cards), scoping is enforced at the executor (visible sites
computed server-side, never widenable by the utterance), and exactly one
``agent_turns`` audit row is written per turn.

The fuzzy long tail (LLM function-calling over the same green-tier tools, capped
at MAX_STEPS=4) slots in where the deterministic router abstains — the tools it
would call already exist (aggregate, recap, membrane, message-search).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.aggregate import EventLike, reducer_for, sum_amount, sum_headcount, sum_quantity
from app.common.site_events import latest_event_clause
from app.extraction.llm import LLMClient
from app.models import (
    AgentResultKind,
    AgentTurn,
    ChatMessage,
    Conversation,
    MessageEmbedding,
    SiteEventModel,
    User,
    UserRole,
)
from app.search.embeddings import get_embeddings_client
from app.search.query import parse_query
from app.search.router import SIMILARITY_FLOOR
from app.sites.router import effective_visible_site_ids

MAX_STEPS = 4  # the loop cap (the deterministic router uses a single step)

# The router decision the LLM returns — it picks a green-tier tool to GROUND the
# answer (or "none"); it never writes the number itself (a tool produces it).
_DECISION_SCHEMA = {
    "type": "object",
    "properties": {
        "tool": {"type": "string", "enum": ["search_messages", "none"]},
        "query": {"type": "string"},
    },
    "required": ["tool"],
}
_AGENT_SYSTEM = (
    "You are Nivaan's router. Pick ONE green-tier tool to ground the user's "
    "question, or 'none'. You never write the answer yourself — a tool produces "
    "it. Tools: search_messages (semantic search over this site's thread)."
)

_MATERIALS = (
    "cement", "steel", "sariya", "rebar", "sand", "reti", "brick", "eint",
    "aggregate", "gitti", "tile", "paint", "putty", "pipe", "wood", "ply",
)


@dataclass
class AgentResult:
    kind: AgentResultKind
    text: str
    tool: str = "none"
    total: float | None = None
    unit: str | None = None
    evidence_event_ids: list[str] = field(default_factory=list)


def _material_in(q: str) -> str | None:
    ql = q.lower()
    return next((m for m in _MATERIALS if f" {m} " in f" {ql} "), None)


def _fmt(v: float | None) -> str:
    if v is None:
        return "0"
    return str(int(v)) if float(v).is_integer() else str(v)


async def run_turn(
    session: AsyncSession,
    user: User,
    utterance: str,
    *,
    site_id: UUID | None = None,
    llm: LLMClient | None = None,
) -> AgentResult:
    """Resolve one Nivaan turn to a terminal result and log the audit row.

    Deterministic-first: the common question templates route straight to the
    reducers (₹0, ``model="deterministic"``). When that abstains AND an ``llm`` is
    provided, the constrained tool-loop runs (the fuzzy tail), still ending in a
    terminal tool and still never producing the number itself."""
    result = await _resolve(session, user, utterance, site_id)
    model = "deterministic"
    if result.kind is AgentResultKind.clarify and llm is not None:
        looped = await _run_llm_loop(session, user, utterance, site_id, llm)
        if looped is not None:
            result = looped
            model = getattr(llm, "model", "llm")
    session.add(
        AgentTurn(
            company_id=user.company_id,
            actor_id=user.id,
            site_id=site_id,
            utterance=utterance[:2000],
            result_kind=result.kind,
            tool=result.tool,
            model=model,
            token_cost=0,
        )
    )
    await session.commit()
    return result


async def _search_messages_top(
    session: AsyncSession, user: User, query: str, site_id: UUID | None
) -> ChatMessage | None:
    """Top semantic message hit above the relevance floor, scoped (a green-tier
    tool). Abstains (None) below the floor rather than guess."""
    visible = list(await effective_visible_site_ids(session, user))
    if site_id is not None:
        visible = [s for s in visible if s == site_id]
    if not visible:
        return None
    [vec] = await get_embeddings_client().embed([query])
    distance = MessageEmbedding.embedding.cosine_distance(vec).label("d")
    row = (
        await session.execute(
            select(ChatMessage, distance)
            .join(MessageEmbedding, MessageEmbedding.chat_message_id == ChatMessage.id)
            .join(Conversation, Conversation.id == ChatMessage.conversation_id)
            .where(Conversation.site_id.in_(visible))
            .order_by(distance)
            .limit(1)
        )
    ).first()
    if row is None:
        return None
    msg, dist = row
    return msg if (1.0 - float(dist)) >= SIMILARITY_FLOOR else None


async def _run_llm_loop(
    session: AsyncSession, user: User, utterance: str, site_id: UUID | None, llm: LLMClient
) -> AgentResult | None:
    """The constrained function-calling loop (MAX_STEPS): the LLM routes to a
    tool, the tool grounds the answer, the loop emits it. Terminal-only — the LLM
    never composes the number. Returns None if no tool grounded an answer."""
    for _step in range(MAX_STEPS):
        decision = await llm.complete(
            system=_AGENT_SYSTEM, user=utterance, json_schema=_DECISION_SCHEMA
        )
        tool = (decision or {}).get("tool")
        query = (decision or {}).get("query") or utterance
        if tool == "search_messages":
            hit = await _search_messages_top(session, user, query, site_id)
            if hit is not None:
                return AgentResult(
                    kind=AgentResultKind.answer,
                    text=hit.body or "",
                    tool="search_messages",
                    evidence_event_ids=[str(hit.id)],
                )
            return None  # the tool abstained — don't burn the budget re-asking
        return None  # "none" or an unknown tool → fall back to the clarify
    return None


_CLARIFY = AgentResult(
    kind=AgentResultKind.clarify,
    text="I can total deliveries, attendance, or amounts for a site — try "
    '"how much cement this month?"',
    tool="none",
)


async def _resolve(
    session: AsyncSession, user: User, utterance: str, site_id: UUID | None
) -> AgentResult:
    parsed = parse_query(utterance, today=date.today())
    metric = reducer_for(parsed.event_type.value) if parsed.event_type else None
    if metric is None:
        return _CLARIFY

    # Scoping at the executor — visible sites computed server-side, never widened.
    visible = await effective_visible_site_ids(session, user)
    if user.role is UserRole.homeowner or not visible:
        return AgentResult(kind=AgentResultKind.clarify, text="No accessible sites.")
    scope = visible
    if site_id is not None:
        if site_id not in visible:
            return AgentResult(kind=AgentResultKind.clarify, text="No accessible sites.")
        scope = {site_id}

    stmt = (
        select(SiteEventModel)
        .where(SiteEventModel.site_id.in_(scope))
        .where(SiteEventModel.event_type == parsed.event_type.value)
        .where(latest_event_clause())
    )
    if parsed.date_from is not None:
        stmt = stmt.where(SiteEventModel.occurred_on >= parsed.date_from)
    if parsed.date_to is not None:
        stmt = stmt.where(SiteEventModel.occurred_on <= parsed.date_to)
    rows = (await session.execute(stmt)).scalars().all()
    events = [
        EventLike(id=str(e.id), event_type=e.event_type, fields=e.fields, confidence=e.confidence)
        for e in rows
    ]

    material = _material_in(utterance)
    if metric == "sum_quantity":
        r = sum_quantity(events, material=material)
        subject = material or "material"
        body = (
            f"{_fmt(r.total)} {r.unit} {subject}"
            if r.total is not None
            else " + ".join(f"{_fmt(v)} {u}" for u, v in r.breakdown.items()) + f" {subject}"
        )
    elif metric == "sum_headcount":
        r = sum_headcount(events)
        body = f"{_fmt(r.total)} worker-days"
    else:
        r = sum_amount(events)
        body = f"₹{_fmt(r.total)}"

    if not r.answerable:
        return AgentResult(
            kind=AgentResultKind.clarify,
            text="I don't have a grounded answer for that in the record.",
            tool="aggregate",
        )
    if r.unconfirmed:
        body += f" confirmed (+ {r.unconfirmed} not recorded clearly)"
    return AgentResult(
        kind=AgentResultKind.answer,
        text=f"{body}.",
        tool="aggregate",
        total=r.total,
        unit=r.unit,
        evidence_event_ids=r.evidence_event_ids,
    )
