"""In-app notification inbox: an event persists a feed row; unread + mark-seen."""
from __future__ import annotations

from app.push import sender

from .conftest import auth


async def test_inbox_lists_event_and_mark_seen_clears_unread(client, db_session, ctx):
    sender.reset_dry_run_log()

    # An event (here a photo publish) persists an inbox notification for the site.
    await sender.notify_site_homeowners(
        db_session,
        ctx.site.id,
        "New photo from your site",
        "Your builder shared a new photo.",
        category="site_updates",
        data={"type": "photo", "photo_id": "abc"},
    )

    # The feed lists it, unread.
    r = await client.get("/api/v1/homeowner/notifications", headers=auth(ctx.homeowner))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["unread_count"] == 1
    assert out["items"][0]["type"] == "photo"
    assert out["items"][0]["data"]["photo_id"] == "abc"
    assert out["items"][0]["is_unread"] is True

    # Marking seen clears the unread count.
    s = await client.post("/api/v1/homeowner/notifications/seen", headers=auth(ctx.homeowner))
    assert s.status_code == 204
    r2 = await client.get("/api/v1/homeowner/notifications", headers=auth(ctx.homeowner))
    out2 = r2.json()
    assert out2["unread_count"] == 0
    assert out2["items"][0]["is_unread"] is False
