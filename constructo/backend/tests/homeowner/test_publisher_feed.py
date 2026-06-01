"""H0 publisher → feed: a contractor publishes and it appears in the homeowner
feed; AI captions/summaries are drafted (FakeLLM); and a homeowner can never see
another site's feed."""
from .conftest import auth


async def test_publish_photo_appears_in_homeowner_feed(client, ctx, fake_llm):
    # Caption omitted → AI-drafted from the supplied event summary (no network).
    # Honest-AI gate: the draft is returned for the CONTRACTOR (draft_caption),
    # NOT auto-published — the homeowner-visible caption stays null until reviewed.
    pub = await client.post(
        "/api/v1/publish/photo",
        json={
            "site_id": str(ctx.site.id),
            "image_url": "http://cdn/slab.jpg",
            "room_tag": "kitchen",
            "event_summary": "Slab concrete poured on the ground floor",
        },
        headers=auth(ctx.owner),
    )
    assert pub.status_code == 201, pub.text
    photo = pub.json()
    assert photo["caption"] is None  # not auto-published — pending contractor review
    assert photo["draft_caption"] is not None
    assert "Slab concrete poured" in photo["draft_caption"]  # drafted, no invention

    # The homeowner sees the photo (room tag) but NOT the unreviewed AI caption.
    feed = await client.get("/api/v1/homeowner/photos", headers=auth(ctx.homeowner))
    assert feed.status_code == 200, feed.text
    items = feed.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == photo["id"]
    assert items[0]["room_tag"] == "kitchen"
    assert items[0]["caption"] is None  # the draft never crossed the gate

    # Contractor reviews + re-publishes the draft verbatim → now homeowner-visible.
    reviewed = await client.post(
        "/api/v1/publish/photo",
        json={
            "site_id": str(ctx.site.id),
            "image_url": "http://cdn/slab.jpg",
            "room_tag": "kitchen",
            "caption": photo["draft_caption"],
        },
        headers=auth(ctx.owner),
    )
    assert reviewed.json()["caption"] == photo["draft_caption"]


async def test_publish_explicit_caption_used_verbatim(client, ctx, fake_llm):
    pub = await client.post(
        "/api/v1/publish/photo",
        json={
            "site_id": str(ctx.site.id),
            "image_url": "http://cdn/x.jpg",
            "caption": "Your kitchen is taking shape!",
        },
        headers=auth(ctx.owner),
    )
    assert pub.status_code == 201
    assert pub.json()["caption"] == "Your kitchen is taking shape!"


async def test_publish_update_and_weekly_summary(client, ctx, fake_llm):
    u = await client.post(
        "/api/v1/publish/update",
        json={"site_id": str(ctx.site.id), "type": "progress", "title": "Plastering started"},
        headers=auth(ctx.owner),
    )
    assert u.status_code == 201, u.text

    # Weekly summary text omitted → AI-drafted from the week's update titles.
    ws = await client.post(
        "/api/v1/publish/weekly-summary",
        json={"site_id": str(ctx.site.id), "week_start": "2026-05-25"},
        headers=auth(ctx.owner),
    )
    assert ws.status_code == 201, ws.text
    assert ws.json()["text"]

    updates = await client.get("/api/v1/homeowner/updates", headers=auth(ctx.homeowner))
    assert updates.status_code == 200
    assert [x["title"] for x in updates.json()["items"]] == ["Plastering started"]

    weekly = await client.get("/api/v1/homeowner/weekly-summary", headers=auth(ctx.homeowner))
    assert weekly.status_code == 200
    assert len(weekly.json()) == 1


async def test_property_skeleton_and_home_dashboard(client, ctx):
    # Build the published skeleton + a milestone.
    prop = await client.post(
        "/api/v1/publish/property",
        json={"site_id": str(ctx.site.id), "display_name": "Sunrise Villa", "status": "building"},
        headers=auth(ctx.owner),
    )
    assert prop.status_code == 201, prop.text

    space = await client.post(
        "/api/v1/publish/spaces",
        json={"site_id": str(ctx.site.id), "name": "Kitchen", "kind": "room"},
        headers=auth(ctx.owner),
    )
    assert space.status_code == 201, space.text
    space_id = space.json()["id"]

    c1 = await client.post(
        "/api/v1/publish/components",
        json={"space_id": space_id, "name": "Cabinets", "status": "done"},
        headers=auth(ctx.owner),
    )
    assert c1.status_code == 201
    await client.post(
        "/api/v1/publish/components",
        json={"space_id": space_id, "name": "Counter", "status": "in_progress"},
        headers=auth(ctx.owner),
    )

    await client.post(
        "/api/v1/publish/milestones",
        json={"site_id": str(ctx.site.id), "name": "Foundation", "status": "now"},
        headers=auth(ctx.owner),
    )

    # Property overview shows per-space progress (1 of 2 components done -> 0.5).
    overview = await client.get("/api/v1/homeowner/property", headers=auth(ctx.homeowner))
    assert overview.status_code == 200, overview.text
    spaces = overview.json()["spaces"]
    assert len(spaces) == 1
    assert spaces[0]["progress"] == 0.5
    assert len(spaces[0]["components"]) == 2

    # Home dashboard composes property + current milestone.
    home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    assert home.status_code == 200, home.text
    payload = home.json()
    assert payload["property"]["display_name"] == "Sunrise Villa"
    assert payload["milestone_now"]["name"] == "Foundation"
    assert payload["milestone_next"] is None


async def test_homeowner_cannot_see_another_site(client, ctx, factory, db_session):
    # A second site in the same company, with its own published photo.
    other_site = await factory.site(ctx.company, name="Other Site")
    other_photo = await client.post(
        "/api/v1/publish/photo",
        json={"site_id": str(other_site.id), "image_url": "http://cdn/other.jpg"},
        headers=auth(ctx.owner),
    )
    assert other_photo.status_code == 201

    # Explicitly asking for the other site is forbidden.
    forbidden = await client.get(
        f"/api/v1/homeowner/photos?site_id={other_site.id}", headers=auth(ctx.homeowner)
    )
    assert forbidden.status_code == 403

    # The default feed only returns the homeowner's own (empty) site.
    own = await client.get("/api/v1/homeowner/photos", headers=auth(ctx.homeowner))
    assert own.status_code == 200
    assert own.json()["items"] == []


async def test_changes_log_running_totals(client, ctx):
    for amt, days in [(5000, 2), (12000, 1)]:
        r = await client.post(
            "/api/v1/publish/changes",
            json={
                "site_id": str(ctx.site.id),
                "description": f"change {amt}",
                "cost_delta": amt,
                "schedule_delta_days": days,
            },
            headers=auth(ctx.owner),
        )
        assert r.status_code == 201, r.text

    log = await client.get("/api/v1/homeowner/changes", headers=auth(ctx.homeowner))
    assert log.status_code == 200, log.text
    body = log.json()
    assert len(body["items"]) == 2
    assert body["total_cost_delta"] == 17000.0
    assert body["total_schedule_delta_days"] == 3
