"""An invited number signs in directly, and an invite only works for its own
number (Batch F, item 7)."""
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.invites.models import Invite, InviteStatus
from app.models import Company, User, UserRole


def _auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _invite(client, owner, phone: str, role: str = "supervisor", name: str | None = None):
    resp = await client.post(
        "/api/v1/invites",
        json={"phone": phone, "role": role, **({"name": name} if name else {})},
        headers=_auth(owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _login(client, phone: str):
    return await client.post("/api/v1/auth/login", json={"phone": phone, "otp": "000000"})


async def _company_count(db_session) -> int:
    return (await db_session.execute(select(func.count()).select_from(Company))).scalar_one()


async def test_invited_unknown_number_signs_in_to_the_inviting_company(
    client, factory, db_session
):
    company = await factory.company(name="Patil Infra")
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()
    invite = await _invite(client, owner, "+91 98200 11001", name="Lokesh")
    companies_before = await _company_count(db_session)

    # Typed in another format, without signup — the plain app login.
    resp = await client.post("/api/v1/auth/login", json={"phone": "9820011001", "otp": "000000"})
    assert resp.status_code == 200, resp.text

    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {resp.json()['token']}"}
    )
    body = me.json()
    assert body["company_id"] == str(company.id)
    assert body["role"] == "supervisor"
    assert body["name"] == "Lokesh"
    assert body["phone"] == "+919820011001"
    assert await _company_count(db_session) == companies_before

    row = await db_session.get(Invite, invite["id"])
    await db_session.refresh(row)
    assert row.status is InviteStatus.accepted
    assert str(row.accepted_user_id) == body["id"]
    # The invite link afterwards is a harmless no-op for the same person.
    again = await client.post(
        f"/api/v1/invites/{invite['token']}/accept",
        headers={"Authorization": f"Bearer {resp.json()['token']}"},
    )
    assert again.status_code == 200
    assert again.json()["role"] == "supervisor"


async def test_newest_pending_invite_wins(client, factory, db_session):
    first = await factory.company(name="First Co")
    second = await factory.company(name="Second Co")
    owner_1 = await factory.user(company=first, role=UserRole.owner)
    owner_2 = await factory.user(company=second, role=UserRole.owner)
    await db_session.commit()
    await _invite(client, owner_1, "+919820011002", role="accountant")
    newer = await _invite(client, owner_2, "+919820011002", role="pm")
    # Make the order explicit (both rows can share one transaction timestamp).
    await db_session.execute(
        Invite.__table__.update()
        .where(Invite.id == newer["id"])
        .values(created_at=func.now() + func.make_interval(0, 0, 0, 0, 1))
    )
    await db_session.commit()

    resp = await client.post("/api/v1/auth/login", json={"phone": "+919820011002", "otp": "000000"})
    assert resp.status_code == 200, resp.text
    user = (
        await db_session.execute(select(User).where(User.phone == "+919820011002"))
    ).scalar_one()
    assert user.company_id == second.id
    assert user.role is UserRole.pm


async def test_uninvited_unknown_number_is_still_not_registered(client, factory, db_session):
    companies_before = await _company_count(db_session)
    resp = await client.post("/api/v1/auth/login", json={"phone": "+919820011003", "otp": "000000"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_registered"
    assert await _company_count(db_session) == companies_before


async def test_revoked_invite_lets_nobody_in(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()
    invite = await _invite(client, owner, "+919820011004")
    await client.post(f"/api/v1/invites/{invite['id']}/revoke", headers=_auth(owner))

    resp = await client.post("/api/v1/auth/login", json={"phone": "+919820011004", "otp": "000000"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_registered"


async def test_accept_refuses_a_different_phone(client, factory, db_session):
    company = await factory.company(name="Target Co")
    owner = await factory.user(company=company, role=UserRole.owner)
    stranger_co = await factory.company(name="Stranger Co")
    stranger = await factory.user(
        company=stranger_co, role=UserRole.owner, phone="+919820011099"
    )
    await db_session.commit()
    invite = await _invite(client, owner, "+919820011005")

    resp = await client.post(
        f"/api/v1/invites/{invite['token']}/accept", headers=_auth(stranger)
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "invite_wrong_phone"
    await db_session.refresh(stranger)
    assert stranger.company_id == stranger_co.id
    assert stranger.role is UserRole.owner
    row = await db_session.get(Invite, invite["id"])
    await db_session.refresh(row)
    assert row.status is InviteStatus.pending


async def test_accept_matches_the_phone_across_formats(client, factory, db_session):
    company = await factory.company(name="Target Co")
    owner = await factory.user(company=company, role=UserRole.owner)
    existing = await factory.user(role=UserRole.owner, phone="+919820011006")
    await db_session.commit()
    invite = await _invite(client, owner, "098200 11006", role="accountant")

    resp = await client.post(
        f"/api/v1/invites/{invite['token']}/accept", headers=_auth(existing)
    )
    assert resp.status_code == 200, resp.text
    await db_session.refresh(existing)
    assert existing.company_id == company.id
    assert existing.role is UserRole.accountant


async def test_invited_login_obeys_the_login_rate_limit(client, factory, db_session, monkeypatch):
    monkeypatch.setattr("app.config.settings.rate_limit_login_per_ip", 1)
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()
    await _invite(client, owner, "+919820011007")

    first = await _login(client, "+919820011008")
    assert first.status_code == 404
    second = await _login(client, "+919820011007")
    assert second.status_code == 429
