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
    EventEmbedding,
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
_TOPK = 6  # retrieved events / messages fed to the grounded-answer synthesis

# Grounded-QA synthesis: the model answers ONLY from retrieved context (RAG), or
# says it can't — it may never invent a fact, number, name, or date.
_GROUNDED_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "grounded": {"type": "boolean"},
    },
    "required": ["grounded"],
}
_GROUNDED_SYS = (
    "You are Nivaan, answering a question about a construction site. Use ONLY the "
    "CONTEXT below (captured events + thread messages). Answer in ONE concise "
    "sentence. If the context does not contain the answer, set grounded=false and "
    "leave answer empty. NEVER invent a fact, number, name, or date that isn't in "
    "the context. Mirror the user's language (Hindi/Hinglish/English)."
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
    # Beyond exact totals: any other site question goes through grounded RAG
    # synthesis (retrieve events + messages, answer ONLY from them, abstain if the
    # record has nothing) — so @ask answers "when did the slab pour?", "what's the
    # status of the kitchen?", not just "how much cement?".
    if result.kind is AgentResultKind.clarify and llm is not None:
        grounded = await _answer_grounded(session, user, utterance, site_id, llm)
        if grounded is not None:
            result = grounded
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


async def _scope(
    session: AsyncSession, user: User, site_id: UUID | None
) -> list[UUID] | None:
    """The caller's visible sites, optionally narrowed to one. None → no access."""
    if user.role is UserRole.homeowner:
        return None
    visible = list(await effective_visible_site_ids(session, user))
    if site_id is not None:
        visible = [s for s in visible if s == site_id]
    return visible or None


async def _topk_events(
    session: AsyncSession, scope: list[UUID], vec: list[float]
) -> list[tuple[SiteEventModel, float]]:
    distance = EventEmbedding.embedding.cosine_distance(vec).label("d")
    rows = (
        await session.execute(
            select(SiteEventModel, distance)
            .join(EventEmbedding, EventEmbedding.site_event_id == SiteEventModel.id)
            .where(SiteEventModel.site_id.in_(scope), latest_event_clause())
            .order_by(distance)
            .limit(_TOPK)
        )
    ).all()
    return [(e, 1.0 - float(d)) for e, d in rows]


async def _topk_messages(
    session: AsyncSession, scope: list[UUID], vec: list[float]
) -> list[tuple[ChatMessage, float]]:
    distance = MessageEmbedding.embedding.cosine_distance(vec).label("d")
    rows = (
        await session.execute(
            select(ChatMessage, distance)
            .join(MessageEmbedding, MessageEmbedding.chat_message_id == ChatMessage.id)
            .join(Conversation, Conversation.id == ChatMessage.conversation_id)
            .where(Conversation.site_id.in_(scope))
            .order_by(distance)
            .limit(_TOPK)
        )
    ).all()
    return [(m, 1.0 - float(d)) for m, d in rows]


async def _answer_grounded(
    session: AsyncSession, user: User, utterance: str, site_id: UUID | None, llm: LLMClient
) -> AgentResult | None:
    """Grounded RAG answer (the general Q&A): retrieve the most relevant events +
    thread messages (scoped), and have the model compose a ONE-sentence answer
    ONLY from them — abstaining when the record has nothing or the model isn't
    grounded. Returns None to fall back to the clarify."""
    scope = await _scope(session, user, site_id)
    if not scope:
        return None
    [vec] = await get_embeddings_client().embed([utterance])
    events = [e for e, s in await _topk_events(session, scope, vec) if s >= SIMILARITY_FLOOR]
    messages = [m for m, s in await _topk_messages(session, scope, vec) if s >= SIMILARITY_FLOOR]
    if not events and not messages:
        return None  # nothing in the record clears the floor — abstain honestly

    lines = [
        f"- [{e.event_type} {e.occurred_on}] {e.summary} {e.fields}" for e in events
    ] + [f"- (message) {m.body}" for m in messages if m.body]
    context = "\n".join(lines)
    out = await llm.complete(
        system=_GROUNDED_SYS,
        user=f"QUESTION: {utterance}\n\nCONTEXT:\n{context}",
        json_schema=_GROUNDED_SCHEMA,
    )
    answer = (out or {}).get("answer") or ""
    if not (out or {}).get("grounded") or not answer.strip():
        return None
    evidence = [str(e.id) for e in events] + [str(m.id) for m in messages]
    return AgentResult(
        kind=AgentResultKind.answer,
        text=answer.strip(),
        tool="grounded_qa",
        evidence_event_ids=evidence,
    )


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
