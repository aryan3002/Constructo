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
    SiteFinding,
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


async def _finding(db_session, site_id, *, on, severity="high"):
    f = SiteFinding(
        site_id=site_id, finding_type="stale_milestone", severity=severity,
        status="open", headline="Schedule drift", detail="", phase="plastering",
        dedupe_key="stale_milestone:plastering", evidence=[], detected_on=on,
    )
    db_session.add(f)
    await db_session.flush()
    return f


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
    now = dt.datetime.now(dt.UTC)
    site = await _site(db_session, owner.company_id)
    await _photo(db_session, site.id, at=now)
    await _request(db_session, site.id, at=now, status="sent")
    await _decision(db_session, owner.company_id, site.id, at=now, state="pending")
    await db_session.commit()

    body = (await client.get("/api/v1/activity", headers=auth(owner))).json()
    s = body["summary"]
    assert s["sites_total"] == 1
    assert s["needs_decision_count"] == 2  # open request + pending decision
    assert s["updates_today"] >= 1


async def test_activity_summary_not_undercounted_by_page_limit(client, db_session, owner):
    # Regression guard: the per-source page cap is `page_size + 1`, so with
    # `limit=1` each source query used to fetch only 2 rows — and the summary
    # (specifically needs_decision_count) used to be tallied from those SAME
    # capped rows, silently hiding real pending work. Seed strictly more
    # pending decisions than the cap could ever return at limit=1 (3 pending
    # decisions vs. a cap of 2) and assert the count is still exactly right.
    site = await _site(db_session, owner.company_id)
    for i in range(3):
        await _decision(
            db_session, owner.company_id, site.id,
            at=NOW - dt.timedelta(minutes=i), state="pending",
        )
    await db_session.commit()

    body = (await client.get("/api/v1/activity?limit=1", headers=auth(owner))).json()
    assert len(body["items"]) == 1  # the page itself IS capped to 1...
    assert body["summary"]["needs_decision_count"] == 3  # ...but the summary is not


async def test_activity_finding_link_id_is_site_id_not_finding_id(client, db_session, owner):
    # End-to-end regression guard (real DB row -> real serialized JSON) for the
    # web deep-link bug: linkFor('finding') builds `/health/${link.id}` and the
    # route is /health/:siteId — a finding id there 403/404s. link.id must be
    # the site id.
    site = await _site(db_session, owner.company_id)
    finding = await _finding(db_session, site.id, on=NOW.date())
    await db_session.commit()

    body = (await client.get("/api/v1/activity", headers=auth(owner))).json()
    item = next(i for i in body["items"] if i["kind"] == "site_health_flag")
    assert item["link"] == {"type": "finding", "id": str(site.id)}
    assert item["link"]["id"] != str(finding.id)


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


async def test_activity_keyset_pagination_same_timestamp_tiebreak(client, db_session, owner):
    # Two rows from the SAME source with the EXACT same occurred_at (down to the
    # microsecond) straddling a page boundary. The SQL per-source prefilter
    # (`_cursor_filter`) must over-fetch equal-timestamp rows and let the
    # aggregator's exact `(occurred_at_iso, id) < cursor` tuple trim do the
    # precise cut — a strict `<` at the SQL layer would silently drop whichever
    # of the two rows sorts before the cursor's id, even though it was never
    # returned on page 1 either.
    site = await _site(db_session, owner.company_id)
    tied_at = NOW.replace(microsecond=123456)
    a = await _photo(db_session, site.id, at=tied_at, caption="tied-a")
    b = await _photo(db_session, site.id, at=tied_at, caption="tied-b")
    await db_session.commit()

    page1 = (await client.get("/api/v1/activity?limit=1", headers=auth(owner))).json()
    assert len(page1["items"]) == 1
    assert page1["next_cursor"] is not None
    seen_ids = {i["id"] for i in page1["items"]}

    page2 = (
        await client.get(
            f"/api/v1/activity?limit=1&cursor={page1['next_cursor']}",
            headers=auth(owner),
        )
    ).json()
    assert len(page2["items"]) == 1
    seen_ids |= {i["id"] for i in page2["items"]}

    expected_ids = {f"photo_shared:{a.id}", f"photo_shared:{b.id}"}
    assert seen_ids == expected_ids, (
        f"expected both same-timestamp rows across the two pages, got {seen_ids}"
    )


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


async def test_activity_includes_design_brief_handoffs(client, db_session, factory, owner):
    # Reuse the profiler membrane's _world helper to seed a real brief +
    # approval through the actual API (profiler tables have no site_id of
    # their own, so a hand-rolled row would skip the join-scoping this
    # exercises). The world's company/owner are separate from the `owner`
    # fixture above — GET /api/v1/activity must be scoped per-company.
    from app.extraction.llm import FakeLLMClient
    from app.main import app
    from app.profiler.extraction import get_llm
    from tests.test_profiler_api import auth as profiler_auth
    from tests.test_profiler_membrane import _world

    def _brief_llm() -> FakeLLMClient:
        return FakeLLMClient(canned={
            "headline": "h", "summary": "s", "sections": [],
            "themes": [
                {"name": "T", "palette": ["beige"], "materials": ["light oak"], "rationale": "r"},
            ],
            "questions": ["q?"], "colors": ["dark"], "style": "minimal", "confidence": 0.9,
        })

    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        resp = await client.post(
            f"/api/v1/design/briefs/{w['bid']}/approval",
            json={"action": "send_to_architect"},
            headers=profiler_auth(w["owner"]),
        )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_llm, None)

    # The world's company owner (a homeowner-role user) can't hit the
    # owner-only /api/v1/activity endpoint — create a genuine company-owner
    # user in the SAME company as the design world to read the feed back.
    company_owner = await factory.user(company=w["company"], role=UserRole.owner)

    body = (await client.get("/api/v1/activity", headers=auth(company_owner))).json()
    design_items = [i for i in body["items"] if i["kind"] == "design_update"]
    titles = {i["title"] for i in design_items}
    assert "Design brief sent to designer" in titles
    assert "Design brief v1 ready" in titles
    sent_item = next(i for i in design_items if i["title"] == "Design brief sent to designer")
    assert sent_item["link"] == {"type": "design_brief", "id": str(w["site"].id)}

    # Cross-visibility: a different company's owner must not see any of this.
    other = await factory.company(name="Other Co")
    other_owner = await factory.user(company=other, role=UserRole.owner)
    other_body = (await client.get("/api/v1/activity", headers=auth(other_owner))).json()
    assert all(i["kind"] != "design_update" for i in other_body["items"])


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
