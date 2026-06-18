"""DPR-enrichment pass (scripts.enrich_dpr).

Seeds the imported company/site + a handful of SiteEvents spread across two
distinct ``occurred_on`` days, then asserts:
  * one Dpr row is created per active day (2 days -> 2 dprs), each with a
    non-empty work-done/summary derived from that day's real events,
  * a second run() creates no duplicates (uuid5-per-(site, day) idempotency), and
  * a site with no events yields zero dprs.

Mostly deterministic — the day's prose summary degrades to a deterministic
fallback without a model, so no LLM injection is strictly required, but we still
pin one to keep the test network-free regardless of ambient env.
"""
from contextlib import asynccontextmanager
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import func, select

import scripts.enrich_dpr as ed
from app.extraction.llm import FakeLLMClient
from app.models import Company, Dpr, DprStatus, Site, SiteEventModel

_DAY_A = date(2026, 3, 10)
_DAY_B = date(2026, 3, 12)


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch):
    """Force run() onto a network-free FakeLLM (no Azure), whatever the env."""
    monkeypatch.setattr(ed, "get_llm_client", lambda tier="cheap": FakeLLMClient())


async def _event(db_session, site_id, *, etype, day, summary, fields=None):
    db_session.add(
        SiteEventModel(
            id=uuid4(),
            site_id=site_id,
            event_type=etype,
            occurred_on=day,
            summary=summary,
            fields=fields or {},
            confidence=0.8,
        )
    )


async def _seed(db_session, *, with_events: bool = True) -> Site:
    """Imported company + site (+ optional events across two distinct days)."""
    company = Company(id=ed._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=ed._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()

    if with_events:
        # Day A: progress + attendance.
        await _event(
            db_session, site.id, etype="progress_update", day=_DAY_A,
            summary="Master bedroom plaster completed.",
        )
        await _event(
            db_session, site.id, etype="attendance", day=_DAY_A,
            summary="8 mazdoor on site.", fields={"headcount": 8},
        )
        # Day B: material delivery only.
        await _event(
            db_session, site.id, etype="material_delivery", day=_DAY_B,
            summary="40 bags cement delivered.",
            fields={"material": "cement", "quantity": 40},
        )
    await db_session.flush()
    return site


async def test_enrich_dpr_one_per_active_day(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    counts = await ed.run(session_factory=sf)

    assert counts["days"] == 2
    assert counts["dprs"] == 2

    rows = (
        await db_session.execute(select(Dpr).where(Dpr.site_id == site.id))
    ).scalars().all()
    assert len(rows) == 2
    assert {r.report_date for r in rows} == {_DAY_A, _DAY_B}
    # Born as drafts (CA1: nothing auto-sends).
    assert all(r.status == DprStatus.draft for r in rows)
    # Every DPR carries a non-empty summary + evidence anchored in real events.
    for r in rows:
        assert r.sections.get("summary")
        assert r.evidence_event_ids


async def test_enrich_dpr_is_idempotent(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    await ed.run(session_factory=sf)
    second = await ed.run(session_factory=sf)  # re-run upserts the same rows

    assert second["dprs"] == 2
    n = (
        await db_session.execute(
            select(func.count()).select_from(Dpr).where(Dpr.site_id == site.id)
        )
    ).scalar()
    assert n == 2  # not 4


async def test_enrich_dpr_no_events_is_zero(db_session):
    site = await _seed(db_session, with_events=False)

    counts = await ed.run(session_factory=_session_factory(db_session))

    assert counts == {"days": 0, "dprs": 0}
    n = (
        await db_session.execute(
            select(func.count()).select_from(Dpr).where(Dpr.site_id == site.id)
        )
    ).scalar()
    assert n == 0
