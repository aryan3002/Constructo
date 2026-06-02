"""C3 — assign a Decision to a real chosen member (kills the hard-coded 'pm').

The mobile member picker reads ``GET /api/v1/users`` for assignable members and
POSTs the chosen user's UUID to ``/approvals/{id}/assign``. These tests cover the
backend assign path: real assignee, idempotency, unknown/cross-company rejection,
and that the assigned decision then surfaces in the assignee's ``?for=me`` feed.
"""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import Decision, DecisionKind, UserRole
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def company(factory):
    return await factory.company()


@pytest_asyncio.fixture
async def world(factory, company, db_session):
    owner = await factory.user(company=company, role=UserRole.owner)
    pm = await factory.user(company=company, role=UserRole.pm)
    site = await factory.site(company=company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=owner.id))
    await db_session.flush()
    return owner, pm, site


async def _decision(db_session, company, site):
    d = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.approval,
        title="Approve scaffolding hire",
    )
    db_session.add(d)
    await db_session.flush()
    return d


async def test_assign_sets_real_assignee(client, db_session, company, world):
    owner, pm, site = world
    d = await _decision(db_session, company, site)

    resp = await client.post(
        f"/api/v1/approvals/{d.id}/assign",
        json={"assigned_to": str(pm.id)},
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["assigned_to"] == str(pm.id)


async def test_assign_is_idempotent(client, db_session, company, world):
    owner, pm, site = world
    d = await _decision(db_session, company, site)
    body = {"assigned_to": str(pm.id)}
    r1 = await client.post(f"/api/v1/approvals/{d.id}/assign", json=body, headers=auth(owner))
    r2 = await client.post(f"/api/v1/approvals/{d.id}/assign", json=body, headers=auth(owner))
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json()["assigned_to"] == str(pm.id)


async def test_assign_then_appears_in_assignee_for_me(client, db_session, company, world):
    owner, pm, site = world
    d = await _decision(db_session, company, site)
    await client.post(
        f"/api/v1/approvals/{d.id}/assign",
        json={"assigned_to": str(pm.id)},
        headers=auth(owner),
    )
    # The PM's "things pointed at me" feed now includes it.
    feed = await client.get("/api/v1/approvals?for=me", headers=auth(pm))
    assert feed.status_code == 200
    assert str(d.id) in {item["id"] for item in feed.json()["items"]}


async def test_assign_unknown_user_is_404(client, db_session, company, world):
    owner, pm, site = world
    d = await _decision(db_session, company, site)
    resp = await client.post(
        f"/api/v1/approvals/{d.id}/assign",
        json={"assigned_to": "00000000-0000-0000-0000-000000000000"},
        headers=auth(owner),
    )
    assert resp.status_code == 404


async def test_assign_cross_company_user_is_404(client, db_session, company, world, factory):
    owner, pm, site = world
    d = await _decision(db_session, company, site)
    outsider = await factory.user(role=UserRole.pm)  # different company
    resp = await client.post(
        f"/api/v1/approvals/{d.id}/assign",
        json={"assigned_to": str(outsider.id)},
        headers=auth(owner),
    )
    assert resp.status_code == 404


async def test_users_list_is_the_picker_source(client, db_session, company, world):
    """The mobile member picker reads GET /users (owner/pm scope)."""
    owner, pm, site = world
    resp = await client.get("/api/v1/users", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    roles = {u["id"]: u["role"] for u in resp.json()["items"]}
    assert roles.get(str(pm.id)) == UserRole.pm.value
