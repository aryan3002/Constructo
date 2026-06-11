"""Nivaan proposals: the agent drafts a card; a HUMAN commits. No auto-commit."""
from datetime import date

from sqlalchemy import func, select

from app.agent.nivaan import ProposalRequest, build_proposal
from app.models import Conversation, ConversationKind, SiteEventModel, UserRole


async def _site_conv(db_session, company, site, owner):
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site,
        created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


async def _event_count(db_session, site_id) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(SiteEventModel).where(SiteEventModel.site_id == site_id)
    )


async def test_non_money_proposal_drafts_a_commit_card_without_committing(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)

    req = ProposalRequest(
        capture_type="material_delivery",
        fields={"material": "cement", "quantity": 50, "unit": "bori", "vendor": "ACC"},
    )
    reply = await build_proposal(db_session, owner, conv, req)

    p = reply.meta["proposal"]
    assert p["tier"] == "commit"
    assert p["capture_type"] == "material_delivery"
    assert p["fields"]["quantity"] == 50
    assert p["committable"] is True
    # Structural proof: the agent committed NOTHING — the site has no events.
    assert await _event_count(db_session, site.id) == 0


async def test_proposal_summary_is_numeric_guarded(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    req = ProposalRequest(
        capture_type="material_delivery",
        fields={"material": "cement", "quantity": 50, "unit": "bori"},
    )
    reply = await build_proposal(db_session, owner, conv, req)
    # The drafted summary mentions only grounded numbers (50), never an invented one.
    summary = reply.meta["proposal"]["summary"]
    assert "50" in summary
    assert "500" not in summary


def _md_event(site_id, vendor="ACC", material="cement", qty=100.0):
    return SiteEventModel(
        site_id=site_id, event_type="material_delivery", occurred_on=date.today(),
        summary="material_delivery",
        fields={"vendor": vendor, "material": material, "quantity": qty, "unit": "bori"},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


def _inv_event(site_id, vendor="ACC", material="cement", qty=100.0, amount=50000.0):
    return SiteEventModel(
        site_id=site_id, event_type="invoice_received", occurred_on=date.today(),
        summary="invoice_received",
        fields={"vendor": vendor, "material": material, "quantity": qty,
                "amount": amount, "currency": "INR", "invoice_number": "A1"},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


async def test_money_proposal_binds_reconcile_evidence(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    db_session.add_all([_md_event(site.id), _inv_event(site.id)])  # a matching pair
    await db_session.flush()

    req = ProposalRequest(
        capture_type="approval", fields={"vendor": "ACC", "amount": 50000, "status": "pending"}
    )
    reply = await build_proposal(db_session, owner, conv, req)
    p = reply.meta["proposal"]
    assert p["tier"] == "money"
    assert p["kind"] == "capture"
    assert p["committable"] is True
    assert len(p["evidence_event_ids"]) == 2  # the delivery + the invoice
    assert await _event_count(db_session, site.id) == 2  # still NOT committed


async def test_money_proposal_without_proof_is_missing_proof(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = await _site_conv(db_session, company, site, owner)
    db_session.add(_inv_event(site.id))  # an invoice, but NO delivery to bind it
    await db_session.flush()

    req = ProposalRequest(
        capture_type="payment_request", fields={"vendor": "ACC", "amount": 50000}
    )
    reply = await build_proposal(db_session, owner, conv, req)
    p = reply.meta["proposal"]
    assert p["kind"] == "missing_proof"
    assert p["committable"] is False
    assert p["capture_type"] == "decision"
