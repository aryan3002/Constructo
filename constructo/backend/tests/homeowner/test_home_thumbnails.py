"""Home recent-activity thumbnails: each update must get a DISTINCT real photo.

Regression: the thumbnail was keyed by the update's calendar day, so multiple
updates published on the same day all resolved to the SAME photo. Each recent
item should instead show its own distinct site photo.
"""
from datetime import UTC, datetime, timedelta

from app.models import PublishedPhoto, Update, UpdateType

from .conftest import auth


async def _update(db_session, site_id, title, when):
    db_session.add(
        Update(site_id=site_id, type=UpdateType.progress, title=title, published_at=when)
    )
    await db_session.flush()


async def _photo(db_session, site_id, url, when):
    db_session.add(PublishedPhoto(site_id=site_id, image_url=url, published_at=when))
    await db_session.flush()


async def test_same_day_updates_get_distinct_thumbnails(client, ctx, db_session):
    day = datetime(2026, 5, 1, 9, 0, tzinfo=UTC)
    # Two updates on the SAME calendar day.
    await _update(db_session, ctx.site.id, "Granite top work", day)
    await _update(db_session, ctx.site.id, "Stair skating work", day + timedelta(hours=2))
    # Two distinct photos on that same day.
    await _photo(db_session, ctx.site.id, "https://x/a.jpg", day + timedelta(minutes=30))
    await _photo(db_session, ctx.site.id, "https://x/b.jpg", day + timedelta(hours=1))

    home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    assert home.status_code == 200, home.text
    thumbs = [u.get("thumbnail_url") for u in home.json()["recent_activity"]]
    present = [t for t in thumbs if t]
    assert len(present) == 2, f"expected 2 thumbnails, got {thumbs}"
    # The crux: the two same-day updates must NOT share one photo.
    assert len(set(present)) == 2, f"thumbnails should be distinct, got {present}"
