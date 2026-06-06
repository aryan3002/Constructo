"""Attendance capture & planned-vs-actual endpoints (Phase B).

Field-role write path for the contractor app's CaptureBar plus the reads it
needs:

  * ``POST /api/v1/sites/{site_id}/attendance`` — capture today's headcount
    (supervisor / pm / owner / labor_contractor). Persists an ``attendance``
    SiteEvent; idempotent on the client's offline-queue id.
  * ``GET  /api/v1/sites/{site_id}/attendance`` — recent attendance captures
    for the timeline (cursor-paginated).
  * ``GET  /api/v1/sites/{site_id}/attendance/summary`` — planned-vs-actual
    headcount for a day, against the site baseline.
  * ``GET  /api/v1/me/payments`` — payments the company recorded against the
    caller (mukadam's own "proof = faster payment" status), read-only.

Visibility reuses the Sites module's ``effective_visible_site_ids`` so owner/pm
see every company site and field roles only their assigned ones — no frozen
code touched.
"""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.aggregate import EventLike, sum_headcount
from app.attendance import service
from app.attendance.schemas import (
    AttendanceCaptureIn,
    AttendanceEventOut,
    MyPaymentOut,
    PlannedVsActualOut,
)
from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.pagination import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    Page,
    decode_cursor,
    encode_cursor,
)
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.models import Site, SiteEventModel, User, UserRole
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["attendance"])

# Who may write attendance from the app. Field roles plus their managers.
_CAPTURE_ROLES = {
    UserRole.owner,
    UserRole.pm,
    UserRole.supervisor,
    UserRole.labor_contractor,
}


def _parse_limit(limit: int) -> int:
    if limit <= 0:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _decode(cursor: str | None) -> str | None:
    try:
        return decode_cursor(cursor)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc


async def _require_site_in_scope(session: AsyncSession, user: User, site_id: UUID) -> None:
    """404 if the site doesn't exist, 403 if it's outside the caller's scope."""
    visible = await effective_visible_site_ids(session, user)
    if site_id in visible:
        return
    site = await session.get(Site, site_id)
    if site is None:
        raise AppError(404, "not_found", "Site not found")
    raise AppError(403, "forbidden", "Site not in scope")


# ---- capture ---------------------------------------------------------------


