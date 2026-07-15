"""Auth profile + language + landing endpoints (network-free)."""
from app.auth.landing import landing_for
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, UserRole


async def _login(client, phone: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"phone": phone, "otp": "000000"})
    assert resp.status_code == 200
    return resp.json()["token"]


async def _step_up_token(client, token: str) -> str:
    resp = await client.post(
        "/api/v1/auth/step-up/verify",
        json={"otp": "000000"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["step_up_token"]


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


async def test_delete_own_account_anonymizes_not_hard_deletes(client, db_session):
    """The row must survive deletion (anonymized in place), not be hard-deleted —
    ~40 FKs from users.id are attribution columns on shared project history that
    would otherwise SET NULL and become indistinguishable from any other deleted
    user."""
    token = await _login(client, "+15551119020")
    headers = {"Authorization": f"Bearer {token}"}
    me = await client.get("/api/v1/auth/me", headers=headers)
    user_id = me.json()["id"]

    step_up = await _step_up_token(client, token)
    resp = await client.delete(
        "/api/v1/users/me", headers={**headers, "X-Step-Up-Token": step_up}
    )
    assert resp.status_code == 204, resp.text

    from uuid import UUID

    from app.models import User as UserModel

    updated = await db_session.get(UserModel, UUID(user_id))
    assert updated is not None  # anonymized in place, never hard-deleted
    assert updated.name == "Deleted user"
    assert updated.phone == f"deleted:{user_id}"
    assert updated.is_active is False
    assert updated.deleted_at is not None


async def test_delete_own_account_scrubs_homeowner_member_phone_and_display_name(
    client, factory, db_session
):
    """Whole-branch review finding: HomeownerMember keeps its OWN denormalized
    copies of phone/display_name (shown to the rest of the household via the
    roster endpoint), so scrubbing the users row alone left the deleted
    homeowner's real phone + name visible to their household. Deletion must
    also null both fields on every HomeownerMember row for that user (a user
    can belong to more than one property)."""
    phone = "+15551119023"
    company = await factory.company()
    site = await factory.site(company, name="Sunrise Villa")
    homeowner = await factory.user(company=company, role=UserRole.homeowner, phone=phone)
    member = HomeownerMember(
        site_id=site.id,
        user_id=homeowner.id,
        sub_role=HomeownerSubRole.primary_owner,
        status=MemberStatus.active,
        phone="+15551234567",
        display_name="Real Name",
    )
    db_session.add(member)
    await db_session.flush()
    await db_session.commit()

    # Log in as the same pre-existing homeowner (tolerant phone lookup finds
    # the factory-created row rather than provisioning a new one).
    token = await _login(client, phone)
    headers = {"Authorization": f"Bearer {token}"}
    step_up = await _step_up_token(client, token)
    resp = await client.delete(
        "/api/v1/users/me", headers={**headers, "X-Step-Up-Token": step_up}
    )
    assert resp.status_code == 204, resp.text

    await db_session.refresh(member)
    assert member.phone is None
    assert member.display_name is None


async def test_delete_own_account_without_step_up_is_rejected(client):
    token = await _login(client, "+15551119021")
    headers = {"Authorization": f"Bearer {token}"}

    resp = await client.delete("/api/v1/users/me", headers=headers)  # no X-Step-Up-Token
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "step_up_required"

    # Untouched — the existing token still works.
    me = await client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200


async def test_deleted_account_locks_out_old_token_but_allows_fresh_signup(client):
    phone = "+15551119022"
    token = await _login(client, phone)
    headers = {"Authorization": f"Bearer {token}"}

    step_up = await _step_up_token(client, token)
    resp = await client.delete(
        "/api/v1/users/me", headers={**headers, "X-Step-Up-Token": step_up}
    )
    assert resp.status_code == 204

    # The old token is immediately locked out (is_active=False reuses the
    # existing deactivation check in get_current_user).
    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 403

    # Logging in again with the same phone number succeeds — but because the
    # phone column was overwritten to a tombstone value, this provisions a
    # brand-new user rather than reviving the deleted one. Re-signup after
    # deletion is a fresh start, not account recovery (see "Why anonymize,
    # not hard-delete" at the top of this plan).
    login2 = await client.post(
        "/api/v1/auth/login", json={"phone": phone, "otp": "000000"}
    )
    assert login2.status_code == 200
