"""Phase C end-to-end integration tests — the wired loop, span-tested.

Network-free: FakeLLMClient drives extraction and the embeddings client falls
back to FakeEmbeddings (no creds); sweeps take an explicit now/today.

Narrative covered:
  1. A (Hinglish) WhatsApp message is ingested -> extracted to a SiteEvent ->
     auto-indexed by the Phase C hook -> found by the search endpoint.
  2. A delivery + a MISMATCHING invoice -> the reconcile endpoint flags it ->
     "hold payment" creates a B0 Decision routed to the owner.
  3. An overdue homeowner-question decision -> run_sla_sweep escalates it.
  4. A near-expiry permit -> run_permit_sweep raises an alert decision.
"""
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select

from app.approvals.sla import run_sla_sweep
from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.extraction.worker import handle_ingested
from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    EventEmbedding,
    Permit,
    PermitStatus,
    RawMessageModel,
    SiteEventModel,
    UserRole,
    WhatsappGroup,
)
from app.permits.alerts import run_permit_sweep


def _session_factory(db_session):
    """Wrap the rolled-back test session so a callable reuses it (conftest join mode)."""

    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _event(site_id, event_type, summary, fields, occurred_on):
    return SiteEventModel(
        site_id=site_id,
        event_type=event_type,
        occurred_on=occurred_on,
        summary=summary,
        fields=fields,
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )


# --------------------------------------------------------------------------- #
# 1. ingest -> extract -> index -> search
# --------------------------------------------------------------------------- #
async def test_e2e_message_extracted_indexed_and_searchable(db_session, factory, client):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    group = WhatsappGroup(
        company_id=company.id,
        site_id=site.id,
        external_group_id="grp-e2e",
        source="baileys",
        label="Site crew",
    )
    msg = RawMessageModel(
        source="baileys",
        external_group_id="grp-e2e",
        sender_id="sup-1",
        media_type="text",
        text="ACC se 50 bags cement delivered",  # Hinglish site message
        sent_at=datetime(2026, 5, 28, 9, 0),
        raw={},
    )
    db_session.add_all([group, msg])
    await db_session.flush()

    # Extraction runs (sync) and the Phase C hook indexes the new event.
    ids = await handle_ingested(
        msg.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert len(ids) == 1
    event = await db_session.get(SiteEventModel, ids[0])
    assert event.event_type == "material_delivery"

    emb = (
        await db_session.execute(
            select(EventEmbedding).where(EventEmbedding.site_event_id == ids[0])
        )
    ).scalar_one_or_none()
    assert emb is not None  # indexing hook fired

    resp = await client.post("/api/v1/search", json={"q": "cement"}, headers=_auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["answerable"] is True
    assert any(h["event_id"] == str(ids[0]) for h in body["hits"])


# --------------------------------------------------------------------------- #
# 2. mismatch -> reconcile flags -> hold payment creates a decision
# --------------------------------------------------------------------------- #
async def test_e2e_invoice_mismatch_flagged_and_hold_payment_creates_decision(
    db_session, factory, client
):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    delivery = _event(
        site.id,
        "material_delivery",
        "100 bags cement from ACC",
        {"material": "cement", "quantity": 100, "unit": "bags", "vendor": "ACC Limited"},
        date(2026, 5, 27),
    )
    invoice = _event(
        site.id,
        "invoice_received",
        "ACC invoice 120 bags Rs 72000",
        {
            "vendor": "ACC Limited",
            "material": "cement",
            "quantity": 120,
            "amount": 72000,
            "currency": "INR",
            "invoice_number": "ACC/1",
        },
        date(2026, 5, 28),
    )
    db_session.add_all([delivery, invoice])
    await db_session.flush()

    # Reconcile flags the pair (billed 120 vs 100 delivered -> ~12k at risk).
    listing = await client.get(
        f"/api/v1/reconcile/sites/{site.id}", headers=_auth(owner)
    )
    assert listing.status_code == 200
    data = listing.json()
    assert data["summary"]["total_amount_at_risk"] > 0
    flagged = [
        it for it in data["items"] if it["status"] in ("mismatch", "needs_approval")
    ]
    assert flagged, data["summary"]
    row = flagged[0]
    assert row["amount_at_risk"] > 0

    # Hold payment -> creates a Decision routed to the owner.
    hold = await client.post(
        "/api/v1/reconcile/hold-payment",
        json={
            "invoice_event_id": str(invoice.id),
            "delivery_event_id": str(delivery.id),
            "amount_at_risk": row["amount_at_risk"],
            "note": "Billed 120, received 100",
        },
        headers=_auth(owner),
    )
    assert hold.status_code == 201, hold.text
    decision_id = hold.json()["decision_id"]

    decision = await db_session.get(Decision, decision_id)
    assert decision is not None
    assert decision.kind == DecisionKind.hold_payment
    assert decision.state == DecisionState.pending
    assert decision.assigned_to == owner.id


# --------------------------------------------------------------------------- #
# 3. overdue homeowner question -> SLA sweep escalates
# --------------------------------------------------------------------------- #
async def test_e2e_sla_sweep_escalates_overdue_decision(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    now = datetime(2026, 5, 29, 12, 0, tzinfo=UTC)
    decision = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.homeowner_question,
        title="Can we begin the parking slab?",
        assigned_to=owner.id,
        state=DecisionState.pending,
        sla_due_at=now - timedelta(hours=3),
    )
    db_session.add(decision)
    await db_session.flush()

    escalated = await run_sla_sweep(db_session, now=now, company_id=company.id)

    assert decision.id in escalated
    await db_session.refresh(decision)
    assert decision.state == DecisionState.escalated


# --------------------------------------------------------------------------- #
# 4. near-expiry permit -> permit sweep raises an alert
# --------------------------------------------------------------------------- #
async def test_e2e_permit_sweep_flags_near_expiry(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    today = date(2026, 5, 29)
    permit = Permit(
        company_id=company.id,
        site_id=site.id,
        permit_type="Building Plan Approval",
        authority="BBMP",
        status=PermitStatus.approved,
        expiry_on=today + timedelta(days=12),  # within the 30-day window
    )
    db_session.add(permit)
    await db_session.flush()

    created = await run_permit_sweep(_session_factory(db_session), today=today)

    assert len(created) >= 1
    decision = await db_session.get(Decision, created[0])
    assert decision is not None
    assert decision.state == DecisionState.pending
