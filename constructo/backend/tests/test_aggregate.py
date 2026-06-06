"""Deterministic aggregation reducers (2.2) — exact totals, unit canonicalisation,
and abstain/caveat on unconfirmed contributors (the honesty fix)."""
from app.agent.aggregate import (
    EventLike,
    canon_unit,
    reducer_for,
    sum_amount,
    sum_headcount,
    sum_quantity,
)


def ev(id, etype, fields, conf=1.0):
    return EventLike(id=id, event_type=etype, fields=fields, confidence=conf)


def test_canon_unit_aliases():
    assert canon_unit("bag") == "bori"
    assert canon_unit("Bags") == "bori"
    assert canon_unit("tonne") == "ton"
    assert canon_unit(None) is None


def test_sum_quantity_canonicalises_units():
    events = [
        ev("1", "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        ev("2", "material_delivery", {"material": "cement", "quantity": 40, "unit": "bag"}),
    ]
    r = sum_quantity(events, material="cement")
    assert r.answerable
    assert r.total == 90  # bag + bori summed under one canonical unit
    assert r.unit == "bori"
    assert r.contributors == 2
    assert set(r.evidence_event_ids) == {"1", "2"}


def test_sum_quantity_filters_material():
    events = [
        ev("1", "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        ev("2", "material_delivery", {"material": "steel", "quantity": 2, "unit": "ton"}),
    ]
    r = sum_quantity(events, material="cement")
    assert r.total == 50
    assert r.evidence_event_ids == ["1"]


def test_sum_quantity_excludes_null_unit_or_qty_as_unconfirmed():
    events = [
        ev("1", "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        ev("2", "material_delivery", {"material": "cement", "quantity": None, "unit": "bori"}),
        ev("3", "material_delivery", {"material": "cement", "quantity": 30, "unit": None}),
    ]
    r = sum_quantity(events, material="cement")
    assert r.total == 50
    assert r.contributors == 1
    assert r.unconfirmed == 2  # the null-qty and null-unit rows are surfaced, not summed


def test_sum_quantity_multi_unit_returns_breakdown_not_bogus_total():
    events = [
        ev("1", "material_delivery", {"material": "x", "quantity": 50, "unit": "bori"}),
        ev("2", "material_delivery", {"material": "x", "quantity": 2, "unit": "ton"}),
    ]
    r = sum_quantity(events)
    assert r.answerable
    assert r.total is None  # can't add bori + ton
    assert r.breakdown == {"bori": 50, "ton": 2}


def test_sum_quantity_abstains_when_all_unconfirmed():
    events = [
        ev("1", "material_delivery", {"material": "cement", "quantity": None, "unit": "bori"})
    ]
    r = sum_quantity(events, material="cement")
    assert not r.answerable
    assert r.abstain_reason


def test_low_confidence_is_unconfirmed():
    events = [
        ev("1", "attendance", {"headcount": 20}, conf=0.9),
        ev("2", "attendance", {"headcount": 12}, conf=0.3),  # below floor
    ]
    r = sum_headcount(events)
    assert r.total == 20
    assert r.unconfirmed == 1


def test_sum_amount_over_invoices_and_payments():
    events = [
        ev("1", "invoice_received", {"amount": 85000}),
        ev("2", "payment_request", {"amount": 15000}),
        ev("3", "attendance", {"headcount": 5}),  # ignored
    ]
    r = sum_amount(events)
    assert r.total == 100000
    assert r.unit == "INR"
    assert set(r.evidence_event_ids) == {"1", "2"}


def test_reducer_routing():
    assert reducer_for("material_delivery") == "sum_quantity"
    assert reducer_for("attendance") == "sum_headcount"
    assert reducer_for("invoice_received") == "sum_amount"
    assert reducer_for("progress_update") is None
