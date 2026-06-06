"""Proof-Locked Approval L1 (2.5) — refuse without evidence / on a contested
event; stamp + reversible-until; undo within the window."""
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import (
    DisputeStatus,
    EventDispute,
    Payment,
    PaymentDirection,
    PaymentStatus,
    SiteEventModel,
    UserRole,
)


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _event(site_id):
    return SiteEventModel(
        site_id=site_id, event_type="invoice_received", occurred_on=date.today(), summary="inv",
        fields={"amount": 50000}, confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


def _payment(company_id, site_id, source_event_id=None):
    return Payment(
        company_id=company_id, site_id=site_id, direction=PaymentDirection.contractor_to_supplier,
        counterparty_name="ACC", amount=Decimal("50000"), paid_on=date.today(),
        source_event_id=source_event_id, status=PaymentStatus.recorded,
    )


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_approve_refuses_without_proof(client, db_session, world):
    company, owner, site = world
    p = _payment(company.id, site.id, source_event_id=None)  # no proof
    db_session.add(p)
    await db_session.flush()
    resp = await client.post(f"/api/v1/payments/{p.id}/approve", json={}, headers=auth(owner))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "missing_proof"


async def test_approve_with_proof_stamps_and_is_reversible(client, db_session, world):
    company, owner, site = world
    ev = _event(site.id)
    db_session.add(ev)
    await db_session.flush()
    p = _payment(company.id, site.id, source_event_id=ev.id)
    db_session.add(p)
    await db_session.flush()

    resp = await client.post(f"/api/v1/payments/{p.id}/approve", json={}, headers=auth(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "confirmed"
    assert body["approved_by"] == str(owner.id)
    assert str(ev.id) in body["evidence_event_ids"]
    assert body["reversible_until"] is not None

    undo = await client.post(f"/api/v1/payments/{p.id}/undo", headers=auth(owner))
    assert undo.status_code == 200
    assert undo.json()["status"] == "recorded"


async def test_approve_refuses_on_contested_evidence(client, db_session, world):
    company, owner, site = world
    ev = _event(site.id)
    db_session.add(ev)
    await db_session.flush()
    db_session.add(
        EventDispute(
            company_id=company.id, site_id=site.id, event_id=ev.id, raised_by=owner.id,
            reason="amount wrong", status=DisputeStatus.open,
        )
    )
    p = _payment(company.id, site.id, source_event_id=ev.id)
    db_session.add(p)
    await db_session.flush()
    resp = await client.post(f"/api/v1/payments/{p.id}/approve", json={}, headers=auth(owner))
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "contested"


async def test_undo_after_window_closes_is_refused(client, db_session, world):
    company, owner, site = world
    ev = _event(site.id)
    db_session.add(ev)
    await db_session.flush()
    p = _payment(company.id, site.id, source_event_id=ev.id)
    p.status = PaymentStatus.confirmed
    p.approved_by = owner.id
    p.approved_at = datetime.now(UTC) - timedelta(hours=48)
    p.reversible_until = datetime.now(UTC) - timedelta(hours=24)  # window passed
    p.evidence_event_ids = [ev.id]
    db_session.add(p)
    await db_session.flush()
    resp = await client.post(f"/api/v1/payments/{p.id}/undo", headers=auth(owner))
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "window_closed"


async def test_approve_requires_authority(client, db_session, factory, world):
    company, _, site = world
    ev = _event(site.id)
    db_session.add(ev)
    await db_session.flush()
    p = _payment(company.id, site.id, source_event_id=ev.id)
    db_session.add(p)
    await db_session.flush()
    acct = await factory.user(company=company, role=UserRole.accountant)
    resp = await client.post(f"/api/v1/payments/{p.id}/approve", json={}, headers=auth(acct))
    assert resp.status_code == 403
