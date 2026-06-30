import pytest

from app.auth.jwt import create_access_token
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
