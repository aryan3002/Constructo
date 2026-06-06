"""Standing Sentinel API (Phase 3.1).

``GET /api/v1/sentinel`` — the absence + stuck-thing radar for a site: attendance
silence on an active site, overdue action items, and cadence-overdue materials.
Scoped (``effective_visible_site_ids``, homeowner blocked), latest-version-wins.
Deterministic (``app.sentinel.sentinel`` + the 3.3 forecaster); read-only and
side-effect-free (the proactive one-nudge/day delivery is a separate concern).
"""
from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.forecast.forecast import material_reorder_forecasts
from app.models import ActionItem, ActionItemStatus, SiteEventModel, User, UserRole
from app.sentinel.sentinel import build_signals
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["sentinel"])


class SignalOut(BaseModel):
    kind: str
    severity: str
    message: str
    evidence_event_ids: list[str] = []


class SentinelOut(BaseModel):
    site_id: UUID
    window_days: int
    signals: list[SignalOut] = []
    count: int = 0
    summary: str


@router.get("/sentinel", response_model=SentinelOut)
async def sentinel(
    site_id: UUID = Query(...),
    window_days: int = Query(14, ge=3, le=90),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SentinelOut:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Sentinel is a crew-side surface")
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")

    today = date.today()
    since = today - timedelta(days=window_days - 1)
    rows = (
        await session.execute(
            select(SiteEventModel)
            .where(SiteEventModel.site_id == site_id, SiteEventModel.occurred_on >= since)
            .where(latest_event_clause())
        )
    ).scalars().all()

    attendance_days = {e.occurred_on for e in rows if e.event_type == "attendance"}
    delivery_rows = [
        (e.occurred_on, (e.fields.get("material") or "").strip().lower(),
         _num(e.fields.get("quantity")), e.fields.get("unit"))
        for e in rows
        if e.event_type == "material_delivery"
    ]
    overdue_materials = [
        (f.material, f.days_since_last, f.avg_interval_days)
        for f in material_reorder_forecasts(delivery_rows, today=today)
        if f.overdue
    ]

    items = (
        await session.execute(
            select(ActionItem.title, ActionItem.due_on).where(
                ActionItem.site_id == site_id,
                ActionItem.status == ActionItemStatus.open,
                ActionItem.due_on.is_not(None),
                ActionItem.due_on < today,
            )
        )
    ).all()
    overdue_action_items = [(title, due_on) for title, due_on in items]

    signals = build_signals(
        today=today,
        attendance_days=attendance_days,
        overdue_action_items=overdue_action_items,
        overdue_materials=overdue_materials,
    )

    high = sum(1 for s in signals if s.severity == "high")
    if not signals:
        summary = "All clear — nothing's slipping."
    else:
        lead = signals[0].message
        more = len(signals) - 1
        summary = lead + (f" (+{more} more)" if more else "")
        if high:
            summary = f"{high} urgent · " + summary

    return SentinelOut(
        site_id=site_id,
        window_days=window_days,
        signals=[SignalOut(**s.__dict__) for s in signals],
        count=len(signals),
        summary=summary,
    )


def _num(v) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", "").strip())
        except ValueError:
            return None
    return None
