"""Team-invite create/accept + permission scoping (network-free)."""
from app.auth.jwt import create_access_token


def _auth(user) -> dict[str, str]:
    """Build a bearer header for an existing factory user (no login round-trip)."""
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _token_login(client, phone: str) -> str:
    resp = await client.post("/api/v1/auth/login", json={"phone": phone, "otp": "000000"})
    return resp.json()["token"]


async def test_owner_creates_invite(client, factory, db_session):
    from app.models import UserRole

    company = await factory.company(name="Sharma Constructions")
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/invites",
        json={"phone": "+15552220001", "role": "supervisor", "name": "Ravi"},
        headers=_auth(owner),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["role"] == "supervisor"
    assert body["status"] == "pending"
    assert body["token"]
    assert body["company_id"] == str(company.id)


async def test_supervisor_cannot_create_invite(client, factory, db_session):
    from app.models import UserRole

    company = await factory.company()
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/invites",
        json={"phone": "+15552220002", "role": "supervisor"},
        headers=_auth(supervisor),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


async def test_pm_cannot_invite_owner(client, factory, db_session):
    from app.models import UserRole

    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    await db_session.commit()

    resp = await client.post(
        "/api/v1/invites",
        json={"phone": "+15552220003", "role": "owner"},
        headers=_auth(pm),
    )
    assert resp.status_code == 403


async def test_invite_requires_auth(client):
    resp = await client.post(
        "/api/v1/invites", json={"phone": "+15552220004", "role": "supervisor"}
    )
    assert resp.status_code == 401


async def test_preview_invite_is_public(client, factory, db_session):
    from app.models import UserRole

    company = await factory.company(name="Mehta Builders")
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    created = await client.post(
        "/api/v1/invites",
        json={"phone": "+15552220005", "role": "accountant", "name": "Neha"},
        headers=_auth(owner),
    )
    token = created.json()["token"]

    # No auth header — the join screen previews before login.
    preview = await client.get(f"/api/v1/invites/{token}")
    assert preview.status_code == 200
    body = preview.json()
    assert body["company_name"] == "Mehta Builders"
    assert body["role"] == "accountant"
    assert body["name"] == "Neha"
    assert body["status"] == "pending"


async def test_preview_unknown_token_404(client):
    resp = await client.get("/api/v1/invites/does-not-exist")
    assert resp.status_code == 404


async def test_accept_invite_rehomes_user_and_returns_landing(client, factory, db_session):
    from app.models import UserRole

    company = await factory.company(name="Patil Infra")
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    created = await client.post(
        "/api/v1/invites",
        json={"phone": "+15552220006", "role": "supervisor"},
        headers=_auth(owner),
    )
    invite_token = created.json()["token"]

    # The invitee logs in fresh (becomes a default owner in a default company).
    jwt = await _token_login(client, "+15552220006")
    headers = {"Authorization": f"Bearer {jwt}"}

    accept = await client.post(f"/api/v1/invites/{invite_token}/accept", headers=headers)
    assert accept.status_code == 200
    body = accept.json()
    assert body["role"] == "supervisor"
    assert body["landing"] == "capture"  # supervisor -> Capture per the IA map

    # The accepting user is now in the inviting company with the invited role.
    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
    )
    me_body = me.json()
    assert me_body["role"] == "supervisor"
    assert me_body["company_id"] == str(company.id)


async def test_accept_is_idempotent_for_same_user(client, factory, db_session):
    from app.models import UserRole

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    created = await client.post(
        "/api/v1/invites",
        json={"phone": "+15552220007", "role": "accountant"},
        headers=_auth(owner),
    )
    invite_token = created.json()["token"]

    jwt = await _token_login(client, "+15552220007")
    headers = {"Authorization": f"Bearer {jwt}"}

    first = await client.post(f"/api/v1/invites/{invite_token}/accept", headers=headers)
    second = await client.post(f"/api/v1/invites/{invite_token}/accept", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["landing"] == "reconcile"


async def test_accepted_invite_rejected_for_a_different_user(client, factory, db_session):
    from app.models import UserRole

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    created = await client.post(
        "/api/v1/invites",
        json={"phone": "+15552220008", "role": "supervisor"},
        headers=_auth(owner),
    )
    invite_token = created.json()["token"]

    jwt_a = await _token_login(client, "+15552220008")
    await client.post(
        f"/api/v1/invites/{invite_token}/accept",
        headers={"Authorization": f"Bearer {jwt_a}"},
    )

    # A different person tries to reuse the link.
    jwt_b = await _token_login(client, "+15552229999")
    resp = await client.post(
        f"/api/v1/invites/{invite_token}/accept",
        headers={"Authorization": f"Bearer {jwt_b}"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "invite_used"


async def test_revoke_invite_blocks_accept(client, factory, db_session):
    from app.models import UserRole

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    created = await client.post(
        "/api/v1/invites",
        json={"phone": "+15552220010", "role": "supervisor"},
        headers=_auth(owner),
    )
    invite = created.json()

    revoke = await client.post(
        f"/api/v1/invites/{invite['id']}/revoke", headers=_auth(owner)
    )
    assert revoke.status_code == 200
    assert revoke.json()["status"] == "revoked"

    jwt = await _token_login(client, "+15552220010")
    resp = await client.post(
        f"/api/v1/invites/{invite['token']}/accept",
        headers={"Authorization": f"Bearer {jwt}"},
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "invite_revoked"


async def test_list_invites_is_company_scoped(client, factory, db_session):
    from app.models import UserRole

    company_a = await factory.company(name="A Co")
    owner_a = await factory.user(company=company_a, role=UserRole.owner)
    company_b = await factory.company(name="B Co")
    owner_b = await factory.user(company=company_b, role=UserRole.owner)
    await db_session.commit()

    await client.post(
        "/api/v1/invites",
        json={"phone": "+15552221111", "role": "supervisor"},
        headers=_auth(owner_a),
    )

    # owner_b sees none of A's invites.
    listed_b = await client.get("/api/v1/invites", headers=_auth(owner_b))
    assert listed_b.status_code == 200
    assert listed_b.json() == []

    listed_a = await client.get("/api/v1/invites", headers=_auth(owner_a))
    assert len(listed_a.json()) == 1
