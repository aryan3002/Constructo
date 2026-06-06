"""Deterministic aggregation layer (Ask-the-Project, 2.2) — the honesty fix.

The LLM (or a deterministic parser) only *routes* a question to a reducer; the
**number is always computed here, in Python, never by a model**. Every total is
auditable via ``evidence_event_ids``, units are canonicalised so "bag" and "bori"
sum together, and contributors that are low-confidence or missing the required
field are **excluded and surfaced as a caveat** (*"40 bori confirmed + 2
deliveries with no quantity recorded"*) rather than silently folded in or
invented. This is what lets numbers be exposed honestly on a still-noisy ledger.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# A contributor below this confidence is treated as unconfirmed (counted, not summed).
CONFIDENCE_FLOOR = 0.5

# Canonical unit map so synonyms aggregate together (cement bag == bori).
_UNIT_CANON = {
    "bag": "bori", "bags": "bori", "bori": "bori", "bora": "bori", "boriyan": "bori",
    "ton": "ton", "tonne": "ton", "tonnes": "ton", "tons": "ton",
    "kg": "kg", "kgs": "kg", "kilo": "kg", "kilos": "kg",
    "nos": "nos", "no": "nos", "piece": "nos", "pieces": "nos", "pcs": "nos",
    "truck": "truck", "trucks": "truck", "trip": "trip", "trips": "trip",
    "cft": "cft", "sqft": "sqft", "bundle": "bundle", "bundles": "bundle",
}


def canon_unit(unit: str | None) -> str | None:
    if not unit:
        return None
    return _UNIT_CANON.get(str(unit).strip().lower(), str(unit).strip().lower())


@dataclass
class EventLike:
    """The minimal shape a reducer needs (decoupled from the ORM for testing)."""

    id: str
    event_type: str
    fields: dict
    confidence: float


@dataclass
class AggregateResult:
    answerable: bool
    metric: str  # "sum_quantity" | "sum_headcount" | "sum_amount" | "none"
    total: float | None = None
    unit: str | None = None
    # When contributions span multiple canonical units we can't add (bori vs ton),
    # we return per-unit subtotals instead of one bogus total.
    breakdown: dict[str, float] = field(default_factory=dict)
    evidence_event_ids: list[str] = field(default_factory=list)
    contributors: int = 0
    unconfirmed: int = 0  # low-confidence / missing-field events we did NOT sum
    abstain_reason: str | None = None


def _num(v) -> float | None:
    return float(v) if isinstance(v, (int, float)) else None


def _confirmed(ev: EventLike, required: str) -> bool:
    return ev.confidence >= CONFIDENCE_FLOOR and _num(ev.fields.get(required)) is not None


def sum_quantity(events: list[EventLike], *, material: str | None = None) -> AggregateResult:
    """SUM material_delivery quantity, grouped by canonical unit. A contributor
    with a null quantity OR null unit is unconfirmed (surfaced, not summed)."""
    rows = [e for e in events if e.event_type == "material_delivery"]
    if material:
        m = material.lower()
        rows = [e for e in rows if m in str(e.fields.get("material") or "").lower()]
    by_unit: dict[str, float] = {}
    evidence: list[str] = []
    unconfirmed = 0
    for e in rows:
        qty = _num(e.fields.get("quantity"))
        unit = canon_unit(e.fields.get("unit"))
        if qty is None or unit is None or e.confidence < CONFIDENCE_FLOOR:
            unconfirmed += 1
            continue
        by_unit[unit] = by_unit.get(unit, 0.0) + qty
        evidence.append(e.id)
    if not by_unit:
        return AggregateResult(
            answerable=False, metric="sum_quantity", unconfirmed=unconfirmed,
            abstain_reason="no confirmed quantities" if rows else "no matching deliveries",
        )
    total = sum(by_unit.values()) if len(by_unit) == 1 else None
    unit = next(iter(by_unit)) if len(by_unit) == 1 else None
    return AggregateResult(
        answerable=True, metric="sum_quantity", total=total, unit=unit,
        breakdown=by_unit, evidence_event_ids=evidence,
        contributors=len(evidence), unconfirmed=unconfirmed,
    )


def sum_headcount(events: list[EventLike]) -> AggregateResult:
    """SUM attendance headcount across the matched window."""
    rows = [e for e in events if e.event_type == "attendance"]
    total = 0.0
    evidence: list[str] = []
    unconfirmed = 0
    for e in rows:
        head = _num(e.fields.get("headcount"))
        if head is None or e.confidence < CONFIDENCE_FLOOR:
            unconfirmed += 1
            continue
        total += head
        evidence.append(e.id)
    if not evidence:
        return AggregateResult(
            answerable=False, metric="sum_headcount", unconfirmed=unconfirmed,
            abstain_reason="no confirmed attendance" if rows else "no attendance logged",
        )
    return AggregateResult(
        answerable=True, metric="sum_headcount", total=total, unit="worker-days",
        evidence_event_ids=evidence, contributors=len(evidence), unconfirmed=unconfirmed,
    )


def sum_amount(events: list[EventLike]) -> AggregateResult:
    """SUM invoice/payment amount (₹) across the matched window."""
    rows = [e for e in events if e.event_type in ("invoice_received", "payment_request")]
    total = 0.0
    evidence: list[str] = []
    unconfirmed = 0
    for e in rows:
        amt = _num(e.fields.get("amount"))
        if amt is None or e.confidence < CONFIDENCE_FLOOR:
            unconfirmed += 1
            continue
        total += amt
        evidence.append(e.id)
    if not evidence:
        return AggregateResult(
            answerable=False, metric="sum_amount", unconfirmed=unconfirmed,
            abstain_reason="no confirmed amounts" if rows else "no invoices or payments",
        )
    return AggregateResult(
        answerable=True, metric="sum_amount", total=total, unit="INR",
        evidence_event_ids=evidence, contributors=len(evidence), unconfirmed=unconfirmed,
    )


# Which reducer answers which event type (deterministic routing).
def reducer_for(event_type: str):
    return {
        "material_delivery": "sum_quantity",
        "attendance": "sum_headcount",
        "invoice_received": "sum_amount",
        "payment_request": "sum_amount",
    }.get(event_type)
