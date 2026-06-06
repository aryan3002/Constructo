"""Standing Sentinel — absence + stuck-thing radar (Phase 3.1).

The frontier WhatsApp can never cross: reasoning about a message that *never
arrived*. The Sentinel notices what DIDN'T happen by learning each site's own
rhythm — no attendance today on a site that's usually active, an action item past
its due date, a material overdue for reorder against its learned cadence.

Detection-of-absence over a structured stream. The detector is **pure and
deterministic** (this module); the router feeds it primitives it pulled with the
usual scope. Honest-AI: every signal is grounded in the ledger, abstains on thin
history (an inactive site raises no false "you missed attendance"), and the
proactive one-nudge/day delivery is a separate concern (kept out of the read
endpoint so this stays side-effect-free and testable).

The milestone-drift forecaster is deliberately CUT (no WBS/schedule object — plan
§7); this is the absence + stuck-thing half only.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

# A site is "active" (so silence is meaningful) once it has attendance on at
# least this many distinct days in the lookback window.
MIN_ACTIVE_DAYS = 3
# Days past due before an overdue action item escalates from medium to high.
ACTION_ITEM_HIGH_AGE = 7


@dataclass
class Signal:
    kind: str  # attendance_absence | action_item_overdue | material_overdue
    severity: str  # high | medium | low
    message: str
    evidence_event_ids: list[str] = field(default_factory=list)


def is_active_site(distinct_attendance_days: int) -> bool:
    """Enough rhythm that an absent day is a real signal, not a quiet site."""
    return distinct_attendance_days >= MIN_ACTIVE_DAYS


def _action_item_severity(days_overdue: int) -> str:
    return "high" if days_overdue >= ACTION_ITEM_HIGH_AGE else "medium"


def build_signals(
    *,
    today: date,
    attendance_days: set[date],
    overdue_action_items: list[tuple[str, date]],
    overdue_materials: list[tuple[str, int, float]],
) -> list[Signal]:
    """Compose the radar from already-fetched primitives (DB-free → testable).

    - ``attendance_days``: distinct dates with an attendance event in the window.
    - ``overdue_action_items``: ``(title, due_on)`` for OPEN items past due.
    - ``overdue_materials``: ``(material, days_since_last, avg_interval)`` for
      cadence-overdue materials (from the 3.3 forecaster).
    """
    signals: list[Signal] = []

    # 1) Attendance absence — only on a site with an established rhythm.
    active_days = {d for d in attendance_days if d != today}
    if is_active_site(len(active_days)) and today not in attendance_days:
        signals.append(
            Signal(
                kind="attendance_absence",
                severity="high",
                message=(
                    "No attendance logged today on an active site "
                    f"(attendance on {len(active_days)} of the last days)."
                ),
            )
        )

    # 2) Overdue action items — escalate by age.
    for title, due_on in sorted(overdue_action_items, key=lambda t: t[1]):
        days_overdue = (today - due_on).days
        if days_overdue <= 0:
            continue
        plural = "s" if days_overdue != 1 else ""
        signals.append(
            Signal(
                kind="action_item_overdue",
                severity=_action_item_severity(days_overdue),
                message=f'"{title}" is {days_overdue} day{plural} overdue.',
            )
        )

    # 3) Material reorder overdue (cadence) — medium nudge.
    for material, days_since, avg_interval in overdue_materials:
        signals.append(
            Signal(
                kind="material_overdue",
                severity="medium",
                message=(
                    f"{material} not delivered in {days_since} days "
                    f"(usually every ~{round(avg_interval)}) — reorder?"
                ),
            )
        )

    order = {"high": 0, "medium": 1, "low": 2}
    signals.sort(key=lambda s: order.get(s.severity, 3))
    return signals
