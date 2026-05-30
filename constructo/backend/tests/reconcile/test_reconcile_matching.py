"""Golden cases for the pure reconciliation matcher (network-free)."""
from datetime import date
from uuid import uuid4

from app.reconcile.matching import (
    DeliveryEvent,
    InvoiceEvent,
    ReconcileStatus,
    draft_grn,
    normalize_text,
    reconcile,
)

SITE = uuid4()


def _delivery(**kw) -> DeliveryEvent:
    base = dict(
        id=uuid4(),
        site_id=SITE,
        occurred_on=date(2026, 5, 20),
        vendor="UltraTech Cement Pvt Ltd",
        material="cement",
        quantity=100.0,
        unit="bag",
        summary="100 bags cement aaye",
    )
    base.update(kw)
    return DeliveryEvent(**base)


def _invoice(**kw) -> InvoiceEvent:
    base = dict(
        id=uuid4(),
        site_id=SITE,
        occurred_on=date(2026, 5, 22),
        vendor="UltraTech Cement",
        material="cement",
        quantity=100.0,
        amount=40000.0,
        currency="INR",
        invoice_number="INV-1",
        summary="Invoice INV-1",
    )
    base.update(kw)
    return InvoiceEvent(**base)


# --- normalisation ----------------------------------------------------------


def test_normalize_strips_vendor_noise_and_case():
    assert normalize_text("UltraTech Cement Pvt Ltd") == normalize_text("ultratech cement")
    assert normalize_text("  Shree   Traders  ") == "shree"
    assert normalize_text(None) == ""


# --- matched ----------------------------------------------------------------


def test_matched_within_tolerance():
    items = reconcile([_delivery()], [_invoice(quantity=101.0)])
    assert len(items) == 1
    assert items[0].status is ReconcileStatus.matched
    assert items[0].amount_at_risk == 0.0
    assert items[0].reasons == []


def test_exact_match():
    items = reconcile([_delivery()], [_invoice()])
    assert items[0].status is ReconcileStatus.matched


# --- mismatch ---------------------------------------------------------------


def test_quantity_mismatch_small_amount_is_mismatch():
    # delivered 100, billed 105 on a small invoice -> under threshold -> mismatch
    items = reconcile(
        [_delivery(quantity=100.0)],
        [_invoice(quantity=105.0, amount=2100.0)],
    )
    assert items[0].status is ReconcileStatus.mismatch
    assert "quantity_variance" in items[0].reasons
    assert items[0].amount_at_risk > 0


def test_item_mismatch_flags_full_amount():
    items = reconcile(
        [_delivery(material="cement")],
        [_invoice(material="steel", amount=5000.0)],
    )
    assert items[0].status in (ReconcileStatus.mismatch, ReconcileStatus.needs_approval)
    assert "item_mismatch" in items[0].reasons


# --- needs approval (over threshold) ----------------------------------------


def test_large_overbill_needs_approval():
    # billed 150 vs delivered 100 on a 60k invoice -> ~20k at risk -> needs_approval
    items = reconcile(
        [_delivery(quantity=100.0)],
        [_invoice(quantity=150.0, amount=60000.0)],
    )
    assert items[0].status is ReconcileStatus.needs_approval
    assert items[0].amount_at_risk >= 10000.0


# --- missing proof ----------------------------------------------------------


def test_delivery_without_invoice_is_missing_proof():
    items = reconcile([_delivery()], [])
    assert items[0].status is ReconcileStatus.missing_proof
    assert items[0].reasons == ["no_invoice"]
    assert items[0].amount_at_risk == 0.0


def test_invoice_without_delivery_exposes_full_amount():
    items = reconcile([], [_invoice(amount=40000.0)])
    assert items[0].status is ReconcileStatus.missing_proof
    assert items[0].reasons == ["no_delivery"]
    assert items[0].amount_at_risk == 40000.0


# --- pairing rules ----------------------------------------------------------


def test_outside_date_window_does_not_pair():
    items = reconcile(
        [_delivery(occurred_on=date(2026, 5, 1))],
        [_invoice(occurred_on=date(2026, 5, 20))],
        window_days=7,
    )
    assert {it.status for it in items} == {ReconcileStatus.missing_proof}
    assert len(items) == 2


def test_different_vendor_does_not_pair():
    items = reconcile(
        [_delivery(vendor="ACC Cement")],
        [_invoice(vendor="UltraTech Cement")],
    )
    assert len(items) == 2
    assert all(it.status is ReconcileStatus.missing_proof for it in items)


def test_different_site_does_not_pair():
    other = uuid4()
    items = reconcile([_delivery(site_id=SITE)], [_invoice(site_id=other)])
    assert len(items) == 2
    assert all(it.status is ReconcileStatus.missing_proof for it in items)


def test_greedy_pairs_closest_in_time():
    d = _delivery(occurred_on=date(2026, 5, 20))
    near = _invoice(occurred_on=date(2026, 5, 21), invoice_number="NEAR")
    far = _invoice(occurred_on=date(2026, 5, 25), invoice_number="FAR")
    items = reconcile([d], [near, far])
    matched = [it for it in items if it.status is ReconcileStatus.matched]
    assert len(matched) == 1
    assert matched[0].invoice is not None
    assert matched[0].invoice.invoice_number == "NEAR"
    # the far invoice is left unmatched -> missing proof
    assert any(it.status is ReconcileStatus.missing_proof for it in items)


def test_ordering_is_exceptions_first():
    items = reconcile(
        [
            _delivery(id=uuid4(), quantity=100.0),
            _delivery(id=uuid4(), quantity=100.0, occurred_on=date(2026, 6, 1)),
        ],
        [
            _invoice(id=uuid4(), quantity=100.0),  # matched
            _invoice(
                id=uuid4(),
                quantity=150.0,
                amount=60000.0,
                occurred_on=date(2026, 6, 2),
            ),  # needs_approval
        ],
    )
    assert items[0].status is ReconcileStatus.needs_approval


# --- GRN draft --------------------------------------------------------------


def test_grn_draft_fields_prefilled():
    d = _delivery(quantity=100.0, unit="bag", vendor="UltraTech", material="cement")
    grn = draft_grn(d)
    assert grn.delivery_event_id == d.id
    assert grn.reference.startswith("GRN-")
    assert "UltraTech" in grn.note
    assert "cement" in grn.note
    assert "100 bag" in grn.note


def test_grn_draft_handles_missing_quantity():
    grn = draft_grn(_delivery(quantity=None, unit=None))
    assert "quantity not recorded" in grn.note
