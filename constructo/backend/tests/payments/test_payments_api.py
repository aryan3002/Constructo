"""Payment TRACKING endpoints: CRUD, scoping, ledger totals, event linkage."""
from datetime import date
from uuid import uuid4

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import SiteEventModel, UserRole
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


def _payload(site_id=None, **over):
    base = {
        "direction": "homeowner_to_contractor",
        "counterparty_name": "Sharma Residence",
        "amount": "150000.00",
        "paid_on": "2026-05-20",
        "method": "upi",
        "reference_no": "UPI-9931",
    }
    if site_id is not None:
        base["site_id"] = str(site_id)
    base.update(over)
    return base


async def test_create_and_get_payment(client, factory, db_session, owner):
    company = await factory.company(name="Co") if False else None
    site = await factory.site(company=await _company(db_session, owner.company_id))
    resp = await client.post(
        "/api/v1/payments", json=_payload(site_id=site.id), headers=auth(owner)
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "recorded"
    assert body["direction"] == "homeowner_to_contractor"
    assert body["created_by"] == str(owner.id)

    got = await client.get(f"/api/v1/payments/{body['id']}", headers=auth(owner))
    assert got.status_code == 200
    assert got.json()["counterparty_name"] == "Sharma Residence"
    assert company is None


async def test_create_rejects_nonpositive_amount(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    resp = await client.post(
        "/api/v1/payments", json=_payload(site_id=site.id, amount="0"), headers=auth(owner)
    )
    assert resp.status_code == 422


async def test_update_status_to_confirmed(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    created = (
        await client.post(
            "/api/v1/payments", json=_payload(site_id=site.id), headers=auth(owner)
        )
    ).json()
    patched = await client.patch(
        f"/api/v1/payments/{created['id']}",
        json={"status": "confirmed"},
        headers=auth(owner),
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "confirmed"


async def test_delete_payment(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    created = (
        await client.post(
            "/api/v1/payments", json=_payload(site_id=site.id), headers=auth(owner)
        )
    ).json()
    deleted = await client.delete(f"/api/v1/payments/{created['id']}", headers=auth(owner))
    assert deleted.status_code == 204
    gone = await client.get(f"/api/v1/payments/{created['id']}", headers=auth(owner))
    assert gone.status_code == 404


async def test_link_payment_to_source_event(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    event = SiteEventModel(
        site_id=site.id,
        event_type="payment_request",
        occurred_on=date(2026, 5, 18),
        summary="advance maango",
        fields={},
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    db_session.add(event)
    await db_session.flush()

    resp = await client.post(
        "/api/v1/payments",
        json=_payload(site_id=site.id, source_event_id=str(event.id)),
        headers=auth(owner),
    )
    assert resp.status_code == 201
    assert resp.json()["source_event_id"] == str(event.id)


async def test_link_to_foreign_event_404(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    resp = await client.post(
        "/api/v1/payments",
        json=_payload(site_id=site.id, source_event_id=str(uuid4())),
        headers=auth(owner),
    )
    assert resp.status_code == 404


async def test_ledger_running_totals(client, factory, db_session, owner):
    company = await _company(db_session, owner.company_id)
    site = await factory.site(company=company)
    # inflow 150000 + 50000, outflow 80000, one disputed 99999 (excluded)
    await client.post(
        "/api/v1/payments", json=_payload(site_id=site.id, amount="150000"), headers=auth(owner)
    )
    await client.post(
        "/api/v1/payments", json=_payload(site_id=site.id, amount="50000"), headers=auth(owner)
    )
    await client.post(
        "/api/v1/payments",
        json=_payload(
            site_id=site.id,
            amount="80000",
            direction="contractor_to_supplier",
            counterparty_name="Cement Depot",
        ),
        headers=auth(owner),
    )
    await client.post(
        "/api/v1/payments",
        json=_payload(site_id=site.id, amount="99999", status="disputed"),
        headers=auth(owner),
    )

    ledger = await client.get(f"/api/v1/payments/ledger?site_id={site.id}", headers=auth(owner))
    assert ledger.status_code == 200
    totals = ledger.json()["totals"]
    assert float(totals["inflow"]) == 200000.0
    assert float(totals["outflow"]) == 80000.0
    assert float(totals["net"]) == 120000.0
    assert totals["count"] == 4  # disputed still listed/counted


async def test_accountant_sees_all_payments_supervisor_scoped(
    client, factory, db_session, owner
):
    company = await _company(db_session, owner.company_id)
    site_a = await factory.site(company=company, name="A")
    site_b = await factory.site(company=company, name="B")
    accountant = await factory.user(company=company, role=UserRole.accountant)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site_a.id, user_id=supervisor.id))
    await db_session.flush()

    await client.post("/api/v1/payments", json=_payload(site_id=site_a.id), headers=auth(owner))
    await client.post("/api/v1/payments", json=_payload(site_id=site_b.id), headers=auth(owner))

    acc = await client.get("/api/v1/payments", headers=auth(accountant))
    assert acc.status_code == 200
    assert len(acc.json()["items"]) == 2  # accountant sees both

    sup = await client.get("/api/v1/payments", headers=auth(supervisor))
    assert sup.status_code == 200
    sup_sites = {p["site_id"] for p in sup.json()["items"]}
    assert sup_sites == {str(site_a.id)}  # only assigned site


async def test_cross_company_payment_is_404(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    created = (
        await client.post(
            "/api/v1/payments", json=_payload(site_id=site.id), headers=auth(owner)
        )
    ).json()
    other_owner = await factory.user(
        company=await factory.company(name="Other Co"), role=UserRole.owner
    )
    resp = await client.get(f"/api/v1/payments/{created['id']}", headers=auth(other_owner))
    assert resp.status_code == 404


async def test_requires_auth(client):
    resp = await client.get("/api/v1/payments")
    assert resp.status_code == 401


async def _company(db_session, company_id):
    from app.models import Company

    return await db_session.get(Company, company_id)


# --- financial tracking (W2.6) ----------------------------------------------


async def test_financials_defaults_when_unset(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    resp = await client.get(
        f"/api/v1/payments/financials/{site.id}", headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["quotation"] is None
    assert body["billed"] is None
    assert body["received"] == "0"
    assert body["outstanding"] == "0"
    assert body["currency"] == "INR"


async def test_set_financials_computes_received_and_outstanding(
    client, factory, db_session, owner
):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    # A homeowner->contractor payment is "received" (inflow).
    await client.post(
        "/api/v1/payments",
        json=_payload(site_id=site.id, amount="150000.00"),
        headers=auth(owner),
    )

    put = await client.put(
        f"/api/v1/payments/financials/{site.id}",
        json={"quotation_amount": "1000000.00", "billed_amount": "500000.00"},
        headers=auth(owner),
    )
    assert put.status_code == 200, put.text
    body = put.json()
    assert body["quotation"] == "1000000.00"
    assert body["billed"] == "500000.00"
    assert body["received"] == "150000.00"
    # outstanding = billed - received = 500000 - 150000
    assert body["outstanding"] == "350000.00"

    # GET reflects the same.
    got = await client.get(
        f"/api/v1/payments/financials/{site.id}", headers=auth(owner)
    )
    assert got.json()["outstanding"] == "350000.00"

    # A second PUT updates in place (upsert, no duplicate row), untouched fields stay.
    put2 = await client.put(
        f"/api/v1/payments/financials/{site.id}",
        json={"billed_amount": "600000.00"},
        headers=auth(owner),
    )
    assert put2.json()["billed"] == "600000.00"
    assert put2.json()["quotation"] == "1000000.00"
    assert put2.json()["outstanding"] == "450000.00"


async def test_financials_edit_forbidden_for_non_finance_role(
    client, factory, db_session, owner
):
    company = await _company(db_session, owner.company_id)
    site = await factory.site(company=company)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.put(
        f"/api/v1/payments/financials/{site.id}",
        json={"billed_amount": "1000.00"},
        headers=auth(supervisor),
    )
    assert resp.status_code == 403


async def test_financials_site_scoped_404(client, factory, db_session, owner):
    other_company = await factory.company(name="Other Co")
    other_site = await factory.site(company=other_company)
    resp = await client.get(
        f"/api/v1/payments/financials/{other_site.id}", headers=auth(owner)
    )
    assert resp.status_code == 404
