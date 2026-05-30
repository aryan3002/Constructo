"""H0 onboarding: contractor mints a member + join code, homeowner redeems it
for a token, and members manage their own notification preferences."""
import pytest_asyncio

from app.models import UserRole

from .conftest import auth


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise Villa")
    return owner, site


async def test_mint_and_join_flow(client, world):
    owner, site = world

    minted = await client.post(
        "/api/v1/homeowner/members",
        json={"site_id": str(site.id), "sub_role": "primary_owner"},
        headers=auth(owner),
    )
    assert minted.status_code == 201, minted.text
    body = minted.json()
    assert body["status"] == "invited"
    assert body["user_id"] is None
    assert body["join_code"]
    assert body["join_code"] in body["invite_link"]
    join_code = body["join_code"]

    # Homeowner redeems the code.
    joined = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": join_code, "phone": "+919812345678", "otp": "000000"},
    )
    assert joined.status_code == 200, joined.text
    token = joined.json()
    assert token["token"]
    assert token["site_id"] == str(site.id)
    assert token["sub_role"] == "primary_owner"

    # The new homeowner can list their own (now active) membership.
    me = await client.get(
        "/api/v1/homeowner/members",
        headers={"Authorization": f"Bearer {token['token']}"},
    )
    assert me.status_code == 200, me.text
    memberships = me.json()
    assert len(memberships) == 1
    assert memberships[0]["status"] == "active"
    assert memberships[0]["site_id"] == str(site.id)


async def test_join_bad_otp_rejected(client, world):
    owner, site = world
    minted = await client.post(
        "/api/v1/homeowner/members",
        json={"site_id": str(site.id)},
        headers=auth(owner),
    )
    join_code = minted.json()["join_code"]
    resp = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": join_code, "phone": "+919811111111", "otp": "999999"},
    )
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_otp"


async def test_join_unknown_code_404(client):
    resp = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": "nope", "phone": "+919800000000", "otp": "000000"},
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "invalid_code"


async def test_non_contractor_cannot_mint(client, factory):
    company = await factory.company()
    site = await factory.site(company)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.post(
        "/api/v1/homeowner/members",
        json={"site_id": str(site.id)},
        headers=auth(supervisor),
    )
    assert resp.status_code == 403


async def test_member_updates_own_prefs(client, ctx):
    # ctx.homeowner already has an active membership (ctx.member).
    resp = await client.patch(
        f"/api/v1/homeowner/members/{ctx.member.id}",
        json={"notif_prefs": {"push": True, "quiet_hours": "22-7"}},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["notif_prefs"] == {"push": True, "quiet_hours": "22-7"}
