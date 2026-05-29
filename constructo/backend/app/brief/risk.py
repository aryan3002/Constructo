"""Risk detection over a single site's events for one day.

Pure, side-effect-free functions over ``list[SiteEvent]``. Each detected risk is
a plain ``dict``::

    {
        "site_id": UUID,
        "kind": str,            # labor_shortfall | unverified_invoice
                                # | pending_approval | data_quality
        "severity": str,        # low | medium | high
        "message": str,         # short, human-readable
        "evidence_event_ids": list[UUID],  # always present in the input
    }

The detectors lead with exceptions, never invent data, and every risk carries
``evidence_event_ids`` that are guaranteed to exist among the supplied events.
"""
from __future__ import annotations

from uuid import UUID

from app.contracts.events import EventType, SiteEvent

# Confidence below this (or needs_clarification) is a data-quality concern. Kept
# in sync with the extraction CLARIFY_THRESHOLD.
LOW_CONFIDENCE_THRESHOLD = 0.6

# A day-over-day attendance drop of this fraction or more is flagged when no
# explicit per-site baseline is available.
DAY_OVER_DAY_DROP_FRACTION = 0.3


def _headcount(event: SiteEvent) -> int | None:
    value = (event.fields or {}).get("headcount")
    if isinstance(value, bool):  # bool is an int subclass; treat as missing
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


def _total_headcount(events: list[SiteEvent]) -> tuple[int | None, list[UUID]]:
    """Sum reported headcounts across attendance events.

    Returns ``(total, evidence_ids)`` where ``total`` is ``None`` if no
    attendance event carried a numeric headcount.
    """
    total: int | None = None
    evidence: list[UUID] = []
    for ev in events:
        if ev.event_type is not EventType.attendance:
            continue
        hc = _headcount(ev)
        if hc is None:
            continue
        total = hc if total is None else total + hc
        evidence.append(ev.id)
    return total, evidence


def _vendor(event: SiteEvent) -> str | None:
    vendor = (event.fields or {}).get("vendor")
    if isinstance(vendor, str) and vendor.strip():
        return vendor.strip().lower()
    return None


def _labor_shortfall(
    events: list[SiteEvent],
    site_id: UUID,
    expected_headcount: int | None,
    prev_events: list[SiteEvent] | None,
) -> list[dict]:
    today_total, evidence = _total_headcount(events)
    if today_total is None or not evidence:
        return []

    # 1) Explicit per-site baseline: flag when present headcount is below it.
    if expected_headcount is not None and expected_headcount > 0:
        if today_total >= expected_headcount:
            return []
        ratio = today_total / expected_headcount
        if ratio <= 0.5:
            severity = "high"
        elif ratio <= 0.8:
            severity = "medium"
        else:
            severity = "low"
        return [
            {
                "site_id": site_id,
                "kind": "labor_shortfall",
                "severity": severity,
                "message": (
                    f"Attendance {today_total} below expected {expected_headcount}"
                ),
                "evidence_event_ids": evidence,
            }
        ]

    # 2) No baseline: flag only a large day-over-day drop.
    if prev_events:
        prev_total, _ = _total_headcount(prev_events)
        if prev_total and prev_total > 0:
            drop = (prev_total - today_total) / prev_total
            if drop >= DAY_OVER_DAY_DROP_FRACTION:
                severity = "high" if drop >= 0.5 else "medium"
                return [
                    {
                        "site_id": site_id,
                        "kind": "labor_shortfall",
                        "severity": severity,
                        "message": (
                            f"Attendance dropped from {prev_total} to {today_total} "
                            f"day-over-day"
                        ),
                        "evidence_event_ids": evidence,
                    }
                ]
    return []


def _unverified_invoices(events: list[SiteEvent], site_id: UUID) -> list[dict]:
    deliveries = [e for e in events if e.event_type is EventType.material_delivery]
    delivery_vendors = {_vendor(e) for e in deliveries}
    has_unkeyed_delivery = None in delivery_vendors and len(deliveries) > 0

    risks: list[dict] = []
    for inv in events:
        if inv.event_type is not EventType.invoice_received:
            continue
        vendor = _vendor(inv)
        matched = False
        if vendor is not None:
            matched = vendor in delivery_vendors
        elif has_unkeyed_delivery:
            # Invoice has no vendor but a delivery without a vendor exists the
            # same day; treat as plausibly matched rather than over-flagging.
            matched = True
        if not matched:
            risks.append(
                {
                    "site_id": site_id,
                    "kind": "unverified_invoice",
                    "severity": "high",
                    "message": (
                        "Invoice received with no matching delivery"
                        + (f" from {inv.fields.get('vendor')}" if vendor else "")
                    ),
                    "evidence_event_ids": [inv.id],
                }
            )
    return risks


def _pending_approvals(events: list[SiteEvent], site_id: UUID) -> list[dict]:
    pending = [
        e
        for e in events
        if e.event_type in (EventType.payment_request, EventType.approval)
    ]
    if not pending:
        return []
    return [
        {
            "site_id": site_id,
            "kind": "pending_approval",
            "severity": "medium",
            "message": f"{len(pending)} pending approval/payment request(s)",
            "evidence_event_ids": [e.id for e in pending],
        }
    ]


def _data_quality(events: list[SiteEvent], site_id: UUID) -> list[dict]:
    suspect = [
        e
        for e in events
        if e.needs_clarification or e.confidence < LOW_CONFIDENCE_THRESHOLD
    ]
    if not suspect:
        return []
    return [
        {
            "site_id": site_id,
            "kind": "data_quality",
            "severity": "low",
            "message": f"{len(suspect)} event(s) need clarification or are low-confidence",
            "evidence_event_ids": [e.id for e in suspect],
        }
    ]


def detect_risks(
    events: list[SiteEvent],
    *,
    site_id: UUID,
    expected_headcount: int | None = None,
    prev_events: list[SiteEvent] | None = None,
) -> list[dict]:
    """Detect all risks for one site's events on one day.

    Args:
        events: the site's events for the brief day.
        site_id: the site these events belong to (stamped on every risk).
        expected_headcount: optional per-site attendance baseline. When given,
            labor shortfall is flagged relative to it; otherwise only a large
            day-over-day drop (vs ``prev_events``) is flagged.
        prev_events: optional prior-day events used for the day-over-day drop
            heuristic when no baseline is available.

    Returns a list of risk dicts (see module docstring).
    """
    risks: list[dict] = []
    risks.extend(_labor_shortfall(events, site_id, expected_headcount, prev_events))
    risks.extend(_unverified_invoices(events, site_id))
    risks.extend(_pending_approvals(events, site_id))
    risks.extend(_data_quality(events, site_id))
    return risks


# Severity ordering for ranking top risks (highest first).
_SEVERITY_RANK = {"high": 3, "medium": 2, "low": 1}


def rank_risks(risks: list[dict], limit: int = 3) -> list[dict]:
    """Return the top ``limit`` risks, highest severity first (stable)."""
    ordered = sorted(
        risks, key=lambda r: _SEVERITY_RANK.get(r.get("severity", "low"), 0), reverse=True
    )
    return ordered[:limit]
