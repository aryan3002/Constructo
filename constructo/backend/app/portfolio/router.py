"""Multi-Site Command Inbox — portfolio exact-math Q&A (Phase 3.4).

The owner runs a whole book of sites from one inbox. ``GET /api/v1/portfolio/
summary`` returns deterministic per-site AND portfolio totals — worker-days,
spend, deliveries, open disputes, and (optionally) one material's quantity —
**exact-math GROUP BY**, reusing the same tested reducers as Ask-the-Project
(2.2). Cross-site arbitrage *inference* is deliberately deferred (see plan §7);
this is the honest aggregation slice only.

Scope is by construction: only the caller's ``effective_visible_site_ids`` (a
crew member sees just their assigned sites; owner/PM see the whole company). The
LLM never produces a number here — every figure is arithmetic over the ledger
with latest-version-wins, abstaining per-site when a contributor is unconfirmed.
"""
from __future__ import annotations

from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.aggregate import EventLike, sum_amount, sum_headcount, sum_quantity
from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.models import DisputeStatus, EventDispute, Site, SiteEventModel, User, UserRole
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["portfolio"])


class SiteRollup(BaseModel):
    site_id: UUID
    site_name: str
    worker_days: float | None = None
    amount_total: float | None = None
    deliveries: int = 0
    open_disputes: int = 0
    material_qty: float | None = None
    material_unit: str | None = None


class PortfolioTotals(BaseModel):
    worker_days: float | None = None
    amount_total: float | None = None
    deliveries: int = 0
    open_disputes: int = 0
    material_qty: float | None = None
    material_unit: str | None = None


class PortfolioOut(BaseModel):
    days: int
    site_count: int
    material: str | None = None
    sites: list[SiteRollup] = []
    totals: PortfolioTotals
    summary: str


@router.get("/portfolio/summary", response_model=PortfolioOut)
async def portfolio_summary(
    days: int = Query(30, ge=1, le=365),
    material: str | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PortfolioOut:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Portfolio is a crew-side surface")
    visible = await effective_visible_site_ids(session, user)
    if not visible:
        return PortfolioOut(
            days=days, site_count=0, material=material, sites=[],
            totals=PortfolioTotals(), summary="No sites in view.",
        )

    names = {
        sid: nm
        for sid, nm in (
            await session.execute(select(Site.id, Site.name).where(Site.id.in_(visible)))
        ).all()
    }
    since = date.today() - timedelta(days=days - 1)
    rows = (
        await session.execute(
            select(SiteEventModel)
            .where(SiteEventModel.site_id.in_(visible), SiteEventModel.occurred_on >= since)
            .where(latest_event_clause())
        )
    ).scalars().all()

    # Open disputes per site (a single grouped count).
    dispute_counts = dict(
        (
            await session.execute(
                select(EventDispute.site_id, func.count())
                .where(
                    EventDispute.site_id.in_(visible),
                    EventDispute.status == DisputeStatus.open,
                )
                .group_by(EventDispute.site_id)
            )
        ).all()
    )

    by_site: dict[UUID, list[EventLike]] = {sid: [] for sid in visible}
    for e in rows:
        by_site.setdefault(e.site_id, []).append(
            EventLike(
                id=str(e.id),
                event_type=e.event_type,
                fields=e.fields,
                confidence=e.confidence,
            )
        )

    mat = material.strip().lower() if material else None
    rollups: list[SiteRollup] = []
    # Portfolio material total only sums when every site shares one canonical unit.
    mat_units: set[str] = set()
    mat_sum = 0.0
    mat_any = False
    for sid in visible:
        evs = by_site.get(sid, [])
        head = sum_headcount(evs)
        amt = sum_amount(evs)
        deliveries = sum(1 for e in evs if e.event_type == "material_delivery")
        roll = SiteRollup(
            site_id=sid,
            site_name=names.get(sid, "—"),
            worker_days=head.total if head.answerable else None,
            amount_total=amt.total if amt.answerable else None,
            deliveries=deliveries,
            open_disputes=int(dispute_counts.get(sid, 0)),
        )
        if mat:
            q = sum_quantity(evs, material=mat)
            if q.answerable and q.total is not None and q.unit is not None:
                roll.material_qty = q.total
                roll.material_unit = q.unit
                mat_units.add(q.unit)
                mat_sum += q.total
                mat_any = True
        rollups.append(roll)

    # Sort: most worker-days first (the busiest sites surface), then name.
    rollups.sort(key=lambda r: (-(r.worker_days or 0), r.site_name))

    wd = [r.worker_days for r in rollups if r.worker_days is not None]
    am = [r.amount_total for r in rollups if r.amount_total is not None]
    totals = PortfolioTotals(
        worker_days=round(sum(wd), 2) if wd else None,
        amount_total=round(sum(am), 2) if am else None,
        deliveries=sum(r.deliveries for r in rollups),
        open_disputes=sum(r.open_disputes for r in rollups),
        material_qty=round(mat_sum, 2) if (mat_any and len(mat_units) == 1) else None,
        material_unit=next(iter(mat_units)) if (mat_any and len(mat_units) == 1) else None,
    )

    parts: list[str] = [f"{len(visible)} sites"]
    if totals.worker_days is not None:
        parts.append(f"{totals.worker_days} worker-days")
    if mat and totals.material_qty is not None:
        parts.append(f"{totals.material_qty} {totals.material_unit} {mat}")
    if totals.amount_total is not None:
        parts.append(f"₹{totals.amount_total} billed/paid")
    if totals.open_disputes:
        parts.append(f"{totals.open_disputes} open disputes")
    summary = "; ".join(parts)

    return PortfolioOut(
        days=days,
        site_count=len(visible),
        material=mat,
        sites=rollups,
        totals=totals,
        summary=summary,
    )
