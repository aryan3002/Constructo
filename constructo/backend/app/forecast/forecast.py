"""Deterministic forecasting (Phase 3.3) — the forward-looking half of the brain.

The honesty rule mirrors aggregation (2.2): **the model computes, the LLM only
narrates.** Every figure here is arithmetic over the structured ledger; nothing
is invented. Where the history is too thin to be honest, we ABSTAIN rather than
guess, and every projection carries its ASSUMPTIONS as chips (so the owner sees
*why* and can distrust it on sight).

Two deterministic signals, both off the same typed ``SiteEvent`` stream:

  - **Material reorder forecast** — cadence-based, not consumption-based (we have
    deliveries, not a usage meter, so we are honest about that). From the
    delivery time-series per (material, canonical unit) we compute the average
    interval and quantity, then flag a material *overdue* for reorder when the
    gap since the last delivery exceeds its own learned cadence.
  - **Cash-flow run-rate** — average daily spend (invoices + payment requests)
    over the window, projected forward; honest that it is a straight-line
    extrapolation, not a committed schedule.

No new tables — pure functions over rows the router pulls with the usual scope +
``latest_event_clause`` (latest-version-wins, so a superseded event never
double-counts).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.agent.aggregate import canon_unit

# Minimum deliveries before a cadence is honest (need ≥2 to measure ONE interval;
# we require 3 so the average isn't a single noisy gap).
MIN_DELIVERIES_FOR_CADENCE = 3
# Slack before "overdue": you're not late the instant you cross the average.
OVERDUE_TOLERANCE = 1.15
# Minimum distinct spend days before a run-rate is honest.
MIN_SPEND_DAYS_FOR_RUNRATE = 3


@dataclass
class MaterialForecast:
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
    assumptions: list[str] = field(default_factory=list)


@dataclass
class CashflowForecast:
    answerable: bool
    spend_days: int
    total_spend: float
    daily_run_rate: float
    projected_next_30d: float
    assumptions: list[str] = field(default_factory=list)


def _round(x: float) -> float:
    return round(x, 2)


def material_reorder_forecasts(
    rows: list[tuple[date, str, float | None, str | None]],
    *,
    today: date,
) -> list[MaterialForecast]:
    """``rows`` = ``(occurred_on, material, quantity, unit)`` for delivery events.

    Returns one forecast per (material, canonical unit) with enough history,
    sorted overdue-first then by soonest expected reorder. Materials with thin
    history are omitted (abstain > guess) — the router reports how many were
    skipped so the omission is visible, never silent.
    """
    by_key: dict[tuple[str, str], list[tuple[date, float]]] = {}
    for occurred_on, material, qty, unit in rows:
        mat = (material or "").strip().lower()
        cu = canon_unit(unit)
        if not mat or cu is None or qty is None:
            continue
        by_key.setdefault((mat, cu), []).append((occurred_on, float(qty)))

    out: list[MaterialForecast] = []
    for (mat, cu), series in by_key.items():
        if len(series) < MIN_DELIVERIES_FOR_CADENCE:
            continue
        series.sort(key=lambda r: r[0])
        dates = [d for d, _ in series]
        qtys = [q for _, q in series]
        # Average gap between consecutive deliveries.
        gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
        gaps = [g for g in gaps if g > 0]  # collapse same-day repeat deliveries
        if not gaps:
            continue
        avg_interval = sum(gaps) / len(gaps)
        avg_qty = sum(qtys) / len(qtys)
        last_on = dates[-1]
        days_since = (today - last_on).days
        # Expected next = last delivery + the learned cadence.
        expected_next = date.fromordinal(last_on.toordinal() + round(avg_interval))
        overdue = days_since > avg_interval * OVERDUE_TOLERANCE

        out.append(
            MaterialForecast(
                material=mat,
                unit=cu,
                deliveries=len(series),
                total_qty=_round(sum(qtys)),
                avg_qty_per_delivery=_round(avg_qty),
                avg_interval_days=_round(avg_interval),
                last_on=last_on,
                days_since_last=days_since,
                expected_next_on=expected_next,
                overdue=overdue,
                assumptions=[
                    f"based on {len(series)} past deliveries",
                    f"avg every {_round(avg_interval)} days, {_round(avg_qty)} {cu} each",
                    "cadence-based (delivery rhythm), not measured consumption",
                ],
            )
        )

    out.sort(key=lambda f: (not f.overdue, f.expected_next_on))
    return out


def cashflow_forecast(
    rows: list[tuple[date, float | None]],
    *,
    today: date,
    window_days: int,
) -> CashflowForecast:
    """``rows`` = ``(occurred_on, amount)`` for spend events (invoice / payment).

    Straight-line run-rate over the window. Abstains when too few distinct spend
    days to be honest.
    """
    amounts_by_day: dict[date, float] = {}
    for occurred_on, amount in rows:
        if amount is None:
            continue
        amounts_by_day[occurred_on] = amounts_by_day.get(occurred_on, 0.0) + float(amount)

    spend_days = len(amounts_by_day)
    if spend_days < MIN_SPEND_DAYS_FOR_RUNRATE:
        return CashflowForecast(
            answerable=False,
            spend_days=spend_days,
            total_spend=_round(sum(amounts_by_day.values())),
            daily_run_rate=0.0,
            projected_next_30d=0.0,
            assumptions=["not enough spend history to project honestly"],
        )

    total = sum(amounts_by_day.values())
    # Run-rate over the elapsed span (first spend → today), not just active days,
    # so idle days correctly dilute the rate.
    first_day = min(amounts_by_day)
    elapsed = max((today - first_day).days, 1)
    daily = total / elapsed
    return CashflowForecast(
        answerable=True,
        spend_days=spend_days,
        total_spend=_round(total),
        daily_run_rate=_round(daily),
        projected_next_30d=_round(daily * 30),
        assumptions=[
            f"straight-line from ₹{_round(total)} over {elapsed} days",
            f"across {spend_days} days with recorded spend",
            "extrapolation, not a committed payment schedule",
        ],
    )
