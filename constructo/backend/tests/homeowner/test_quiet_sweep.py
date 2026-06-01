"""H6 Slice Q — quiet-period detection sweep + the contractor│homeowner gate.

Network-free (FakeLLMClient via the sweep's default ``get_llm_client``). Asserts
PLUMBING and GATES, never recall quality:

* a stale site with a known phase → ONE draft quiet Update + a QuietPeriod row
  (status ``suggested``), and that draft is NOT visible in the homeowner feed;
* a stale site with NO known phase reason → ABSTAINS (no homeowner-facing
  Update; a contractor nudge Decision is raised instead);
* the sweep is idempotent (a second run no-ops while a live window exists);
* once the window is confirmed, the quiet Update appears in the feed and as the
  ``quiet`` card on /home and via /quiet-periods.
"""
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.homeowner.quiet import QUIET_NUDGE_TAG, run_quiet_period_sweep
from app.models import (
    Decision,
    Milestone,
    MilestoneStatus,
    PublishedPhoto,
    QuietPeriod,
    QuietStatus,
    Update,
    UpdateType,
)

from .conftest import auth


async def _stale_photo(db_session, site_id, *, days_ago: int) -> None:
    """A homeowner-visible signal that is ``days_ago`` days old."""
    db_session.add(
        PublishedPhoto(
            site_id=site_id,
            image_url="https://x/p.jpg",
            published_at=datetime.now(UTC) - timedelta(days=days_ago),
        )
    )
    await db_session.flush()


async def _now_milestone(db_session, site_id, name: str) -> None:
    db_session.add(
        Milestone(site_id=site_id, name=name, status=MilestoneStatus.now, order=0)
    )
    await db_session.flush()


async def test_stale_site_with_phase_drafts_one_quiet_update(ctx, db_session):
    await _stale_photo(db_session, ctx.site.id, days_ago=5)
    await _now_milestone(db_session, ctx.site.id, "Slab curing")

    acted = await run_quiet_period_sweep(db_session, now=datetime.now(UTC))
    assert acted == [ctx.site.id]

    # Exactly one quiet Update (a DRAFT) and one QuietPeriod (suggested).
    quiet_updates = (
        await db_session.execute(
            select(Update).where(
                Update.site_id == ctx.site.id, Update.type == UpdateType.quiet
            )
        )
    ).scalars().all()
    assert len(quiet_updates) == 1

    windows = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == ctx.site.id)
        )
    ).scalars().all()
    assert len(windows) == 1
    win = windows[0]
    assert win.status == QuietStatus.suggested
    assert win.update_id == quiet_updates[0].id
    assert win.draft_text and win.draft_text.strip()
    assert win.gap_days >= 3


async def test_stale_site_with_no_phase_reason_abstains(ctx, db_session):
    # Stale, but the milestone name maps to no known low-visibility reason.
    await _stale_photo(db_session, ctx.site.id, days_ago=5)
    await _now_milestone(db_session, ctx.site.id, "Mystery phase")

    acted = await run_quiet_period_sweep(db_session, now=datetime.now(UTC))
    assert acted == [ctx.site.id]

    # ABSTAIN: no homeowner-facing quiet Update, no QuietPeriod row.
    quiet_updates = (
        await db_session.execute(
            select(Update).where(
                Update.site_id == ctx.site.id, Update.type == UpdateType.quiet
            )
        )
    ).scalars().all()
    assert quiet_updates == []
    windows = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == ctx.site.id)
        )
    ).scalars().all()
    assert windows == []

    # A contractor-facing nudge Decision was raised instead (tagged, never dupes).
    nudges = (
        await db_session.execute(
            select(Decision).where(Decision.title.like(f"{QUIET_NUDGE_TAG}%"))
        )
    ).scalars().all()
    assert len(nudges) == 1
    assert nudges[0].site_id == ctx.site.id


async def test_sweep_is_idempotent(ctx, db_session):
    await _stale_photo(db_session, ctx.site.id, days_ago=5)
    await _now_milestone(db_session, ctx.site.id, "Plaster curing")

    first = await run_quiet_period_sweep(db_session, now=datetime.now(UTC))
    assert first == [ctx.site.id]

    # A second run while the window is still live (and within cooldown) no-ops.
    second = await run_quiet_period_sweep(
        db_session, now=datetime.now(UTC) + timedelta(hours=2)
    )
    assert second == []

    windows = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == ctx.site.id)
        )
    ).scalars().all()
    assert len(windows) == 1  # never double-inserted


async def test_fresh_site_is_not_quiet(ctx, db_session):
    await _stale_photo(db_session, ctx.site.id, days_ago=1)  # within threshold
    await _now_milestone(db_session, ctx.site.id, "Slab curing")

    acted = await run_quiet_period_sweep(db_session, now=datetime.now(UTC))
    assert acted == []


async def test_draft_quiet_update_hidden_from_feed(client, ctx, db_session):
    await _stale_photo(db_session, ctx.site.id, days_ago=5)
    await _now_milestone(db_session, ctx.site.id, "Slab curing")
    await run_quiet_period_sweep(db_session, now=datetime.now(UTC))

    # The unconfirmed quiet update must NOT appear in /updates...
    resp = await client.get("/api/v1/homeowner/updates", headers=auth(ctx.homeowner))
    assert resp.status_code == 200
    types = [it["type"] for it in resp.json()["items"]]
    assert "quiet" not in types

    # ...nor as a quiet card on /home (no confirmed window yet).
    home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    assert home.status_code == 200
    assert home.json()["quiet"] is None
    recent_types = [u["type"] for u in home.json()["recent_activity"]]
    assert "quiet" not in recent_types

    # ...and /quiet-periods returns nothing until confirmed.
    qp = await client.get("/api/v1/homeowner/quiet-periods", headers=auth(ctx.homeowner))
    assert qp.status_code == 200
    assert qp.json() == []


async def test_confirmed_quiet_window_surfaces_in_feed(client, ctx, db_session):
    await _stale_photo(db_session, ctx.site.id, days_ago=5)
    await _now_milestone(db_session, ctx.site.id, "Slab curing")
    await run_quiet_period_sweep(db_session, now=datetime.now(UTC))

    # Contractor confirms the window (the human gate).
    win = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == ctx.site.id)
        )
    ).scalars().one()
    win.status = QuietStatus.confirmed
    win.confirmed_at = datetime.now(UTC)
    await db_session.commit()

    # Now the quiet update is visible in /updates and the /home quiet card shows.
    resp = await client.get("/api/v1/homeowner/updates", headers=auth(ctx.homeowner))
    assert "quiet" in [it["type"] for it in resp.json()["items"]]

    home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    quiet = home.json()["quiet"]
    assert quiet is not None
    assert quiet["status"] == "confirmed"
    assert quiet["reason"]

    qp = await client.get("/api/v1/homeowner/quiet-periods", headers=auth(ctx.homeowner))
    assert len(qp.json()) == 1
