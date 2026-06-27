"""The intelligence engine: load site data -> run detectors -> persist -> score. DB-backed."""
from datetime import date, timedelta

from sqlalchemy import select

from app.intelligence.engine import run_site
from app.models import Milestone, MilestoneStatus, SiteEventModel, SiteFinding

TODAY = date(2026, 6, 25)


async def test_engine_detects_persists_and_scores(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    # plastering running 40 days (typical 10-18) -> stale
    db_session.add(Milestone(
        site_id=site.id, name="Plastering", status=MilestoneStatus.now,
        started_on=TODAY - timedelta(days=40), order=1,
    ))
    # cement delivered 15 days ago, no progress after -> material_work_mismatch
    db_session.add(SiteEventModel(
        site_id=site.id, event_type="material_delivery",
        occurred_on=TODAY - timedelta(days=15), summary="cement aaya",
        fields={"material": "cement"}, confidence=0.9, source_message_ids=[],
    ))
    await db_session.flush()

    result = await run_site(db_session, site.id, today=TODAY)

    types = {f.finding_type for f in result.findings}
    assert "stale_milestone" in types
    assert "material_work_mismatch" in types
    assert result.score < 100
    assert result.band in ("watch", "at_risk")

    persisted = (
        await db_session.execute(select(SiteFinding).where(SiteFinding.site_id == site.id))
    ).scalars().all()
    assert len(persisted) >= 2


async def test_engine_clean_site_is_healthy(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    result = await run_site(db_session, site.id, today=TODAY)
    assert result.findings == []
    assert result.score == 100
    assert result.band == "healthy"
