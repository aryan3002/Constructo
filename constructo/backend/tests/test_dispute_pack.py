"""Tamper-Evident Dispute Pack (Phase 3.6) — hash-chain + Ask-the-pack, scoped."""
from datetime import date
from decimal import Decimal

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.dispute_pack.pack import answer_pack, hash_chain, verify_chain
from app.models import Payment, PaymentDirection, PaymentStatus, SiteEventModel, UserRole
from app.payments.advance import CounterpartyInvoice, CounterpartyPayment, compute_settlement


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


# --- pure: hash chain -----------------------------------------------------


def test_hash_chain_links_and_verifies():
    records = [{"type": "payment", "amount": 50000}, {"type": "invoice", "amount": 30000}]
    chained, head = hash_chain(records)
    assert chained[0]["_prev"] == "0" * 64
    assert chained[1]["_prev"] == chained[0]["_hash"]
    assert head == chained[-1]["_hash"]
    assert verify_chain(chained) is True


def test_tamper_breaks_the_chain():
    chained, _ = hash_chain([{"amount": 50000}, {"amount": 30000}])
    chained[0]["amount"] = 999999  # edit an earlier record
    assert verify_chain(chained) is False


def test_empty_pack_head_is_zero_hash():
    chained, head = hash_chain([])
    assert chained == []
    assert head == "0" * 64


# --- pure: ask-the-pack ---------------------------------------------------


def test_answer_pack_money_intents_and_abstain():
    s = compute_settlement(
        "Sharma",
        [CounterpartyPayment("Sharma", Decimal("50000"))],
        [CounterpartyInvoice("Sharma", Decimal("30000"))],
    )
    assert answer_pack("kitna unadjusted advance hai?", s).answerable
    assert "20,000" in answer_pack("unadjusted?", s).answer
    assert answer_pack("how much paid?", s).answerable
    assert answer_pack("invoiced total?", s).answerable
    off = answer_pack("what colour is the wall?", s)
    assert off.answerable is False


# --- API ------------------------------------------------------------------


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def _seed(db_session, company, site):
    db_session.add(
        Payment(
            company_id=company.id, site_id=site.id,
            direction=PaymentDirection.contractor_to_supplier,
            counterparty_name="Sharma Traders", amount=Decimal("50000"),
            paid_on=date.today(), status=PaymentStatus.recorded,
        )
    )
    db_session.add(
        SiteEventModel(
            site_id=site.id, event_type="invoice_received", occurred_on=date.today(),
            summary="inv", fields={"vendor": "Sharma Trading Co", "amount": 30000},
            confidence=1.0, needs_clarification=False, source_message_ids=[],
        )
    )
    await db_session.flush()


async def test_dispute_pack_export(client, db_session, world):
    company, owner, site = world
    await _seed(db_session, company, site)
    resp = await client.get(
        f"/api/v1/dispute-pack?site_id={site.id}&counterparty=Sharma%20Traders",
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["record_count"] == 2
    assert body["settlement"]["unadjusted_advance"] == 20000
    assert body["head_hash"] and body["head_hash"] != "0" * 64
    assert "NOT legal evidence" in body["watermark"]
    # chain integrity round-trips
    assert verify_chain(body["records"]) is True


async def test_dispute_pack_ask(client, db_session, world):
    company, owner, site = world
    await _seed(db_session, company, site)
    resp = await client.post(
        "/api/v1/dispute-pack/ask",
        json={"site_id": str(site.id), "counterparty": "Sharma Traders",
              "question": "how much unadjusted advance?"},
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["answerable"] is True
    assert "20,000" in body["answer"]


async def test_dispute_pack_homeowner_blocked(client, factory, world):
    company, _, site = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    resp = await client.get(
        f"/api/v1/dispute-pack?site_id={site.id}&counterparty=X", headers=auth(homeowner)
    )
    assert resp.status_code == 403
