"""API tests for GET /api/v1/activity (DB, no network)."""
from __future__ import annotations

import base64
import datetime as dt

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import (
    Decision,
    DecisionKind,
    HomeownerRequest,
    PublishedPhoto,
    Site,
    Update,
    UserRole,
)

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


async def _photo(db_session, site_id, *, at, caption="Slab poured"):
    p = PublishedPhoto(site_id=site_id, image_url="https://x/y.jpg",
                       caption=caption, published_at=at)
    db_session.add(p)
    await db_session.flush()
    return p


async def _update(db_session, site_id, *, at, type="progress", title="Wall done"):
    u = Update(site_id=site_id, type=type, title=title, published_at=at)
    db_session.add(u)
    await db_session.flush()
    return u


async def _request(db_session, site_id, *, at, status="sent"):
    r = HomeownerRequest(site_id=site_id, title="Photo of kitchen", status=status,
                         created_at=at)
    db_session.add(r)
    await db_session.flush()
    return r


async def _decision(db_session, company_id, site_id, *, at, state="pending"):
    d = Decision(company_id=company_id, site_id=site_id, kind=DecisionKind.approval,
                 title="Approve advance", created_at=at)
    db_session.add(d)
    await db_session.flush()
    d.created_at = at  # override server_default for deterministic ordering
    await db_session.flush()
    return d


async def test_activity_requires_auth(client):
    resp = await client.get("/api/v1/activity")
    assert resp.status_code == 401


async def test_activity_unions_and_orders_desc(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    older = await _update(db_session, site.id, at=NOW - dt.timedelta(hours=2))
    newer = await _photo(db_session, site.id, at=NOW)
    await db_session.commit()

    resp = await client.get("/api/v1/activity", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    ids = [i["id"] for i in body["items"]]
    assert ids[0] == f"photo_shared:{newer.id}"
    assert f"update_posted:{older.id}" in ids
    # newest first
    assert ids.index(f"photo_shared:{newer.id}") < ids.index(f"update_posted:{older.id}")


async def test_activity_summary_counts(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    await _photo(db_session, site.id, at=NOW)
    await _request(db_session, site.id, at=NOW, status="sent")
    await _decision(db_session, owner.company_id, site.id, at=NOW, state="pending")
    await db_session.commit()

    body = (await client.get("/api/v1/activity", headers=auth(owner))).json()
    s = body["summary"]
    assert s["sites_total"] == 1
    assert s["needs_decision_count"] == 2  # open request + pending decision
    assert s["updates_today"] >= 1


async def test_activity_site_id_filter(client, db_session, owner):
    a = await _site(db_session, owner.company_id, name="Site A")
    b = await _site(db_session, owner.company_id, name="Site B")
    await _photo(db_session, a.id, at=NOW)
    await _photo(db_session, b.id, at=NOW)
    await db_session.commit()

    body = (await client.get(f"/api/v1/activity?site_id={a.id}", headers=auth(owner))).json()
    site_ids = {i["site_id"] for i in body["items"]}
    assert site_ids == {str(a.id)}
    assert body["summary"]["sites_total"] == 1


async def test_activity_keyset_pagination_boundary(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    for m in range(5):
        await _photo(db_session, site.id, at=NOW - dt.timedelta(minutes=m),
                     caption=f"p{m}")
    await db_session.commit()

    page1 = (await client.get("/api/v1/activity?limit=2", headers=auth(owner))).json()
    assert len(page1["items"]) == 2
    assert page1["next_cursor"] is not None
    seen = [i["id"] for i in page1["items"]]

    page2 = (
        await client.get(
            f"/api/v1/activity?limit=2&cursor={page1['next_cursor']}",
            headers=auth(owner),
        )
    ).json()
    assert len(page2["items"]) == 2
    # No overlap across the boundary.
    assert not (set(seen) & {i["id"] for i in page2["items"]})
    # Strictly older than the last item of page1.
    last1 = page1["items"][-1]["occurred_at"]
    assert all(i["occurred_at"] <= last1 for i in page2["items"])


async def test_activity_bad_cursor_is_400(client, owner):
    resp = await client.get("/api/v1/activity?cursor=%21%21bad", headers=auth(owner))
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_cursor"


async def test_activity_cursor_with_garbage_timestamp_is_400(client, db_session, owner):
    # decode_activity_cursor only validates the "occurred_at|id" shape (the "|"
    # delimiter); a cursor that has that shape but a non-ISO occurred_at half
    # must still 400 cleanly rather than 500 when the endpoint parses it — and
    # only reaches that parse once the user has >=1 visible site, so seed one.
    await _site(db_session, owner.company_id)
    await db_session.commit()

    token = base64.urlsafe_b64encode(b"not-a-date|photo_shared:123").decode("ascii")
    resp = await client.get(f"/api/v1/activity?cursor={token}", headers=auth(owner))
    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "invalid_cursor"


async def test_activity_scopes_to_company(client, db_session, factory, owner):
    other = await factory.company(name="Other Co")
    other_site = await _site(db_session, other.id, name="Secret Site")
    await _photo(db_session, other_site.id, at=NOW, caption="secret")

    mine = await _site(db_session, owner.company_id, name="My Site")
    await _photo(db_session, mine.id, at=NOW, caption="mine")
    await db_session.commit()

    body = (await client.get("/api/v1/activity", headers=auth(owner))).json()
    names = {i["site_name"] for i in body["items"]}
    assert names == {"My Site"}
    assert body["summary"]["sites_total"] == 1
