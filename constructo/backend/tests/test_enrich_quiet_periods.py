"""Quiet-period-enrichment pass (scripts.enrich_quiet_periods) — deterministic.

Seeds the imported company/site + site events whose dates leave a >7-day gap and
asserts:
  * one QuietPeriod is detected for the gap (gap_days correct, status open),
  * events packed tightly (no >=7-day gap) yield zero periods, and
  * a second run() creates no duplicates (uuid5 idempotency).
"""
from contextlib import asynccontextmanager
from datetime import date
from uuid import uuid4

from sqlalchemy import func, select

import scripts.enrich_quiet_periods as eq
from app.models import Company, QuietPeriod, QuietStatus, Site, SiteEventModel


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


async def _seed(db_session, days: list[date]) -> Site:
    """Imported company + site + one progress event on each given date."""
    company = Company(id=eq._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=eq._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()

    for d in days:
        db_session.add(
            SiteEventModel(
                id=uuid4(),
                site_id=site.id,
                event_type="progress_update",
                occurred_on=d,
                summary=f"Work on {d.isoformat()}",
                fields={},
                confidence=0.7,
                source_message_ids=[],
            )
        )
    await db_session.flush()
    return site


async def test_enrich_quiet_periods_detects_gap(db_session):
    # 10-day gap between Mar 1 and Mar 11 (>= 7), then a 1-day step.
    site = await _seed(db_session, [date(2026, 3, 1), date(2026, 3, 11), date(2026, 3, 12)])
    sf = _session_factory(db_session)

    counts = await eq.run(session_factory=sf)

    assert counts["gaps"] == 1
    assert counts["quiet_periods"] == 1

    rows = (
        await db_session.execute(
            select(QuietPeriod).where(QuietPeriod.site_id == site.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    qp = rows[0]
    assert qp.gap_days == 10
    assert qp.status == QuietStatus.open
    assert qp.phase_reason is None  # never invented


async def test_enrich_quiet_periods_no_gap_is_zero(db_session):
    # Consecutive days — no gap reaches the 7-day threshold.
    site = await _seed(
        db_session, [date(2026, 3, 1), date(2026, 3, 2), date(2026, 3, 4)]
    )

    counts = await eq.run(session_factory=_session_factory(db_session))

    assert counts == {"gaps": 0, "quiet_periods": 0}
    n = (
        await db_session.execute(
            select(func.count()).select_from(QuietPeriod).where(
                QuietPeriod.site_id == site.id
            )
        )
    ).scalar()
    assert n == 0


async def test_enrich_quiet_periods_is_idempotent(db_session):
    site = await _seed(db_session, [date(2026, 3, 1), date(2026, 3, 11)])
    sf = _session_factory(db_session)

    await eq.run(session_factory=sf)
    second = await eq.run(session_factory=sf)  # re-run upserts the same row

    assert second["quiet_periods"] == 1
    n = (
        await db_session.execute(
            select(func.count()).select_from(QuietPeriod).where(
                QuietPeriod.site_id == site.id
            )
        )
    ).scalar()
    assert n == 1  # not 2
