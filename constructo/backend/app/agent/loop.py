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
from app.models import AgentResultKind, AgentTurn, SiteEventModel, User, UserRole
from app.search.query import parse_query
from app.sites.router import effective_visible_site_ids

MAX_STEPS = 4  # the loop cap (the deterministic router uses a single step)

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
) -> AgentResult:
    """Resolve one Nivaan turn to a terminal result and log the audit row."""
    result = await _resolve(session, user, utterance, site_id)
    session.add(
        AgentTurn(
            company_id=user.company_id,
            actor_id=user.id,
            site_id=site_id,
            utterance=utterance[:2000],
            result_kind=result.kind,
            tool=result.tool,
            model="deterministic",
            token_cost=0,
        )
    )
    await session.commit()
    return result


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
