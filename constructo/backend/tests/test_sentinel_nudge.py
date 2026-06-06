"""Standing Sentinel proactive sweep (Phase 3.1) — one nudge/site/day."""
from datetime import date, timedelta

import pytest_asyncio
from sqlalchemy import func, select

from app.models import Decision, SiteEventModel, UserRole
from app.sentinel.nudge import NUDGE_TAG, run_sentinel_sweep


def _att(site_id, days_ago):
    return SiteEventModel(
        site_id=site_id, event_type="attendance",
        occurred_on=date.today() - timedelta(days=days_ago), summary="attendance",
        fields={"headcount": 8}, confidence=1.0, needs_clarification=False,
        source_message_ids=[],
    )


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, site


async def _sentinel_decisions(db_session, site_id) -> int:
    return (
        await db_session.execute(
            select(func.count())
            .select_from(Decision)
            .where(Decision.site_id == site_id, Decision.title.like(f"{NUDGE_TAG}%"))
        )
    ).scalar_one()


async def test_sweep_nudges_active_site_with_absence(db_session, world):
    _, site = world
    # Active site (attendance 4 prior days), none today → absence signal.
    db_session.add_all([_att(site.id, d) for d in (1, 2, 3, 4)])
    await db_session.flush()

    nudged = await run_sentinel_sweep(db_session)
    assert site.id in nudged
    assert await _sentinel_decisions(db_session, site.id) == 1


async def test_sweep_is_one_per_site_per_day(db_session, world):
    _, site = world
    db_session.add_all([_att(site.id, d) for d in (1, 2, 3, 4)])
    await db_session.flush()

    first = await run_sentinel_sweep(db_session)
    second = await run_sentinel_sweep(db_session)  # same day → deduped
    assert site.id in first
    assert site.id not in second
    assert await _sentinel_decisions(db_session, site.id) == 1


async def test_sweep_skips_quiet_site(db_session, world):
    _, site = world
    db_session.add(_att(site.id, 0))  # attendance today, no rhythm → nothing slipping
    await db_session.flush()
    nudged = await run_sentinel_sweep(db_session)
    assert site.id not in nudged
    assert await _sentinel_decisions(db_session, site.id) == 0


async def test_admin_trigger_endpoint(client, factory, db_session):
    from app.auth.jwt import create_access_token

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    db_session.add_all([_att(site.id, d) for d in (1, 2, 3, 4)])
    await db_session.flush()

    headers = {"Authorization": f"Bearer {create_access_token(str(owner.id), owner.role.value)}"}
    resp = await client.post("/api/v1/admin/run-sentinel-sweep", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["count"] >= 1
