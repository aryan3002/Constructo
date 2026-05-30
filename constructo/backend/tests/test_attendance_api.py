"""Attendance capture + planned-vs-actual API tests (network-free)."""
from datetime import date
from decimal import Decimal

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import (
    Payment,
    PaymentDirection,
    PaymentStatus,
    SiteBaseline,
    SiteEventModel,
    UserRole,
)


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


async def _assign(client, owner, site_id, user_id):
    return await client.post(
        f"/api/v1/sites/{site_id}/assign",
        json={"user_id": str(user_id)},
        headers=auth(owner),
    )


# ---- capture ---------------------------------------------------------------


async def test_owner_captures_attendance(client, factory, db_session, owner):
    company = await factory.company(name="C2")
    o2 = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)

    resp = await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 24, "occurred_on": "2026-05-29", "note": "24 mazdoor aaye"},
        headers=auth(o2),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["headcount"] == 24
    assert body["summary"].startswith("24 workers present")
    assert body["confidence"] == 1.0
    assert body["source"] == "app"

    # It landed as a real attendance SiteEvent (shared ledger).
    rows = (await db_session.execute(SiteEventModel.__table__.select())).fetchall()
    assert any(r.event_type == "attendance" and r.fields["headcount"] == 24 for r in rows)


async def test_by_trade_breakdown_in_summary(client, factory, owner):
    company = await factory.company(name="C3")
    o = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    resp = await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 16, "by_trade": {"mason": 6, "helper": 10}},
        headers=auth(o),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["by_trade"] == {"mason": 6, "helper": 10}
    assert "6 mason" in resp.json()["summary"]


async def test_supervisor_can_capture_only_on_assigned_site(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company, name="Assigned")
    sup = await factory.user(company=company, role=UserRole.supervisor)

    # Not assigned -> forbidden.
    before = await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 10},
        headers=auth(sup),
    )
    assert before.status_code == 403

    await _assign(client, owner, site.id, sup.id)

    after = await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 10},
        headers=auth(sup),
    )
    assert after.status_code == 201, after.text


async def test_accountant_role_cannot_capture(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    acc = await factory.user(company=company, role=UserRole.accountant)
    await _assign(client, owner, site.id, acc.id)

    resp = await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 5},
        headers=auth(acc),
    )
    assert resp.status_code == 403


async def test_capture_is_idempotent_on_client_capture_id(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)

    payload = {"headcount": 12, "client_capture_id": "queue-abc-1"}
    first = await client.post(
        f"/api/v1/sites/{site.id}/attendance", json=payload, headers=auth(owner)
    )
    second = await client.post(
        f"/api/v1/sites/{site.id}/attendance", json=payload, headers=auth(owner)
    )
    assert first.status_code == 201 and second.status_code == 201
    # Same event returned, no duplicate.
    assert first.json()["id"] == second.json()["id"]

    listing = await client.get(
        f"/api/v1/sites/{site.id}/attendance", headers=auth(owner)
    )
    assert len(listing.json()["items"]) == 1


async def test_negative_by_trade_rejected(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    resp = await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 4, "by_trade": {"mason": -1}},
        headers=auth(owner),
    )
    assert resp.status_code == 400


# ---- listing ---------------------------------------------------------------


async def test_list_attendance_returns_all_captures(client, factory, owner):
    # Note: in the test transaction all rows share one `func.now()` instant, so
    # we assert completeness + stable id-desc tie-break rather than wall-clock
    # ordering (which is exercised in production by distinct created_at values).
    company = await factory.company(name="L")
    o = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    for hc in (5, 8, 11):
        await client.post(
            f"/api/v1/sites/{site.id}/attendance",
            json={"headcount": hc},
            headers=auth(o),
        )
    resp = await client.get(f"/api/v1/sites/{site.id}/attendance", headers=auth(o))
    items = resp.json()["items"]
    assert sorted(i["headcount"] for i in items) == [5, 8, 11]
    # Deterministic order: created_at desc then id desc.
    ids = [i["id"] for i in items]
    assert ids == sorted(ids, reverse=True)


async def test_list_attendance_pagination(client, factory, owner):
    company = await factory.company(name="P")
    o = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    for hc in range(1, 6):
        await client.post(
            f"/api/v1/sites/{site.id}/attendance",
            json={"headcount": hc},
            headers=auth(o),
        )
    first = await client.get(
        f"/api/v1/sites/{site.id}/attendance?limit=2", headers=auth(o)
    )
    body = first.json()
    assert len(body["items"]) == 2
    assert body["next_cursor"] is not None
    seen = {i["id"] for i in body["items"]}
    cursor = body["next_cursor"]
    while cursor:
        page = (
            await client.get(
                f"/api/v1/sites/{site.id}/attendance?limit=2&cursor={cursor}",
                headers=auth(o),
            )
        ).json()
        seen.update(i["id"] for i in page["items"])
        cursor = page["next_cursor"]
    assert len(seen) == 5


