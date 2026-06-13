"""Team management — role change + deactivation (W4.3)."""
from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


async def _step_up_token(client, user) -> str:
    """Mint a fresh step-up token for *user* using the dev OTP (000000)."""
    resp = await client.post(
        "/api/v1/auth/step-up/verify", json={"otp": "000000"}, headers=auth(user)
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["step_up_token"]


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

    # Escalating to accountant (a privileged role) requires a step-up token.
    step_up = await _step_up_token(client, owner)
    resp = await client.patch(
        f"/api/v1/users/{member.id}",
        json={"role": "accountant"},
        headers={**auth(owner), "X-Step-Up-Token": step_up},
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "accountant"


async def test_owner_deactivates_member(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    member = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    # Deactivation is always sensitive — requires a step-up token.
    step_up = await _step_up_token(client, owner)
    resp = await client.patch(
        f"/api/v1/users/{member.id}",
        json={"is_active": False},
        headers={**auth(owner), "X-Step-Up-Token": step_up},
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

    # Owner deactivates them (sensitive — requires step-up token).
    step_up = await _step_up_token(client, owner)
    await client.patch(
        f"/api/v1/users/{member.id}",
        json={"is_active": False},
        headers={**auth(owner), "X-Step-Up-Token": step_up},
    )

    # Existing token now 403s, and a fresh login is refused too.
    assert (await client.get("/api/v1/auth/me", headers=auth(member))).status_code == 403
    login = await client.post(
        "/api/v1/auth/login", json={"phone": "+15557770042", "otp": "000000"}
    )
    assert login.status_code == 403


# ---------------------------------------------------------------------------
# Step-up gate tests (sensitive vs. non-sensitive PATCH /users/{id})
# ---------------------------------------------------------------------------


async def test_deactivation_without_step_up_is_rejected(client, factory, db_session):
    """is_active=false is always sensitive; must 403 step_up_required without token."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    target = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{target.id}",
        json={"is_active": False},
        headers=auth(owner),  # no X-Step-Up-Token
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "step_up_required"

    # Target must still be active — change must NOT have been applied.
    resp2 = await client.get("/api/v1/users", headers=auth(owner))
    users = {u["id"]: u for u in resp2.json()["items"]}
    assert users[str(target.id)]["is_active"] is True


async def test_escalation_to_privileged_role_without_step_up_is_rejected(
    client, factory, db_session
):
    """Assigning a privileged role (accountant) is sensitive; 403 without token."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    target = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{target.id}",
        json={"role": "accountant"},
        headers=auth(owner),  # no X-Step-Up-Token
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "step_up_required"

    # Role must remain unchanged.
    resp2 = await client.get("/api/v1/users", headers=auth(owner))
    users = {u["id"]: u for u in resp2.json()["items"]}
    assert users[str(target.id)]["role"] == "supervisor"


async def test_escalation_to_privileged_role_with_valid_step_up_succeeds(
    client, factory, db_session
):
    """Assigning a privileged role WITH a valid step-up token must succeed (200)."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    target = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    step_up = await _step_up_token(client, owner)
    resp = await client.patch(
        f"/api/v1/users/{target.id}",
        json={"role": "accountant"},
        headers={**auth(owner), "X-Step-Up-Token": step_up},
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "accountant"


async def test_non_sensitive_role_change_needs_no_step_up(client, factory, db_session):
    """Assigning a non-privileged role (supervisor) needs no step-up token."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    target = await factory.user(company=company, role=UserRole.accountant)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{target.id}",
        json={"role": "supervisor"},
        headers=auth(owner),  # no X-Step-Up-Token
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "supervisor"


async def test_reactivation_needs_no_step_up(client, factory, db_session):
    """is_active=true (reactivation) is not sensitive — no step-up required."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    # Create a pre-deactivated member directly in DB.
    from app.models import User as UserModel

    inactive = UserModel(
        company_id=company.id,
        role=UserRole.supervisor,
        phone=f"+1{__import__('uuid').uuid4().hex[:10]}",
        name="Inactive Member",
        is_active=False,
    )
    db_session.add(inactive)
    await db_session.commit()

    resp = await client.patch(
        f"/api/v1/users/{inactive.id}",
        json={"is_active": True},
        headers=auth(owner),  # no X-Step-Up-Token
    )
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True
