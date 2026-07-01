import pytest
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.models.homeowner_feed import PublishedPhoto
from app.models.user import UserRole
from app.sites.models import SiteAssignment

pytestmark = pytest.mark.asyncio


def _auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _publish(client, ctx, by, image="chat/x/a.jpg"):
    res = await client.post(
        "/api/v1/publish/photo",
        json={"site_id": str(ctx.site.id), "image_url": image, "caption": "x"},
        headers=_auth(by),
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def test_owner_edits_caption_and_pin(client, ctx, fake_llm):
    pid = await _publish(client, ctx, ctx.owner)
    res = await client.patch(
        f"/api/v1/publish/photo/{pid}",
        json={"caption": "Kitchen plaster done", "is_starred": True},
        headers=_auth(ctx.owner),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["caption"] == "Kitchen plaster done"
    assert body["is_starred"] is True
    feed = await client.get("/api/v1/homeowner/photos", headers=_auth(ctx.homeowner))
    item = next(i for i in feed.json()["items"] if i["id"] == pid)
    assert item["caption"] == "Kitchen plaster done"


async def test_crew_cannot_edit_others_photo(client, ctx, factory, db_session, fake_llm):
    crew = await factory.user(company=ctx.company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=ctx.site.id, user_id=crew.id))
    await db_session.flush()
    pid = await _publish(client, ctx, ctx.owner)   # owner publishes, NOT the crew
    res = await client.patch(
        f"/api/v1/publish/photo/{pid}", json={"caption": "hi"}, headers=_auth(crew)
    )
    assert res.status_code == 403, res.text


async def test_crew_can_edit_own_photo(client, ctx, factory, db_session, fake_llm):
    crew = await factory.user(company=ctx.company, role=UserRole.supervisor)
    # Supervisor needs site assignment to publish and edit photos on this site.
    db_session.add(SiteAssignment(site_id=ctx.site.id, user_id=crew.id))
    await db_session.flush()
    pid = await _publish(client, ctx, crew)
    res = await client.patch(
        f"/api/v1/publish/photo/{pid}", json={"room_tag": "kitchen"}, headers=_auth(crew)
    )
    assert res.status_code == 200, res.text
    assert res.json()["room_tag"] == "kitchen"


async def test_edit_explicit_null_is_starred_is_noop(client, ctx, fake_llm):
    pid = await _publish(client, ctx, ctx.owner)
    res = await client.patch(
        f"/api/v1/publish/photo/{pid}", json={"is_starred": None}, headers=_auth(ctx.owner)
    )
    assert res.status_code == 200, res.text
    assert res.json()["is_starred"] is False


async def test_contractor_album_lists_with_attribution(client, ctx, fake_llm):
    pid = await _publish(client, ctx, ctx.owner)
    res = await client.get(
        f"/api/v1/publish/photos?site_id={ctx.site.id}", headers=_auth(ctx.owner)
    )
    assert res.status_code == 200, res.text
    row = next(i for i in res.json() if i["id"] == pid)
    assert "shared_by_name" in row


async def test_album_requires_site_scope(client, ctx, factory, fake_llm):
    other_company = await factory.company()
    outsider = await factory.user(company=other_company, role=UserRole.owner)
    res = await client.get(
        f"/api/v1/publish/photos?site_id={ctx.site.id}", headers=_auth(outsider)
    )
    assert res.status_code in (403, 404), res.text


async def test_enrich_returns_advisory_draft_and_persists_nothing(
    client, ctx, db_session, fake_llm
):
    before = len((await db_session.execute(select(PublishedPhoto))).all())
    res = await client.post(
        "/api/v1/publish/photo/enrich",
        json={"site_id": str(ctx.site.id), "image_url": "chat/x/a.jpg"},
        headers=_auth(ctx.owner),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "caption_draft" in body and "room_hint" in body
    after = len((await db_session.execute(select(PublishedPhoto))).all())
    assert after == before


async def test_publish_no_caption_survives_vision_failure(client, ctx):
    # Regression (prod 500): publish with caption=None drafts via vision; a
    # vision failure (real provider can't fetch the bare key, model down, etc.)
    # must NOT 500 — the draft is advisory. Before the fix this raised → HTTP 500.
    from app.homeowner.ai import get_llm
    from app.main import app

    class _BoomLLM:
        async def complete(self, *a, **k):
            raise RuntimeError("vision unavailable")

        async def complete_vision(self, *a, **k):
            raise RuntimeError("vision unavailable")

    app.dependency_overrides[get_llm] = lambda: _BoomLLM()
    try:
        res = await client.post(
            "/api/v1/publish/photo",
            json={"site_id": str(ctx.site.id), "image_url": "chat/x/a.jpg", "room_tag": "Kitchen"},
            headers=_auth(ctx.owner),
        )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["caption"] is None
        assert body["draft_caption"] is None
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_publish_with_draft_false_skips_vision(client, ctx, fake_llm):
    # The contractor app publishes with ?with_draft=false so the share returns
    # instantly (no vision in the critical path); the draft is fetched via
    # /photo/enrich separately. draft_caption must be None even though a (fake)
    # LLM is wired.
    res = await client.post(
        "/api/v1/publish/photo?with_draft=false",
        json={"site_id": str(ctx.site.id), "image_url": "chat/x/a.jpg", "room_tag": "Kitchen"},
        headers=_auth(ctx.owner),
    )
    assert res.status_code == 201, res.text
    assert res.json()["draft_caption"] is None
    assert res.json()["caption"] is None


async def test_owner_can_delete_photo(client, ctx, fake_llm):
    pid = await _publish(client, ctx, ctx.owner)
    res = await client.delete(f"/api/v1/publish/photo/{pid}", headers=_auth(ctx.owner))
    assert res.status_code == 204, res.text
    feed = await client.get("/api/v1/homeowner/photos", headers=_auth(ctx.homeowner))
    assert all(i["id"] != pid for i in feed.json()["items"])


async def test_crew_cannot_delete_others_photo(client, ctx, factory, db_session, fake_llm):
    crew = await factory.user(company=ctx.company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=ctx.site.id, user_id=crew.id))
    await db_session.flush()
    pid = await _publish(client, ctx, ctx.owner)  # owner published, not the crew
    res = await client.delete(f"/api/v1/publish/photo/{pid}", headers=_auth(crew))
    assert res.status_code == 403, res.text


async def test_home_heartbeat_counts_photos_this_week(client, ctx, fake_llm, fake_translation):
    # Phase 2 heartbeat: /home reports how many contractor photos landed this week
    # + when the last one did, so silence reads as a "slow day", not "hiding".
    await _publish(client, ctx, ctx.owner)
    res = await client.get("/api/v1/homeowner/home", headers=_auth(ctx.homeowner))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["photos_this_week"] >= 1
    assert body["last_photo_at"] is not None
