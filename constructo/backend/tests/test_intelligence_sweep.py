"""Nightly intelligence sweep across all sites — DB-backed, error-isolated."""
from datetime import date, timedelta

from sqlalchemy import select

from app.intelligence.sweep import run_intelligence_sweep
from app.models import Milestone, MilestoneStatus, SiteFinding

TODAY = date(2026, 6, 25)


async def test_sweep_processes_every_site(db_session, factory):
    company = await factory.company()
    site1 = await factory.site(company, name="Site 1")
    site2 = await factory.site(company, name="Site 2")
    db_session.add(Milestone(
        site_id=site1.id, name="Plastering", status=MilestoneStatus.now,
        started_on=TODAY - timedelta(days=40), order=1,
    ))
    await db_session.flush()

    done = await run_intelligence_sweep(db_session, today=TODAY)

    assert set(done) == {site1.id, site2.id}
    s1 = (
        await db_session.execute(select(SiteFinding).where(SiteFinding.site_id == site1.id))
    ).scalars().all()
    s2 = (
        await db_session.execute(select(SiteFinding).where(SiteFinding.site_id == site2.id))
    ).scalars().all()
    assert len(s1) >= 1   # stale plastering flagged
    assert len(s2) == 0   # clean site, no findings
