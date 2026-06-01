"""Contractor-side respond endpoint + ?for=me read (C3 — stops the outbox 404)."""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import Decision, DecisionKind, DecisionState, UserRole
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def company(factory):
    return await factory.company()


@pytest_asyncio.fixture
async def supervisor(factory, company, db_session):
    sup = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company=company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    return sup, site


async def _make_decision(db_session, company, site, assigned_to):
    d = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.approval,
        title="Confirm cement delivery",
        assigned_to=assigned_to,
    )
    db_session.add(d)
    await db_session.flush()
    return d


async def test_respond_confirm_resolves(client, db_session, company, supervisor):
    sup, site = supervisor
    d = await _make_decision(db_session, company, site, assigned_to=sup.id)

    resp = await client.post(
        f"/api/v1/approvals/{d.id}/respond",
        json={"action": "confirm", "client_response_id": "resp_1"},
        headers=auth(sup),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["state"] == "resolved"


async def test_respond_is_idempotent_on_replay(client, db_session, company, supervisor):
    sup, site = supervisor
    d = await _make_decision(db_session, company, site, assigned_to=sup.id)

    body = {"action": "confirm", "client_response_id": "resp_dup"}
    r1 = await client.post(f"/api/v1/approvals/{d.id}/respond", json=body, headers=auth(sup))
    r2 = await client.post(f"/api/v1/approvals/{d.id}/respond", json=body, headers=auth(sup))
    assert r1.status_code == 200
    assert r2.status_code == 200  # replay is a no-op, not a 409
    assert r2.json()["state"] == "resolved"


async def test_respond_out_of_company_is_404(client, db_session, company, supervisor, factory):
    sup, site = supervisor
    d = await _make_decision(db_session, company, site, assigned_to=sup.id)
    other = await factory.user(role=UserRole.owner)  # different company

    resp = await client.post(
        f"/api/v1/approvals/{d.id}/respond", json={"action": "confirm"}, headers=auth(other)
    )
    assert resp.status_code == 404


async def test_respond_site_not_in_scope_is_403(client, db_session, company, factory):
    # A supervisor with NO assignment to the decision's site cannot respond.
    sup = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company=company, name="Unassigned site")
    d = await _make_decision(db_session, company, site, assigned_to=None)

    resp = await client.post(
        f"/api/v1/approvals/{d.id}/respond", json={"action": "confirm"}, headers=auth(sup)
    )
    assert resp.status_code == 403


async def test_asks_for_me_returns_only_assigned(client, db_session, company, supervisor):
    sup, site = supervisor
    mine = await _make_decision(db_session, company, site, assigned_to=sup.id)
    not_mine = await _make_decision(db_session, company, site, assigned_to=None)

    resp = await client.get("/api/v1/approvals?for=me", headers=auth(sup))
    assert resp.status_code == 200, resp.text
    ids = {d["id"] for d in resp.json()["items"]}
    assert str(mine.id) in ids
    assert str(not_mine.id) not in ids


async def test_respond_reject_transitions(client, db_session, company, supervisor):
    sup, site = supervisor
    d = await _make_decision(db_session, company, site, assigned_to=sup.id)

    resp = await client.post(
        f"/api/v1/approvals/{d.id}/respond", json={"action": "reject"}, headers=auth(sup)
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == DecisionState.rejected.value
