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
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
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
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.models import SiteEventModel, User, UserRole
from app.search.query import parse_query
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["ask"])

# Known materials so "how much cement" filters deterministically (no model).
_MATERIALS = (
    "cement", "steel", "sariya", "rebar", "sand", "reti", "brick", "eint",
    "aggregate", "gitti", "tile", "paint", "putty", "pipe", "wood", "ply",
)


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


@router.post("/ask", response_model=AskOut)
async def ask(
    body: AskIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AskOut:
    parsed = parse_query(body.question, today=date.today())
    if parsed.event_type is None or reducer_for(parsed.event_type.value) is None:
        return AskOut(
            answerable=False,
            answer="Ask about deliveries, attendance, or amounts — e.g. "
            '"how much cement this month?"',
        )

    # Scope: the caller's visible sites, optionally narrowed to one (never widened).
    visible = await effective_visible_site_ids(session, user)
    if user.role is UserRole.homeowner or not visible:
        return AskOut(answerable=False, answer="No accessible sites.")
    scope = visible
    if body.site_id is not None:
        if body.site_id not in visible:
            return AskOut(answerable=False, answer="No accessible sites.")
        scope = {body.site_id}

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

    metric = reducer_for(parsed.event_type.value)
    material = _material_in(body.question)
    if metric == "sum_quantity":
        result = sum_quantity(events, material=material)
    elif metric == "sum_headcount":
        result = sum_headcount(events)
    else:
        result = sum_amount(events)

    return AskOut(
        answerable=result.answerable,
        answer=_phrase(result, material),
        total=result.total,
        unit=result.unit,
        breakdown=result.breakdown,
        evidence_event_ids=result.evidence_event_ids,
        contributors=result.contributors,
        unconfirmed=result.unconfirmed,
    )