@router.post(
    "/sites/{site_id}/attendance", response_model=AttendanceEventOut, status_code=201
)
async def capture_attendance(
    site_id: UUID,
    body: AttendanceCaptureIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AttendanceEventOut:
    if user.role not in _CAPTURE_ROLES:
        raise AppError(403, "forbidden", "Insufficient role to capture attendance")
    await _require_site_in_scope(session, user, site_id)

    if body.by_trade is not None and any(v < 0 for v in body.by_trade.values()):
        raise AppError(400, "invalid_by_trade", "Trade counts cannot be negative")

    occurred_on = body.occurred_on or dt.date.today()
    event = await service.create_attendance_event(
        session,
        site_id=site_id,
        occurred_on=occurred_on,
        headcount=body.headcount,
        by_trade=body.by_trade,
        note=body.note,
        source=body.source,
        proof_media_urls=body.proof_media_urls,
        client_capture_id=body.client_capture_id,
    )
    await session.commit()
    return _event_out(event)


@router.get("/sites/{site_id}/attendance", response_model=Page[AttendanceEventOut])
async def list_attendance(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    date: dt.date | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[AttendanceEventOut]:
    """Recent attendance captures for a site (newest first), for the timeline."""
    await _require_site_in_scope(session, user, site_id)

    page_size = _parse_limit(limit)
    after = _decode(cursor)

    stmt = select(SiteEventModel).where(
        SiteEventModel.site_id == site_id,
        SiteEventModel.event_type == service.ATTENDANCE_EVENT_TYPE,
    )
    if date is not None:
        stmt = stmt.where(SiteEventModel.occurred_on == date)
    # Newest first; cursor walks backwards by id (ids are uuid4 — stable tie-break).
    stmt = stmt.order_by(SiteEventModel.created_at.desc(), SiteEventModel.id.desc())
    if after is not None:
        stmt = stmt.where(SiteEventModel.id < UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))

    return Page[AttendanceEventOut](
        items=[_event_out(e) for e in rows], next_cursor=next_cursor
    )


@router.get("/sites/{site_id}/attendance/summary", response_model=PlannedVsActualOut)
async def attendance_summary(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    date: dt.date | None = Query(None),
) -> PlannedVsActualOut:
    """Planned-vs-actual headcount for a day against the site baseline."""
    await _require_site_in_scope(session, user, site_id)
    occurred_on = date or dt.date.today()
    expected, actual, variance, status, capture_count = await service.planned_vs_actual(
        session, site_id=site_id, occurred_on=occurred_on
    )
    return PlannedVsActualOut(
        site_id=site_id,
        occurred_on=occurred_on,
        expected=expected,
        actual=actual,
        variance=variance,
        status=status,
        capture_count=capture_count,
    )


# ---- mukadam's own payment status ------------------------------------------


@router.get("/me/payments", response_model=Page[MyPaymentOut])
async def my_payments(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(DEFAULT_LIMIT),
) -> Page[MyPaymentOut]:
    """Payments the company recorded against the caller (read-only).

    Matched by the caller's own name as the payment counterparty, scoped to
    their visible sites. Empty when the caller has no name on file or no
    payments recorded — the app frames this as "proof = faster payment".
    """
    visible = await effective_visible_site_ids(session, user)
    # owner/pm see all company sites already; field roles get their scope. We
    # always allow company-level (NULL site) matches in the service layer.
    site_ids = None if user.role in {UserRole.owner, UserRole.pm} else visible
    payments = await service.my_recorded_payments(
        session,
        company_id=user.company_id,
        counterparty_name=user.name or "",
        site_ids=site_ids,
        limit=_parse_limit(limit),
    )
    return Page[MyPaymentOut](items=[_payment_out(p) for p in payments], next_cursor=None)


class WageTrailOut(BaseModel):
    """The mukadam's wage-proof trail (1.9) — his logged attendance turned into
    worker-days, with the contributing events as evidence. 'Your haan became
    your wage proof.'"""

    days: int
    total_worker_days: float
    days_logged: int
    by_date: dict[str, float]
    evidence_event_ids: list[UUID]


@router.get("/me/wage-trail", response_model=WageTrailOut)
async def wage_trail(
    days: int = Query(30, ge=1, le=180),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WageTrailOut:
    """Attendance the caller's crew logged on their site(s), aggregated to
    worker-days — the wage-proof basis (1.9 wedge). Deterministic; scoped to the
    caller's visible sites; evidence is the contributing attendance events."""
    visible = await effective_visible_site_ids(session, user)
    if not visible:
        return WageTrailOut(
            days=days, total_worker_days=0, days_logged=0, by_date={}, evidence_event_ids=[]
        )
    since = dt.date.today() - dt.timedelta(days=days - 1)
    rows = (
        await session.execute(
            select(SiteEventModel)
            .where(
                SiteEventModel.site_id.in_(visible),
                SiteEventModel.event_type == "attendance",
                SiteEventModel.occurred_on >= since,
            )
            .where(latest_event_clause())
        )
    ).scalars().all()

    events = [
        EventLike(id=str(e.id), event_type=e.event_type, fields=e.fields, confidence=e.confidence)
        for e in rows
    ]
    agg = sum_headcount(events)
    by_date: dict[str, float] = {}
    days_seen: set = set()
    for e in rows:
        head = e.fields.get("headcount")
        if isinstance(head, (int, float)) and e.confidence >= 0.5:
            key = e.occurred_on.isoformat()
            by_date[key] = by_date.get(key, 0.0) + float(head)
            days_seen.add(key)
    return WageTrailOut(
        days=days,
        total_worker_days=agg.total or 0.0,
        days_logged=len(days_seen),
        by_date=by_date,
        evidence_event_ids=[UUID(i) for i in agg.evidence_event_ids],
    )


# ---- serializers -----------------------------------------------------------


def _event_out(e: SiteEventModel) -> AttendanceEventOut:
    fields = e.fields or {}
    return AttendanceEventOut(
        id=e.id,
        site_id=e.site_id,
        occurred_on=e.occurred_on,
        headcount=fields.get("headcount"),
        by_trade=fields.get("by_trade"),
        summary=e.summary,
        confidence=e.confidence,
        needs_clarification=e.needs_clarification,
        source=fields.get("capture_source", "feed"),
        proof_media_urls=list(fields.get("proof_media_urls") or []),
        client_capture_id=fields.get("client_capture_id"),
        version=e.version,
        created_at=e.created_at,
    )


def _payment_out(p) -> MyPaymentOut:  # noqa: ANN001 - Payment ORM row
    return MyPaymentOut(
        id=p.id,
        site_id=p.site_id,
        amount=str(p.amount),
        currency=p.currency,
        paid_on=p.paid_on,
        method=p.method,
        status=p.status.value if hasattr(p.status, "value") else str(p.status),
        notes=p.notes,
        created_at=p.created_at,
    )
