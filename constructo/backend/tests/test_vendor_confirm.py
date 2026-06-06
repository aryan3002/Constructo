"""Vendor Confirm-Loop (Phase 3.8) — no-install two-party-verified GRN."""
from datetime import date

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def _create(client, owner, site, **over):
    body = {
        "site_id": str(site.id), "vendor_name": "ACC Cement",
        "material": "cement", "claimed_qty": 50, "claimed_unit": "bori",
        "delivered_on": date.today().isoformat(),
    }
    body.update(over)
    return await client.post("/api/v1/vendor-confirm", json=body, headers=auth(owner))


async def test_create_and_public_view(client, world):
    _, owner, site = world
    resp = await _create(client, owner, site)
    assert resp.status_code == 201, resp.text
    c = resp.json()
    assert c["status"] == "pending"
    assert c["verified"] is False
    token = c["token"]

    # PUBLIC view — no auth, quantity claim only (no money fields present).
    pub = await client.get(f"/api/v1/vendor-confirm/{token}")
    assert pub.status_code == 200, pub.text
    body = pub.json()
    assert body["vendor_name"] == "ACC Cement"
    assert body["site_name"] == "Sunrise"
    assert body["claimed_qty"] == 50
    assert body["already_responded"] is False
    assert "amount" not in body and "rate" not in body  # no money crosses


async def test_vendor_confirms_matching_qty_is_verified(client, world):
    _, owner, site = world
    token = (await _create(client, owner, site)).json()["token"]
    # PUBLIC respond — no auth.
    r = await client.post(
        f"/api/v1/vendor-confirm/{token}/respond", json={"confirmed": True, "qty": 50}
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "confirmed"

    # Crew sees it verified.
    lst = await client.get(
        f"/api/v1/vendor-confirm?site_id={site.id}", headers=auth(owner)
    )
    row = lst.json()[0]
    assert row["status"] == "confirmed"
    assert row["verified"] is True
    assert row["response_qty"] == 50


async def test_vendor_disputes_is_not_verified(client, world):
    _, owner, site = world
    token = (await _create(client, owner, site)).json()["token"]
    r = await client.post(
        f"/api/v1/vendor-confirm/{token}/respond",
        json={"confirmed": False, "qty": 45, "note": "only 45 loaded"},
    )
    assert r.json()["status"] == "disputed"
    lst = await client.get(
        f"/api/v1/vendor-confirm?site_id={site.id}", headers=auth(owner)
    )
    row = lst.json()[0]
    assert row["verified"] is False
    assert row["response_qty"] == 45


async def test_double_respond_conflicts(client, world):
    _, owner, site = world
    token = (await _create(client, owner, site)).json()["token"]
    await client.post(f"/api/v1/vendor-confirm/{token}/respond", json={"confirmed": True})
    again = await client.post(
        f"/api/v1/vendor-confirm/{token}/respond", json={"confirmed": True}
    )
    assert again.status_code == 409


async def test_bad_token_404(client):
    assert (await client.get("/api/v1/vendor-confirm/nope")).status_code == 404


async def test_create_homeowner_blocked(client, factory, world):
    company, _, site = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    resp = await _create(client, homeowner, site)
    assert resp.status_code == 403
