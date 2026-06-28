"""Advance Ledger / Advance Guard (2.5 L2) — unadjusted advance + the guard warn."""
from datetime import date
from decimal import Decimal

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import Payment, PaymentDirection, PaymentStatus, SiteEventModel, UserRole
from app.payments.advance import (
    CounterpartyInvoice,
    CounterpartyPayment,
    compute_settlement,
)


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def test_compute_settlement_matches_by_normalised_name():
    b = compute_settlement(
        "Sharma Traders",
        [CounterpartyPayment("Sharma Traders", Decimal("50000"))],
        [CounterpartyInvoice("Sharma Trading Co", Decimal("30000"))],  # normalises to "sharma"
    )
    assert b.paid_out == Decimal("50000")
    assert b.invoiced == Decimal("30000")
    assert b.unadjusted_advance == Decimal("20000")
    assert b.warn is True
    assert "unadjusted advance" in b.message


def test_compute_settlement_fully_adjusted_no_warn():
    b = compute_settlement(
        "ACC",
        [CounterpartyPayment("ACC", Decimal("30000"))],
        [CounterpartyInvoice("ACC", Decimal("30000"))],
    )
    assert b.unadjusted_advance == Decimal("0")
    assert b.warn is False


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_settlement_endpoint_flags_advance(client, db_session, world):
    company, owner, site = world
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

    resp = await client.get(
        "/api/v1/payments/settlement?counterparty=Sharma%20Traders", headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert Decimal(body["unadjusted_advance"]) == Decimal("20000")
    assert body["warn"] is True


async def test_settlement_survives_non_numeric_invoice_amount(client, db_session, world):
    # A comma-formatted / unreadable amount (from extraction or manual entry) must
    # not 500 the whole Advance Guard for the company.
    company, owner, site = world
    db_session.add(
        SiteEventModel(
            site_id=site.id, event_type="invoice_received", occurred_on=date.today(),
            summary="inv", fields={"vendor": "Sharma Traders", "amount": "72,000"},
            confidence=1.0, needs_clarification=False, source_message_ids=[],
        )
    )
    await db_session.flush()

    resp = await client.get(
        "/api/v1/payments/settlement?counterparty=Sharma%20Traders", headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
