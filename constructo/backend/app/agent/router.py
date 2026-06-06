"""Ask-the-Project (2.2) — a grounded, deterministic answer with evidence.

Anyone asks a question in plain Hindi/Hinglish ("how much cement this month?",
"kitne mazdoor aaye is hafte?") and gets a one-line total computed by the
:mod:`app.agent.aggregate` reducers — never by a model — scoped to the caller's
visible sites, abstaining when it can't ground the number. The deterministic
``parse_query`` routes the question to a reducer (the ~20-template fast path);
the fuzzy long tail via the LLM agent is a later slice.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.aggregate import (
    AggregateResult,
    EventLike,
    reducer_for,
    sum_amount,
    sum_headcount,
    sum_quantity,
)
from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.models import DisputeStatus, EventDispute, SiteEventModel, User, UserRole
from app.publish.membrane import draft_homeowner_update
from app.search.query import parse_query
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["ask"])

# Known materials so "how much cement" filters deterministically (no model).
_MATERIALS = (
    "cement", "steel", "sariya", "rebar", "sand", "reti", "brick", "eint",
    "aggregate", "gitti", "tile", "paint", "putty", "pipe", "wood", "ply",
)


class TurnIn(BaseModel):
    utterance: str
    site_id: UUID | None = None


class TurnOut(BaseModel):
    kind: str  # answer | clarify | cards (terminal tools — never free prose)
    text: str
    tool: str
    total: float | None = None
    unit: str | None = None
    evidence_event_ids: list[str] = []


@router.post("/agent/turn", response_model=TurnOut)
async def agent_turn(
    body: TurnIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TurnOut:
    """@nivaan — one constrained turn. Deterministic-first; ends in a terminal
    tool (answer/clarify/cards), scoped at the executor, audited in agent_turns."""
    from app.agent.loop import run_turn
    from app.extraction.llm import get_llm_client

    r = await run_turn(session, user, body.utterance, site_id=body.site_id, llm=get_llm_client())
    return TurnOut(
        kind=r.kind.value,
        text=r.text,
        tool=r.tool,
        total=r.total,
        unit=r.unit,
        evidence_event_ids=r.evidence_event_ids,
    )


class MembraneSuggestIn(BaseModel):
    event_id: UUID


class MembraneSuggestOut(BaseModel):
    source_event_id: UUID
    crosses: bool
    draft: str | None = None


class AskIn(BaseModel):
    question: str
    site_id: UUID | None = None


class AskOut(BaseModel):
    answerable: bool
    answer: str
    total: float | None = None
    unit: str | None = None
    breakdown: dict[str, float] = {}
    evidence_event_ids: list[str] = []
    contributors: int = 0
    unconfirmed: int = 0


def _material_in(question: str) -> str | None:
    q = question.lower()
    for m in _MATERIALS:
        if re.search(rf"\b{m}\b", q):
            return m
    return None


def _phrase(r: AggregateResult, material: str | None) -> str:
    if not r.answerable:
        return "I don't have a grounded answer for that in the record."
    if r.metric == "sum_quantity":
        subject = material or "material"
        if r.total is not None:
            base = f"{_fmt(r.total)} {r.unit} {subject}"
        else:
            base = " + ".join(f"{_fmt(v)} {u}" for u, v in r.breakdown.items()) + f" {subject}"
    elif r.metric == "sum_headcount":
        base = f"{_fmt(r.total)} worker-days"
    elif r.metric == "sum_amount":
        base = f"₹{_fmt(r.total)}"
    else:
        base = "—"
    if r.unconfirmed:
        plural = "entries" if r.unconfirmed != 1 else "entry"
        return f"{base} confirmed (+ {r.unconfirmed} {plural} not recorded clearly)."
    return f"{base}."


def _fmt(v: float | None) -> str:
    if v is None:
        return "0"
    return str(int(v)) if float(v).is_integer() else str(v)


class RecapOut(BaseModel):
    """A deterministic Catch-me-up over a site's recent thread (2.6) — chatter
    distilled into structured objects, never an LLM guess."""

    site_id: UUID
    days: int
    event_counts: dict[str, int] = {}
    material_totals: dict[str, float] = {}  # "cement: bori" -> qty
    worker_days: float | None = None
    amount_total: float | None = None
    open_disputes: int = 0
    summary: str


@router.get("/recap", response_model=RecapOut)
async def recap(
    site_id: UUID = Query(...),
    days: int = Query(1, ge=1, le=30),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RecapOut:
    """Distill the last ``days`` of a site's thread into structured totals — the
    deterministic ``recap_thread``: event counts, material/attendance/amount
    totals (computed by the reducers, never a model), and open disputes."""
    visible = await effective_visible_site_ids(session, user)
    if user.role is UserRole.homeowner or site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")

    since = date.today() - timedelta(days=days - 1)
    rows = (
        await session.execute(
            select(SiteEventModel)
            .where(SiteEventModel.site_id == site_id, SiteEventModel.occurred_on >= since)
            .where(latest_event_clause())
        )
    ).scalars().all()
    events = [
        EventLike(id=str(e.id), event_type=e.event_type, fields=e.fields, confidence=e.confidence)
        for e in rows
    ]

    counts: dict[str, int] = {}
    for e in events:
        counts[e.event_type] = counts.get(e.event_type, 0) + 1

    # Material totals per (material, canonical unit).
    materials = sorted(
        {
            (e.fields.get("material") or "").lower()
            for e in events
            if e.event_type == "material_delivery"
        }
        - {""}
    )
    material_totals: dict[str, float] = {}
    for m in materials:
        r = sum_quantity(events, material=m)
        if r.answerable and r.total is not None and r.unit is not None:
            material_totals[f"{m}: {r.unit}"] = r.total

    head = sum_headcount(events)
    amount = sum_amount(events)
    open_disputes = (
        await session.execute(
            select(func.count())
            .select_from(EventDispute)
            .where(EventDispute.site_id == site_id, EventDispute.status == DisputeStatus.open)
        )
    ).scalar_one()

    parts: list[str] = []
    if head.answerable:
        parts.append(f"{_fmt(head.total)} worker-days")
    for label, qty in material_totals.items():
        parts.append(f"{_fmt(qty)} {label.split(': ')[1]} {label.split(':')[0]}")
    if amount.answerable:
        parts.append(f"₹{_fmt(amount.total)} billed/paid")
    if open_disputes:
        parts.append(f"{open_disputes} open dispute{'s' if open_disputes != 1 else ''}")
    summary = "; ".join(parts) if parts else "Nothing logged in this window."

    return RecapOut(
        site_id=site_id,
        days=days,
        event_counts=counts,
        material_totals=material_totals,
        worker_days=head.total if head.answerable else None,
        amount_total=amount.total if amount.answerable else None,
        open_disputes=open_disputes,
        summary=summary,
    )


@router.post("/membrane/suggest", response_model=MembraneSuggestOut)
async def membrane_suggest(
    body: MembraneSuggestIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MembraneSuggestOut:
    """Trust Membrane (2.4): a calm, digit-safe, price-stripped homeowner DRAFT
    for one committed event — the silent "Nivaan suggests sending this" chip. It
    is never published here; the contractor reviews, edits, and commits it
    through the publish gate (raw AI never auto-reaches the homeowner)."""
    event = await session.get(SiteEventModel, body.event_id)
    if event is None:
        raise AppError(404, "not_found", "Event not found")
    visible = await effective_visible_site_ids(session, user)
    if user.role is UserRole.homeowner or event.site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")
    draft = draft_homeowner_update(event.event_type, event.fields, event.occurred_on)
    return MembraneSuggestOut(source_event_id=event.id, crosses=draft is not None, draft=draft)


@router.post("/ask", response_model=AskOut)
async def ask(
    body: AskIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AskOut:
    """Ask anything about the site. Exact totals (how much/many/paid) are computed
    deterministically by the reducers; every other question is answered by
    grounded RAG over the actual events + thread (cited, abstaining when the
    record has nothing). Scoped to the caller's visible sites."""
    visible = await effective_visible_site_ids(session, user)
    if user.role is UserRole.homeowner or not visible:
        return AskOut(answerable=False, answer="No accessible sites.")
    if body.site_id is not None and body.site_id not in visible:
        return AskOut(answerable=False, answer="No accessible sites.")

    # 1) Deterministic exact-number aggregation (the LLM never produces the number).
    parsed = parse_query(body.question, today=date.today())
    metric = reducer_for(parsed.event_type.value) if parsed.event_type is not None else None
    if metric is not None:
        scope = {body.site_id} if body.site_id is not None else set(visible)
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
            EventLike(
                id=str(e.id), event_type=e.event_type, fields=e.fields, confidence=e.confidence
            )
            for e in rows
        ]
        material = _material_in(body.question)
        if metric == "sum_quantity":
            result = sum_quantity(events, material=material)
        elif metric == "sum_headcount":
            result = sum_headcount(events)
        else:
            result = sum_amount(events)
        if result.answerable:
            return AskOut(
                answerable=True,
                answer=_phrase(result, material),
                total=result.total,
                unit=result.unit,
                breakdown=result.breakdown,
                evidence_event_ids=result.evidence_event_ids,
                contributors=result.contributors,
                unconfirmed=result.unconfirmed,
            )

    # 2) Grounded RAG fallback — any other site question, answered from the record.
    from app.agent.loop import _answer_grounded
    from app.extraction.llm import get_llm_client

    grounded = await _answer_grounded(
        session, user, body.question, body.site_id, get_llm_client()
    )
    if grounded is not None:
        return AskOut(
            answerable=True,
            answer=grounded.text,
            evidence_event_ids=grounded.evidence_event_ids,
        )

    # 3) Nothing in the record supports an answer — abstain honestly.
    return AskOut(
        answerable=False,
        answer="I don't have that in the site record yet — try a delivery, "
        "attendance, amount, or progress question.",
    )
