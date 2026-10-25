"""S9 — who may settle a decision: role × kind × action.

Money kinds (approval, hold_payment) are the owner's call; generic and
homeowner questions may be settled by an owner or PM; ``respond`` is also open
to the assignee for non-money kinds. A refusal is 403 ``owner_only`` on money
kinds so clients can offer "Propose to owner" instead.
"""
import pytest
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import Decision, DecisionKind, DecisionState, UserRole
from app.sites.models import SiteAssignment

ROLES = [
    UserRole.owner,
    UserRole.pm,
    UserRole.supervisor,
    UserRole.accountant,
    UserRole.architect,
    UserRole.labor_contractor,
]
MONEY = {DecisionKind.approval, DecisionKind.hold_payment}
DECIDERS = {UserRole.owner, UserRole.pm}


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    site = await factory.site(company=company)
    users = {}
    for role in ROLES:
        u = await factory.user(company=company, role=role)
        db_session.add(SiteAssignment(site_id=site.id, user_id=u.id))
        users[role] = u
    await db_session.flush()
    return company, site, users


async def _decision(db_session, company, site, kind, assigned_to=None):
    d = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=kind,
        title=f"A {kind} decision",
        assigned_to=assigned_to,
    )
    db_session.add(d)
    await db_session.flush()
    return d


def _may_decide(role, kind) -> bool:
    return role is UserRole.owner if kind in MONEY else role in DECIDERS


def _assert_refused(resp, kind):
    assert resp.status_code == 403, resp.text
    code = resp.json()["error"]["code"]
    assert code == ("owner_only" if kind in MONEY else "forbidden")


@pytest.mark.parametrize("kind", list(DecisionKind))
@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("action", ["approve", "reject"])
async def test_approve_reject(client, db_session, world, role, kind, action):
    company, site, users = world
    d = await _decision(db_session, company, site, kind)
    resp = await client.post(f"/api/v1/approvals/{d.id}/{action}", headers=auth(users[role]))
    if _may_decide(role, kind):
        assert resp.status_code == 200, resp.text
        assert resp.json()["state"] == ("resolved" if action == "approve" else "rejected")
    else:
        _assert_refused(resp, kind)
        await db_session.refresh(d)
        assert d.state is DecisionState.pending


@pytest.mark.parametrize("kind", list(DecisionKind))
@pytest.mark.parametrize("role", ROLES)
async def test_batch_skips_what_the_role_may_not_decide(client, db_session, world, role, kind):
    company, site, users = world
    d = await _decision(db_session, company, site, kind)
    resp = await client.post(
        "/api/v1/approvals/batch/resolve", json={"ids": [str(d.id)]}, headers=auth(users[role])
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    if _may_decide(role, kind):
        assert body["updated"] == [str(d.id)]
    else:
        assert body["skipped"] == [str(d.id)]
        await db_session.refresh(d)
        assert d.state is DecisionState.pending


@pytest.mark.parametrize("kind", list(DecisionKind))
@pytest.mark.parametrize("role", ROLES)
async def test_assign(client, db_session, world, role, kind):
    company, site, users = world
    d = await _decision(db_session, company, site, kind)
    resp = await client.post(
        f"/api/v1/approvals/{d.id}/assign",
        json={"assigned_to": str(users[UserRole.pm].id)},
        headers=auth(users[role]),
    )
    if kind in MONEY and role is not UserRole.owner:
        _assert_refused(resp, kind)
    else:
        assert resp.status_code == 200, resp.text


@pytest.mark.parametrize("kind", list(DecisionKind))
@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize("is_assignee", [True, False])
async def test_respond(client, db_session, world, role, kind, is_assignee):
    company, site, users = world
    caller = users[role]
    assignee = caller if is_assignee else users[UserRole.supervisor]
    if not is_assignee and role is UserRole.supervisor:
        assignee = users[UserRole.architect]
    d = await _decision(db_session, company, site, kind, assigned_to=assignee.id)
    resp = await client.post(
        f"/api/v1/approvals/{d.id}/respond", json={"action": "confirm"}, headers=auth(caller)
    )
    if kind in MONEY:
        allowed = role is UserRole.owner
    else:
        allowed = is_assignee or role in DECIDERS
    if allowed:
        assert resp.status_code == 200, resp.text
        assert resp.json()["state"] == "resolved"
    else:
        _assert_refused(resp, kind)
        await db_session.refresh(d)
        assert d.state is DecisionState.pending


async def test_mukadam_cannot_approve_the_invoice_but_can_still_see_it(
    client, db_session, world
):
    company, site, users = world
    mukadam = users[UserRole.labor_contractor]
    d = await _decision(db_session, company, site, DecisionKind.approval)
    seen = await client.get(f"/api/v1/approvals/{d.id}", headers=auth(mukadam))
    assert seen.status_code == 200
    resp = await client.post(f"/api/v1/approvals/{d.id}/approve", headers=auth(mukadam))
    _assert_refused(resp, DecisionKind.approval)


async def test_acknowledge_stays_open_to_any_in_scope_member(client, db_session, world):
    company, site, users = world
    d = await _decision(db_session, company, site, DecisionKind.approval)
    resp = await client.post(
        f"/api/v1/approvals/{d.id}/acknowledge", headers=auth(users[UserRole.supervisor])
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "acknowledged"
