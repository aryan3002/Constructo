"""Operational detectors: site silence, eroding crew, vendor over-reliance, and
recurring unresolved issues. Pure functions over EventRow lists; no LLM, no DB.
"""
from __future__ import annotations

from collections import Counter
from datetime import date

from app.intelligence.detectors.base import EventRow, Finding

IDLE_GAP_DAYS = 5
EROSION_MIN_RUN = 5
VENDOR_WINDOW_DAYS = 30
VENDOR_THRESHOLD = 0.8
VENDOR_MIN_DELIVERIES = 3
ISSUE_WINDOW_DAYS = 30
ISSUE_MIN_COUNT = 3

# Recurring-issue signatures (Hindi/Hinglish + English substrings).
_ISSUE_KEYWORDS = (
    "leak", "seepage", "crack", "damp", "blockage", "short", "broken",
    "leakage", "paani", "dikkat",
)


def _num(v) -> float | None:
    return float(v) if isinstance(v, (int, float)) else None


def idle_gap(
    events: list[EventRow], *, today: date, gap_days: int = IDLE_GAP_DAYS
) -> list[Finding]:
    """Flag a site with no events of any kind for ``gap_days`` or more.

    Empty event history is NOT flagged (the site may simply not have started)."""
    if not events:
        return []
    latest = max(events, key=lambda e: e.occurred_on)
    gap = (today - latest.occurred_on).days
    if gap < gap_days:
        return []
    severity = "high" if gap >= gap_days * 2 else "medium"
    return [
        Finding(
            finding_type="idle_gap",
            severity=severity,
            headline=f"No site activity logged for {gap} days",
            detail=f"Last recorded event was {gap} days ago ({latest.occurred_on.isoformat()}).",
            evidence_event_ids=[latest.id],
        )
    ]


def attendance_erosion(
    events: list[EventRow], *, today: date, min_run: int = EROSION_MIN_RUN
) -> list[Finding]:
    """Flag a strictly-decreasing daily-headcount run of at least ``min_run`` days."""
    daily: dict[date, EventRow] = {}
    for e in events:
        if e.event_type != "attendance" or _num((e.fields or {}).get("headcount")) is None:
            continue
        # latest event for a given day wins
        if e.occurred_on not in daily or e.id > daily[e.occurred_on].id:
            daily[e.occurred_on] = e
    series = [daily[d] for d in sorted(daily)]
    if len(series) < min_run:
        return []
    # trailing strictly-decreasing run length (in points)
    run = 1
    for i in range(len(series) - 1, 0, -1):
        if series[i].fields["headcount"] < series[i - 1].fields["headcount"]:
            run += 1
        else:
            break
    if run < min_run:
        return []
    tail = series[-run:]
    first, last = tail[0].fields["headcount"], tail[-1].fields["headcount"]
    return [
        Finding(
            finding_type="attendance_erosion",
            severity="medium",
            headline=f"Crew shrinking {run} days running ({int(first)} → {int(last)})",
            detail=(
                f"Daily headcount has fallen every day for {run} captures, "
                f"from {int(first)} to {int(last)}."
            ),
            evidence_event_ids=[e.id for e in tail],
        )
    ]


def vendor_concentration(
    events: list[EventRow],
    *,
    today: date,
    days: int = VENDOR_WINDOW_DAYS,
    threshold: float = VENDOR_THRESHOLD,
    min_deliveries: int = VENDOR_MIN_DELIVERIES,
) -> list[Finding]:
    """Flag when one vendor supplies >= ``threshold`` of recent deliveries."""
    recent = [
        e for e in events
        if e.event_type == "material_delivery"
        and (today - e.occurred_on).days <= days
        and (e.fields or {}).get("vendor")
    ]
    if len(recent) < min_deliveries:
        return []
    counts = Counter(str(e.fields["vendor"]) for e in recent)
    vendor, top = counts.most_common(1)[0]
    share = top / len(recent)
    if share < threshold:
        return []
    return [
        Finding(
            finding_type="vendor_concentration",
            severity="low",
            headline=f"{share:.0%} of recent deliveries are from {vendor}",
            detail=(
                f"{top} of the last {len(recent)} deliveries came from {vendor}. "
                f"Single-vendor reliance is a supply risk."
            ),
            evidence_event_ids=[e.id for e in recent if str(e.fields["vendor"]) == vendor],
        )
    ]


def _issue_signature(event: EventRow) -> str | None:
    blob = f"{event.summary} {(event.fields or {}).get('description', '')}".lower()
    for kw in _ISSUE_KEYWORDS:
        if kw in blob:
            return kw
    return None


def repeat_issue_pattern(
    events: list[EventRow],
    *,
    today: date,
    days: int = ISSUE_WINDOW_DAYS,
    min_count: int = ISSUE_MIN_COUNT,
) -> list[Finding]:
    """Flag the same issue keyword recurring ``min_count``+ times within ``days``."""
    by_sig: dict[str, list[EventRow]] = {}
    for e in events:
        if e.event_type != "issue" or (today - e.occurred_on).days > days:
            continue
        sig = _issue_signature(e)
        if sig:
            by_sig.setdefault(sig, []).append(e)
    out: list[Finding] = []
    for sig, evs in by_sig.items():
        if len(evs) < min_count:
            continue
        out.append(
            Finding(
                finding_type="repeat_issue_pattern",
                severity="high",
                headline=f"'{sig}' reported {len(evs)} times this month — recurring, unresolved",
                detail=(
                    f"The same issue ('{sig}') has been raised {len(evs)} times in "
                    f"{days} days. It may not be getting fixed."
                ),
                evidence_event_ids=[e.id for e in evs],
            )
        )
    return out
