"""Team management — role change + deactivation (W4.3)."""
from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


async def test_list_users_reports_is_active(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await factory.user(company=company, role=UserRole.pm)
    await db_session.commit()

    resp = await client.get("/api/v1/users", headers=auth(owner))
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    assert all(u["is_active"] is True for u in items)


async def test_owner_changes_member_role(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    member = await factory.user(company=company, role=UserRole.pm)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{member.id}",
        json={"role": "accountant"},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "accountant"


async def test_owner_deactivates_member(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    member = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{member.id}",
        json={"is_active": False},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is False


async def test_owner_cannot_edit_self(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{owner.id}",
        json={"role": "pm"},
        headers=auth(owner),
    )
    assert resp.status_code == 403


async def test_cannot_edit_user_in_another_company(client, factory, db_session):
    owner = await factory.user(role=UserRole.owner)  # company A
    other = await factory.user(role=UserRole.pm)  # company B (fresh)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{other.id}",
        json={"is_active": False},
        headers=auth(owner),
    )
    assert resp.status_code == 404


async def test_non_owner_cannot_change_roles(client, factory, db_session):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    member = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{member.id}",
        json={"role": "accountant"},
        headers=auth(pm),
    )
    assert resp.status_code == 403


async def test_deactivated_user_is_locked_out(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    member = await factory.user(
        company=company, role=UserRole.accountant, phone="+15557770042"
    )
    await db_session.commit()

    # Their token works before deactivation.
    assert (await client.get("/api/v1/auth/me", headers=auth(member))).status_code == 200

    # Owner deactivates them.
    await client.patch(
        f"/api/v1/users/{member.id}",
        json={"is_active": False},
        headers=auth(owner),
    )

    # Existing token now 403s, and a fresh login is refused too.
    assert (await client.get("/api/v1/auth/me", headers=auth(member))).status_code == 403
    login = await client.post(
        "/api/v1/auth/login", json={"phone": "+15557770042", "otp": "000000"}
    )
    assert login.status_code == 403
