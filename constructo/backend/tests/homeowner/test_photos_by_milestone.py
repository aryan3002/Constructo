"""By-Milestone photo grouping: each photo is bucketed into the construction
phase that was active when it was taken — deterministically, by the milestone
date windows (no manual per-photo tagging). This is what powers "see how the
house looked through each phase".
"""
from datetime import UTC, date, datetime

from app.models import Milestone, MilestoneStatus, PublishedPhoto

from .conftest import auth


async def _milestone(db_session, site_id, name, started, order):
    db_session.add(
        Milestone(
            site_id=site_id,
            name=name,
            status=MilestoneStatus.done,
            started_on=started,
            order=order,
        )
    )
    await db_session.flush()


async def _photo(db_session, site_id, url, when):
    db_session.add(PublishedPhoto(site_id=site_id, image_url=url, published_at=when))
    await db_session.flush()


async def test_photos_bucketed_into_active_milestone_by_date(client, ctx, db_session):
    await _milestone(db_session, ctx.site.id, "Foundation", date(2024, 1, 1), 0)
    await _milestone(db_session, ctx.site.id, "Structure", date(2024, 6, 1), 1)
    await _milestone(db_session, ctx.site.id, "Interiors", date(2024, 11, 1), 2)

    # A photo inside each window + one before any milestone started.
    await _photo(db_session, ctx.site.id, "https://x/found.jpg", datetime(2024, 3, 1, tzinfo=UTC))
    await _photo(db_session, ctx.site.id, "https://x/struct.jpg", datetime(2024, 8, 1, tzinfo=UTC))
    await _photo(db_session, ctx.site.id, "https://x/int.jpg", datetime(2024, 12, 1, tzinfo=UTC))
    await _photo(db_session, ctx.site.id, "https://x/early.jpg", datetime(2023, 12, 1, tzinfo=UTC))

    resp = await client.get(
        f"/api/v1/homeowner/photos?view=milestone&site_id={ctx.site.id}",
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    by_url = {it["image_url"].split("/")[-1].split("?")[0]: it for it in resp.json()["items"]}
    assert by_url["found.jpg"]["milestone_label"] == "Foundation"
    assert by_url["struct.jpg"]["milestone_label"] == "Structure"
    assert by_url["int.jpg"]["milestone_label"] == "Interiors"
    # A photo before any milestone started has no phase bucket.
    assert by_url["early.jpg"]["milestone_label"] is None
