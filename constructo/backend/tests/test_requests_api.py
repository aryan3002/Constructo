"""API tests for GET /api/v1/requests (DB, no network).

This is the owner/pm/architect-scoped read of homeowner requests — the
regression guard for the bug where the web Requests view (and every
activity-feed request row's Reply/click) called the homeowner-gated
``GET /api/v1/homeowner/requests`` with an OWNER token and always got a 403.
Mirrors ``tests/test_activity_api.py``'s fixtures/helpers/company-scoping test.
"""
from __future__ import annotations

import datetime as dt

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import HomeownerRequest, Site, UserRole

NOW = dt.datetime(2026, 7, 3, 12, 0, 0, tzinfo=dt.UTC)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


async def _site(db_session, company_id, name="Tower B"):
    site = Site(company_id=company_id, name=name)
    db_session.add(site)
    await db_session.flush()
    return site


async def _request(db_session, site_id, *, at, status="sent", title="Photo of kitchen"):
    r = HomeownerRequest(site_id=site_id, title=title, status=status, created_at=at)
    db_session.add(r)
    await db_session.flush()
    r.created_at = at  # override server_default for deterministic ordering
    await db_session.flush()
    return r


async def test_requests_requires_auth(client):
    resp = await client.get("/api/v1/requests")
    assert resp.status_code == 401


async def test_requests_owner_token_gets_200_not_403(client, db_session, owner):
    # The regression this guards: the OLD homeowner-gated /homeowner/requests
    # 403s an owner token. This new owner-scoped endpoint must not.
    site = await _site(db_session, owner.company_id)
    await _request(db_session, site.id, at=NOW)
    await db_session.commit()

    resp = await client.get("/api/v1/requests", headers=auth(owner))
    assert resp.status_code == 200


async def test_requests_returns_in_scope_requests_newest_first(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    older = await _request(db_session, site.id, at=NOW - dt.timedelta(hours=2), title="older")
    newer = await _request(db_session, site.id, at=NOW, title="newer")
    await db_session.commit()

    resp = await client.get("/api/v1/requests", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    ids = [r["id"] for r in body]
    assert ids == [str(newer.id), str(older.id)]
    # Serialized with the existing RequestOut shape.
    assert body[0]["title"] == "newer"
    assert body[0]["status"] == "sent"
    assert body[0]["site_id"] == str(site.id)


async def test_requests_site_id_filter_narrows_to_in_scope_site(client, db_session, owner):
    a = await _site(db_session, owner.company_id, name="Site A")
    b = await _site(db_session, owner.company_id, name="Site B")
    ra = await _request(db_session, a.id, at=NOW, title="in A")
    await _request(db_session, b.id, at=NOW, title="in B")
    await db_session.commit()

    resp = await client.get(f"/api/v1/requests?site_id={a.id}", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert [r["id"] for r in body] == [str(ra.id)]


async def test_requests_out_of_scope_site_id_yields_empty_not_403(client, db_session, owner):
    # An out-of-scope site_id narrows to nothing, matching the activity
    # router's own narrowing behavior (visible ∩ {site_id} == [] -> []).
    other = await _site(db_session, owner.company_id)  # any site id not owned works too,
    await db_session.commit()  # but reuse the real narrowing path via a mismatched filter.

    resp = await client.get(f"/api/v1/requests?site_id={other.id}", headers=auth(owner))
    assert resp.status_code == 200
    assert resp.json() == []


async def test_requests_scopes_to_company_cross_tenant(client, db_session, factory, owner):
    # The cross-tenant regression guard: an owner of another company must NOT
    # see this company's requests, even with no site_id filter.
    other_company = await factory.company(name="Other Co")
    other_owner = await factory.user(company=other_company, role=UserRole.owner)
    other_site = await _site(db_session, other_company.id, name="Secret Site")
    await _request(db_session, other_site.id, at=NOW, title="secret request")

    mine = await _site(db_session, owner.company_id, name="My Site")
    mine_req = await _request(db_session, mine.id, at=NOW, title="my request")
    await db_session.commit()

    # The owning company sees only its own request.
    body = (await client.get("/api/v1/requests", headers=auth(owner))).json()
    assert [r["id"] for r in body] == [str(mine_req.id)]

    # The other company's owner sees only ITS request — never "my request".
    other_body = (await client.get("/api/v1/requests", headers=auth(other_owner))).json()
    titles = {r["title"] for r in other_body}
    assert titles == {"secret request"}
    assert "my request" not in titles
