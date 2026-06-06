"""Deterministic forecasting API (Phase 3.3).

``GET /api/v1/forecast`` — the forward-looking brief: which materials are overdue
for reorder (learned cadence) and the cash-flow run-rate. Scoped exactly like the
other read surfaces (``effective_visible_site_ids``, homeowner blocked), latest-
version-wins via ``latest_event_clause``. Math is deterministic (``app.forecast``);
the LLM never produces a number here, and thin history abstains.
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
from app.forecast.forecast import cashflow_forecast, material_reorder_forecasts
from app.models import SiteEventModel, User, UserRole
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["forecast"])

_SPEND_TYPES = ("invoice_received", "payment_request")


class MaterialForecastOut(BaseModel):
    material: str
    unit: str
    deliveries: int
    total_qty: float
    avg_qty_per_delivery: float
    avg_interval_days: float
    last_on: date
    days_since_last: int
    expected_next_on: date
    overdue: bool
    assumptions: list[str] = []


class CashflowOut(BaseModel):
    answerable: bool
    spend_days: int
    total_spend: float
    daily_run_rate: float
    projected_next_30d: float
    assumptions: list[str] = []


class ForecastOut(BaseModel):
    site_id: UUID
    window_days: int
    reorder: list[MaterialForecastOut] = []
    overdue_count: int = 0
    materials_skipped_thin: int = 0
    cashflow: CashflowOut
    summary: str


@router.get("/forecast", response_model=ForecastOut)
async def forecast(
    site_id: UUID = Query(...),
    window_days: int = Query(60, ge=7, le=365),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ForecastOut:
    visible = await effective_visible_site_ids(session, user)
    if user.role is UserRole.homeowner or site_id not in visible:
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

    delivery_rows: list[tuple[date, str, float | None, str | None]] = []
    distinct_materials: set[tuple[str, str | None]] = set()
    spend_rows: list[tuple[date, float | None]] = []
    for e in rows:
        if e.event_type == "material_delivery":
            mat = (e.fields.get("material") or "").strip().lower()
            unit = e.fields.get("unit")
            qty = e.fields.get("quantity")
            delivery_rows.append((e.occurred_on, mat, _num(qty), unit))
            if mat:
                distinct_materials.add((mat, unit))
        elif e.event_type in _SPEND_TYPES:
            spend_rows.append((e.occurred_on, _num(e.fields.get("amount"))))

    reorder = material_reorder_forecasts(delivery_rows, today=today)
    cash = cashflow_forecast(spend_rows, today=today, window_days=window_days)

    # How many distinct materials had history too thin to forecast (visibility,
    # never a silent omission).
    forecast_keys = {(f.material, f.unit) for f in reorder}
    skipped = sum(
        1
        for (mat, _u) in {(m, None) for (m, _) in distinct_materials}
        if not any(fk[0] == mat for fk in forecast_keys)
    )

    overdue = [f for f in reorder if f.overdue]
    parts: list[str] = []
    if overdue:
        names = ", ".join(f"{f.material} (last {f.days_since_last}d ago)" for f in overdue[:3])
        plural = "s" if len(overdue) != 1 else ""
        parts.append(f"{len(overdue)} material{plural} overdue to reorder: {names}")
    if cash.answerable:
        parts.append(
            f"spending ≈ ₹{cash.daily_run_rate}/day (₹{cash.projected_next_30d} next 30d)"
        )
    summary = "; ".join(parts) if parts else "Nothing needs ordering and cash-flow looks steady."

    return ForecastOut(
        site_id=site_id,
        window_days=window_days,
        reorder=[MaterialForecastOut(**f.__dict__) for f in reorder],
        overdue_count=len(overdue),
        materials_skipped_thin=skipped,
        cashflow=CashflowOut(**cash.__dict__),
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