# ---- planned vs actual -----------------------------------------------------


async def test_summary_ok_when_meets_baseline(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    db_session.add(SiteBaseline(site_id=site.id, expected_daily_headcount=20))
    await db_session.flush()

    await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 22, "occurred_on": "2026-05-29"},
        headers=auth(owner),
    )
    resp = await client.get(
        f"/api/v1/sites/{site.id}/attendance/summary?date=2026-05-29",
        headers=auth(owner),
    )
    body = resp.json()
    assert body["expected"] == 20
    assert body["actual"] == 22
    assert body["variance"] == 2
    assert body["status"] == "ok"
    assert body["capture_count"] == 1


async def test_summary_risk_on_large_shortfall(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    db_session.add(SiteBaseline(site_id=site.id, expected_daily_headcount=20))
    await db_session.flush()

    await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 8, "occurred_on": "2026-05-29"},
        headers=auth(owner),
    )
    resp = await client.get(
        f"/api/v1/sites/{site.id}/attendance/summary?date=2026-05-29",
        headers=auth(owner),
    )
    body = resp.json()
    assert body["variance"] == -12
    assert body["status"] == "risk"


async def test_summary_info_without_baseline(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    await client.post(
        f"/api/v1/sites/{site.id}/attendance",
        json={"headcount": 9, "occurred_on": "2026-05-29"},
        headers=auth(owner),
    )
    resp = await client.get(
        f"/api/v1/sites/{site.id}/attendance/summary?date=2026-05-29",
        headers=auth(owner),
    )
    body = resp.json()
    assert body["expected"] is None
    assert body["actual"] == 9
    assert body["variance"] is None
    assert body["status"] == "info"


async def test_summary_uses_latest_capture(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    db_session.add(SiteBaseline(site_id=site.id, expected_daily_headcount=10))
    await db_session.flush()
    for hc in (10, 12):  # correction: 12 is the latest
        await client.post(
            f"/api/v1/sites/{site.id}/attendance",
            json={"headcount": hc, "occurred_on": "2026-05-29"},
            headers=auth(owner),
        )
    resp = await client.get(
        f"/api/v1/sites/{site.id}/attendance/summary?date=2026-05-29",
        headers=auth(owner),
    )
    assert resp.json()["actual"] == 12
    assert resp.json()["capture_count"] == 2


# ---- mukadam own payments --------------------------------------------------


async def test_mukadam_sees_own_recorded_payments(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company=company)
    mukadam = await factory.user(
        company=company, role=UserRole.labor_contractor, name="Ramesh Yadav"
    )
    await _assign(client, owner, site.id, mukadam.id)

    db_session.add(
        Payment(
            company_id=company.id,
            site_id=site.id,
            direction=PaymentDirection.contractor_to_supplier,
            counterparty_name="Ramesh Yadav",
            amount=Decimal("15000.00"),
            paid_on=date(2026, 5, 20),
            method="upi",
            status=PaymentStatus.confirmed,
        )
    )
    # A payment to someone else must NOT appear.
    db_session.add(
        Payment(
            company_id=company.id,
            site_id=site.id,
            direction=PaymentDirection.contractor_to_supplier,
            counterparty_name="Someone Else",
            amount=Decimal("999.00"),
            paid_on=date(2026, 5, 21),
        )
    )
    await db_session.flush()

    resp = await client.get("/api/v1/me/payments", headers=auth(mukadam))
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["amount"] == "15000.00"
    assert items[0]["status"] == "confirmed"


async def test_me_payments_empty_without_name(client, factory):
    company = await factory.company()
    # name=None -> no counterparty match possible.
    user = await factory.user(company=company, role=UserRole.labor_contractor)
    user.name = None
    resp = await client.get("/api/v1/me/payments", headers=auth(user))
    assert resp.status_code == 200
    assert resp.json()["items"] == []


# ---- auth ------------------------------------------------------------------


async def test_capture_requires_auth(client, factory):
    company = await factory.company()
    site = await factory.site(company=company)
    resp = await client.post(
        f"/api/v1/sites/{site.id}/attendance", json={"headcount": 1}
    )
    assert resp.status_code == 401
