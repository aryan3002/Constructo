"""The tiered tool registry IS the membrane — enforced by module shape."""
from datetime import date
from uuid import uuid4

from app.agent.tiers import (
    GREEN_TOOLS,
    Proposal,
    ToolTier,
    propose_capture,
    propose_missing_proof,
    propose_money,
)
from app.reconcile.matching import (
    DeliveryEvent,
    InvoiceEvent,
    ReconcileItem,
    ReconcileStatus,
)


def _delivery(site_id, vendor="ACC", material="cement", qty=100.0):
    return DeliveryEvent(
        id=uuid4(), site_id=site_id, occurred_on=date.today(),
        vendor=vendor, material=material, quantity=qty, unit="bori",
    )


def _invoice(site_id, vendor="ACC", material="cement", qty=100.0, amount=50000.0):
    return InvoiceEvent(
        id=uuid4(), site_id=site_id, occurred_on=date.today(), vendor=vendor,
        material=material, quantity=qty, amount=amount, currency="INR", invoice_number="A1",
    )


def test_every_registered_tool_is_green():
    # The agent-callable registry contains ONLY read/draft tools — no commit/money.
    assert GREEN_TOOLS, "expected at least one green tool registered"
    assert all(t.tier is ToolTier.green for t in GREEN_TOOLS.values())


def test_no_homeowner_send_tool_exists():
    # The membrane is structural: nothing in the registry reaches the homeowner.
    assert not any("homeowner" in name.lower() for name in GREEN_TOOLS)
    assert not any("publish" in name.lower() for name in GREEN_TOOLS)


def test_propose_capture_is_a_proposal_not_a_commit():
    p = propose_capture(
        "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"},
        "50 bori cement — confirm?",
    )
    assert isinstance(p, Proposal)
    assert p.tier is ToolTier.commit
    assert p.kind == "capture"
    assert p.committable is True
    # A proposal is pure data — it carries NO committed event id.
    assert p.evidence_event_ids == []


def test_money_proposal_with_bound_evidence_is_committable():
    site_id = uuid4()
    d, i = _delivery(site_id), _invoice(site_id)
    match = ReconcileItem(
        status=ReconcileStatus.matched, vendor="ACC", item="cement", site_id=site_id,
        delivery=d, invoice=i, amount_at_risk=0.0, reasons=[],
    )
    p = propose_money(
        "approval", {"vendor": "ACC", "amount": 50000},
        "Approve ₹50,000 to ACC — delivery + invoice match.", evidence=[match],
    )
    assert p.tier is ToolTier.money
    assert p.kind == "capture"
    assert p.committable is True
    assert str(d.id) in p.evidence_event_ids and str(i.id) in p.evidence_event_ids


def test_money_proposal_without_evidence_is_missing_proof_only():
    # No bound reconcile match → the ONLY legal output is a tracked missing_proof
    # decision proposal. Never a committable money card.
    p = propose_money(
        "approval", {"vendor": "ACC", "amount": 50000},
        "Approve ₹50,000 to ACC.", evidence=[],
    )
    assert p.kind == "missing_proof"
    assert p.committable is False
    assert p.capture_type == "decision"
    assert p.evidence_event_ids == []


def test_missing_proof_is_not_committable():
    p = propose_missing_proof("payment_request", {"amount": 9000}, "No bill on file.")
    assert p.committable is False
    assert p.capture_type == "decision"
