"""API tests for the reconciliation endpoints (network-free, transactional DB)."""
from datetime import date
from uuid import uuid4

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import Decision, DecisionKind, SiteEventModel, UserRole


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


async def _company(db_session, company_id):
    from app.models import Company

    return await db_session.get(Company, company_id)


async def _delivery(db_session, site_id, *, vendor="UltraTech", material="cement",
                    quantity=100.0, unit="bag", occurred_on=date(2026, 5, 20)):
    ev = SiteEventModel(
        site_id=site_id,
        event_type="material_delivery",
        occurred_on=occurred_on,
        summary=f"{quantity} {unit} {material}",
        fields={"vendor": vendor, "material": material, "quantity": quantity, "unit": unit},
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    db_session.add(ev)
    await db_session.flush()
    return ev


async def _invoice(db_session, site_id, *, vendor="UltraTech", material="cement",
                   quantity=100.0, amount=40000.0, occurred_on=date(2026, 5, 22)):
    ev = SiteEventModel(
        site_id=site_id,
        event_type="invoice_received",
        occurred_on=occurred_on,
        summary=f"invoice {amount}",
        fields={
            "vendor": vendor,
            "material": material,
            "quantity": quantity,
            "amount": amount,
            "currency": "INR",
            "invoice_number": "INV-1",
        },
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    db_session.add(ev)
    await db_session.flush()
    return ev


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


async def test_reconcile_matched(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    await _delivery(db_session, site.id, quantity=100.0)
    await _invoice(db_session, site.id, quantity=100.0)

    resp = await client.get(f"/api/v1/reconcile/sites/{site.id}", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["summary"]["matched"] == 1
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["status"] == "matched"
    assert item["delivery"] is not None
    assert item["invoice"] is not None


async def test_reconcile_needs_approval_exposes_amount(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    await _delivery(db_session, site.id, quantity=100.0)
    await _invoice(db_session, site.id, quantity=150.0, amount=60000.0)

    resp = await client.get(f"/api/v1/reconcile/sites/{site.id}", headers=auth(owner))
    body = resp.json()
    assert body["summary"]["needs_approval"] == 1
    item = body["items"][0]
    assert item["status"] == "needs_approval"
    assert item["amount_at_risk"] >= 10000.0
    assert body["summary"]["total_amount_at_risk"] >= 10000.0


async def test_reconcile_missing_proof(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    await _delivery(db_session, site.id)  # no invoice

    resp = await client.get(f"/api/v1/reconcile/sites/{site.id}", headers=auth(owner))
    body = resp.json()
    assert body["summary"]["missing_proof"] == 1
    assert body["items"][0]["reasons"] == ["no_invoice"]


async def test_reconcile_site_scoping(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    assigned = await factory.site(company=company, name="Assigned")
    other = await factory.site(company=company, name="Other")
    await _delivery(db_session, other.id)

    sup = await factory.user(company=company, role=UserRole.supervisor)
    forbidden = await client.get(f"/api/v1/reconcile/sites/{other.id}", headers=auth(sup))
    assert forbidden.status_code == 403

    # owner can see it
    ok = await client.get(f"/api/v1/reconcile/sites/{other.id}", headers=auth(owner))
    assert ok.status_code == 200

    # assign supervisor to a different site -> still forbidden on `other`
    await client.post(
        f"/api/v1/sites/{assigned.id}/assign",
        json={"user_id": str(sup.id)},
        headers=auth(owner),
    )
    still = await client.get(f"/api/v1/reconcile/sites/{other.id}", headers=auth(sup))
    assert still.status_code == 403


async def test_reconcile_missing_site_is_404(client, owner):
    resp = await client.get(f"/api/v1/reconcile/sites/{uuid4()}", headers=auth(owner))
    assert resp.status_code == 404


async def test_grn_draft(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    dlv = await _delivery(db_session, site.id, vendor="UltraTech", material="cement",
                          quantity=100.0, unit="bag")

    resp = await client.get(f"/api/v1/reconcile/grn/{dlv.id}", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["reference"].startswith("GRN-")
    assert body["vendor"] == "UltraTech"
    assert "cement" in body["note"]


async def test_grn_rejects_non_delivery_event(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    inv = await _invoice(db_session, site.id)
    resp = await client.get(f"/api/v1/reconcile/grn/{inv.id}", headers=auth(owner))
    assert resp.status_code == 422


async def test_hold_payment_creates_decision_routed_to_owner(
    client, factory, db_session, owner
):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    dlv = await _delivery(db_session, site.id, quantity=100.0)
    inv = await _invoice(db_session, site.id, quantity=150.0, amount=60000.0)

    resp = await client.post(
        "/api/v1/reconcile/hold-payment",
        json={
            "invoice_event_id": str(inv.id),
            "delivery_event_id": str(dlv.id),
            "amount_at_risk": 20000.0,
            "note": "Billed 150 bags, only 100 received.",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["state"] == "pending"
    assert body["assigned_to"] == str(owner.id)
    assert body["site_id"] == str(site.id)

    decision = await db_session.get(Decision, body["decision_id"])
    assert decision is not None
    assert decision.kind is DecisionKind.hold_payment
    assert decision.assigned_to == owner.id
    assert decision.raised_by == owner.id
    assert set(decision.evidence_event_ids) == {inv.id, dlv.id}


async def test_hold_payment_requires_an_event(client, owner):
    resp = await client.post(
        "/api/v1/reconcile/hold-payment", json={"amount_at_risk": 100.0}, headers=auth(owner)
    )
    assert resp.status_code == 422


async def test_hold_payment_rejects_cross_site_pair(client, factory, db_session, owner):
    company = await _company(db_session, owner.company_id)
    site_a = await factory.site(company=company, name="A")
    site_b = await factory.site(company=company, name="B")
    dlv = await _delivery(db_session, site_a.id)
    inv = await _invoice(db_session, site_b.id)

    resp = await client.post(
        "/api/v1/reconcile/hold-payment",
        json={"invoice_event_id": str(inv.id), "delivery_event_id": str(dlv.id)},
        headers=auth(owner),
    )
    assert resp.status_code == 422


# --- accountant overview (C4) -----------------------------------------------


async def test_accountant_overview_worst_first_and_exceptions(
    client, factory, db_session, owner
):
    company = await _company(db_session, owner.company_id)
    accountant = await factory.user(company=company, role=UserRole.accountant)

    clean = await factory.site(company=company, name="Clean")
    await _delivery(db_session, clean.id, quantity=100.0)
    await _invoice(db_session, clean.id, quantity=100.0)

    messy = await factory.site(company=company, name="Messy")
    await _delivery(db_session, messy.id, quantity=100.0)
    await _invoice(db_session, messy.id, quantity=150.0, amount=60000.0)

    # A pre-existing money flag (hold_payment) the accountant should see.
    db_session.add(
        Decision(
            company_id=company.id,
            site_id=messy.id,
            kind=DecisionKind.hold_payment,
            title="Hold payment to UltraTech",
            detail="Payment held pending review (₹8,400 at risk).",
            assigned_to=owner.id,
        )
    )
    await db_session.flush()

    resp = await client.get("/api/v1/reconcile/overview", headers=auth(accountant))
    assert resp.status_code == 200, resp.text
    body = resp.json()

    # Worst-first: the site with the variance sorts ahead of the clean one.
    assert body["sites"][0]["site_name"] == "Messy"
    assert body["total_amount_at_risk"] >= 10000.0

    # The open money exception is surfaced with its ₹-at-risk recovered.
    assert body["open_exception_count"] == 1
    exc = body["exceptions"][0]
    assert exc["state"] == "pending"
    assert exc["amount_at_risk"] == 8400.0


async def test_accountant_overview_is_site_scoped(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    assigned = await factory.site(company=company, name="Assigned")
    other = await factory.site(company=company, name="Other")
    sup = await factory.user(company=company, role=UserRole.supervisor)

    # Assign the supervisor to one site only.
    await client.post(
        f"/api/v1/sites/{assigned.id}/assign",
        json={"user_id": str(sup.id)},
        headers=auth(owner),
    )

    # A hold on a site the supervisor cannot see must not leak.
    db_session.add(
        Decision(
            company_id=company.id,
            site_id=other.id,
            kind=DecisionKind.hold_payment,
            title="Hold on other site",
            detail="Payment held pending review (₹9,000 at risk).",
            assigned_to=owner.id,
        )
    )
    await db_session.flush()

    resp = await client.get("/api/v1/reconcile/overview", headers=auth(sup))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    site_names = {s["site_name"] for s in body["sites"]}
    assert site_names == {"Assigned"}
    assert body["open_exception_count"] == 0
