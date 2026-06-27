"""Standing Sentinel — proactive one-nudge/site/day sweep (Phase 3.1, the
side-effecting half of the radar).

The read endpoint (``router.py``) is on-demand and side-effect-free. This sweep
is the clock: once a day it walks every site, computes the radar, and for a site
that has something slipping it raises ONE owner-visible nudge (a tagged
``Decision``, mirroring the homeowner request-nudge sweep) — never more than one
per site per day (deduped on an existing same-day ``[SENTINEL]`` decision, so no
new table/migration is needed). Honest-AI: the nudge is grounded in the
deterministic detector; a quiet site raises nothing.
"""
from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.site_events import latest_event_clause
from app.forecast.forecast import material_reorder_forecasts
from app.models import (
    ActionItem,
    ActionItemStatus,
    Decision,
    DecisionKind,
    DecisionState,
    Site,
    SiteEventModel,
)
from app.sentinel.sentinel import Signal, build_signals

# Tag that marks (and dedups) a sweep-raised nudge.
NUDGE_TAG = "[SENTINEL]"


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


async def gather_signals(
    session: AsyncSession, site_id: UUID, today: date, *, window_days: int = 14
) -> list[Signal]:
    """Pull the primitives for one site and run the deterministic detector.
    Shared by the read endpoint and the proactive sweep (single source of truth)."""
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

    return build_signals(
        today=today,
        attendance_days=attendance_days,
        overdue_action_items=overdue_action_items,
        overdue_materials=overdue_materials,
    )


async def run_sentinel_sweep(
    session: AsyncSession, *, today: date | None = None
) -> list[UUID]:
    """Raise at most one Sentinel nudge per site per day. Returns nudged site ids."""
    # Use the SAME calendar source as the read endpoint (date.today()), not UTC —
    # the split made "today's attendance" mis-evaluate (and the tests flap) when
    # the server's local date differs from UTC.
    day = today or date.today()
    nudged: list[UUID] = []

    sites = (await session.execute(select(Site))).scalars().all()
    for site in sites:
        signals = await gather_signals(session, site.id, day)
        if not signals:
            continue
        # One nudge/site/day: skip if a [SENTINEL] decision already exists today.
        already = (
            await session.execute(
                select(func.count())
                .select_from(Decision)
                .where(
                    Decision.site_id == site.id,
                    Decision.title.like(f"{NUDGE_TAG}%"),
                    func.date(Decision.created_at) == day,
                )
            )
        ).scalar_one()
        if already:
            continue

        top = signals[0]
        extra = len(signals) - 1
        detail = top.message + (f" (+{extra} more on the radar)" if extra else "")
        session.add(
            Decision(
                company_id=site.company_id,
                site_id=site.id,
                kind=DecisionKind.generic,
                title=f"{NUDGE_TAG} {top.message}"[:200],
                detail=detail,
                state=DecisionState.pending,
            )
        )
        nudged.append(site.id)

    if nudged:
        await session.commit()
    return nudged
