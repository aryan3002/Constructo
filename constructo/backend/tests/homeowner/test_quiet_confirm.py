"""H6 — contractor confirm endpoint makes the quiet period END-TO-END.

The sweep drafts a ``suggested`` quiet window (invisible to the homeowner); the
contractor-authenticated POST /api/v1/publish/quiet-periods/{id}/confirm is the
human gate that publishes it. Before confirm the homeowner sees nothing; after
confirm the card surfaces via GET /quiet-periods and HomeOut.quiet.
"""
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.homeowner.quiet import run_quiet_period_sweep
from app.models import Milestone, MilestoneStatus, PublishedPhoto, QuietPeriod, QuietStatus

from .conftest import auth


async def _seed_stale_quiet(db_session, site_id) -> None:
    db_session.add(
        PublishedPhoto(
            site_id=site_id,
            image_url="https://x/p.jpg",
            published_at=datetime.now(UTC) - timedelta(days=5),
        )
    )
    db_session.add(
        Milestone(site_id=site_id, name="Slab curing", status=MilestoneStatus.now, order=0)
    )
    await db_session.flush()
    await run_quiet_period_sweep(db_session, now=datetime.now(UTC))


async def test_confirm_publishes_quiet_card_end_to_end(client, ctx, db_session):
    await _seed_stale_quiet(db_session, ctx.site.id)

    win = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == ctx.site.id)
        )
    ).scalars().one()
    assert win.status == QuietStatus.suggested

    # BEFORE confirm: the homeowner sees nothing.
    before_qp = await client.get(
        "/api/v1/homeowner/quiet-periods", headers=auth(ctx.homeowner)
    )
    assert before_qp.json() == []
    before_home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    assert before_home.json()["quiet"] is None

    # Contractor confirms (the human gate).
    resp = await client.post(
        f"/api/v1/publish/quiet-periods/{win.id}/confirm", headers=auth(ctx.owner)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "published"
    assert resp.json()["reason"]

    # AFTER confirm: the homeowner now sees the card on /quiet-periods and /home.
    after_qp = await client.get(
        "/api/v1/homeowner/quiet-periods", headers=auth(ctx.homeowner)
    )
    assert len(after_qp.json()) == 1
    after_home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    quiet = after_home.json()["quiet"]
    assert quiet is not None
    assert quiet["reason"]

    # The DB row reflects the gate transition + audit.
    await db_session.refresh(win)
    assert win.status == QuietStatus.published
    assert win.confirmed_by == ctx.owner.id
    assert win.confirmed_at is not None


async def test_confirm_is_idempotent(client, ctx, db_session):
    await _seed_stale_quiet(db_session, ctx.site.id)
    win = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == ctx.site.id)
        )
    ).scalars().one()

    first = await client.post(
        f"/api/v1/publish/quiet-periods/{win.id}/confirm", headers=auth(ctx.owner)
    )
    assert first.status_code == 200
    second = await client.post(
        f"/api/v1/publish/quiet-periods/{win.id}/confirm", headers=auth(ctx.owner)
    )
    assert second.status_code == 200
    assert second.json()["status"] == "published"


async def test_confirm_rejects_site_out_of_scope(client, ctx, factory, db_session):
    """A contractor in another company cannot confirm this site's window."""
    await _seed_stale_quiet(db_session, ctx.site.id)
    win = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == ctx.site.id)
        )
    ).scalars().one()

    other_company = await factory.company(name="Rival Builders")
    from app.models import UserRole

    intruder = await factory.user(company=other_company, role=UserRole.owner)
    resp = await client.post(
        f"/api/v1/publish/quiet-periods/{win.id}/confirm", headers=auth(intruder)
    )
    assert resp.status_code in (403, 404)
