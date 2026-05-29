from app.auth.scoping import visible_site_ids
from app.models import UserRole


async def test_login_wrong_otp_returns_401(client):
    resp = await client.post("/api/v1/auth/login", json={"phone": "+15550000001", "otp": "999999"})
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "invalid_otp"


async def test_login_creates_user_and_returns_token(client):
    resp = await client.post("/api/v1/auth/login", json={"phone": "+15550000002", "otp": "000000"})
    assert resp.status_code == 200
    body = resp.json()
    assert "token" in body and isinstance(body["token"], str) and body["token"]


async def test_login_then_me(client):
    login = await client.post(
        "/api/v1/auth/login", json={"phone": "+15550000003", "otp": "000000"}
    )
    token = login.json()["token"]

    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    data = me.json()
    assert data["phone"] == "+15550000003"
    assert data["role"] == "owner"
    assert "id" in data and "company_id" in data


async def test_me_without_token_is_401(client):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


async def test_login_is_idempotent_per_phone(client):
    first = await client.post("/api/v1/auth/login", json={"phone": "+15550000004", "otp": "000000"})
    second = await client.post(
        "/api/v1/auth/login", json={"phone": "+15550000004", "otp": "000000"}
    )
    me1 = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {first.json()['token']}"}
    )
    me2 = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {second.json()['token']}"}
    )
    assert me1.json()["id"] == me2.json()["id"]


async def test_visible_site_ids_owner_sees_all_company_sites(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    s1 = await factory.site(company=company, name="S1")
    s2 = await factory.site(company=company, name="S2")

    other_company = await factory.company(name="Other Co")
    await factory.site(company=other_company, name="Other Site")

    visible = await visible_site_ids(db_session, owner)
    assert set(visible) == {s1.id, s2.id}


async def test_visible_site_ids_supervisor_empty_until_assignment(db_session, factory):
    company = await factory.company()
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    await factory.site(company=company, name="S1")

    visible = await visible_site_ids(db_session, supervisor)
    assert visible == []
