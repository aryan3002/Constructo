"""Auth profile + language + landing endpoints (network-free)."""
from app.auth.landing import landing_for
from app.models import UserRole


async def _login(client, phone: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"phone": phone, "otp": "000000"})
    assert resp.status_code == 200
    return resp.json()["token"]


async def test_request_otp_returns_sent(client):
    resp = await client.post("/api/v1/auth/request-otp", json={"phone": "+15551110000"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["sent"] is True
    assert body["dev_otp"] == "000000"


async def test_me_includes_language(client):
    token = await _login(client, "+15551110001")
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    # New owners default to "en" (server_default on user.language).
    assert me.json()["language"] in ("en", None)


async def test_me_includes_company_name(client):
    """P1-2: /auth/me returns the human-readable company name so clients never
    have to show the raw company_id UUID. A brand-new login auto-provisions the
    'Default Company'."""
    token = await _login(client, "+15551119001")
    me = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    body = me.json()
    assert "company_name" in body
    assert body["company_name"] == "Default Company"


async def test_patch_users_me_preserves_company_name(client):
    """The profile PATCH response also carries company_name (regression: it used
    the bare _me_out without the company join)."""
    token = await _login(client, "+15551119002")
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.patch("/api/v1/users/me", json={"name": "Asha"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["company_name"] == "Default Company"


async def test_patch_users_me_sets_language(client):
    token = await _login(client, "+15551110002")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.patch("/api/v1/users/me", json={"language": "hi"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["language"] == "hi"

    # Persisted: a fresh /me reflects it.
    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.json()["language"] == "hi"


async def test_patch_users_me_sets_name(client):
    token = await _login(client, "+15551110003")
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.patch("/api/v1/users/me", json={"name": "Asha"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Asha"


async def test_patch_users_me_rejects_unknown_language(client):
    token = await _login(client, "+15551110004")
    headers = {"Authorization": f"Bearer {token}"}
    # Literal type means FastAPI validation rejects it as 422.
    resp = await client.patch("/api/v1/users/me", json={"language": "fr"}, headers=headers)
    assert resp.status_code == 422


async def test_patch_users_me_requires_auth(client):
    resp = await client.patch("/api/v1/users/me", json={"language": "hi"})
    assert resp.status_code == 401


async def test_landing_map_for_roles():
    assert landing_for(UserRole.owner) == "brief"
    assert landing_for(UserRole.pm) == "brief"
    assert landing_for(UserRole.supervisor) == "capture"
    assert landing_for(UserRole.accountant) == "reconcile"
    assert landing_for(UserRole.labor_contractor) == "attendance"
    assert landing_for(UserRole.procurement) == "orders"


def test_architect_lands_on_spec_desk():
    assert landing_for(UserRole.architect) == "spec_desk"


async def test_me_landing_endpoint(client):
    token = await _login(client, "+15551110005")
    resp = await client.get(
        "/api/v1/auth/me/landing", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    body = resp.json()
    # A fresh login is an owner -> brief.
    assert body["role"] == "owner"
    assert body["landing"] == "brief"


async def test_owner_can_rename_company(client):
    token = await _login(client, "+15551110006")
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.patch(
        "/api/v1/auth/company", json={"name": "Verma Builders"}, headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Verma Builders"


async def test_get_company_returns_id_and_name(client):
    token = await _login(client, "+15551110007")
    headers = {"Authorization": f"Bearer {token}"}
    # Rename first so we have a known value to read back.
    await client.patch(
        "/api/v1/auth/company", json={"name": "Rao Constructions"}, headers=headers
    )
    resp = await client.get("/api/v1/auth/company", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Rao Constructions"
    assert body["id"]
    # New profile fields default to the India SMB norm (W4.2).
    assert body["timezone"] == "Asia/Kolkata"
    assert body["currency"] == "INR"
    assert body["gstin"] is None
    assert body["address"] is None


async def test_owner_updates_profile_fields(client):
    token = await _login(client, "+15551110010")
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.patch(
        "/api/v1/auth/company",
        json={
            "name": "Verma Builders",
            "gstin": "29ABCDE1234F1Z5",
            "address": "12 MG Road, Bengaluru",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
        },
        headers=headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["gstin"] == "29ABCDE1234F1Z5"
    assert body["address"] == "12 MG Road, Bengaluru"


async def test_partial_update_preserves_other_fields(client):
    token = await _login(client, "+15551110011")
    headers = {"Authorization": f"Bearer {token}"}
    await client.patch(
        "/api/v1/auth/company",
        json={"name": "Initial Co", "gstin": "29ABCDE1234F1Z5"},
        headers=headers,
    )
    # Patch only the address — name + gstin must survive.
    resp = await client.patch(
        "/api/v1/auth/company", json={"address": "New Site Office"}, headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["address"] == "New Site Office"
    assert body["name"] == "Initial Co"
    assert body["gstin"] == "29ABCDE1234F1Z5"


async def test_get_company_allows_any_member(client, factory, db_session):
    # The read side is not owner-gated: a field role can prefill the company too.
    company = await factory.company(name="Shared Co")
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()
    from app.auth.jwt import create_access_token

    headers = {
        "Authorization": f"Bearer {create_access_token(str(supervisor.id), supervisor.role.value)}"
    }
    resp = await client.get("/api/v1/auth/company", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Shared Co"


async def test_rename_company_requires_owner(client, factory, db_session):
    company = await factory.company()
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()
    from app.auth.jwt import create_access_token

    headers = {
        "Authorization": f"Bearer {create_access_token(str(supervisor.id), supervisor.role.value)}"
    }
    resp = await client.patch(
        "/api/v1/auth/company", json={"name": "Nope"}, headers=headers
    )
    assert resp.status_code == 403
