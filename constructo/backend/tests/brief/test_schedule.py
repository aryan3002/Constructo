"""Nightly scheduler tests: builds a brief per company for yesterday."""
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.brief.schedule import run_nightly
from app.contracts.events import EventType
from app.models import OwnerBrief, SiteEventModel


def _yesterday() -> date:
    return datetime.now().date() - timedelta(days=1)


async def test_run_nightly_builds_brief_for_each_company(db_session, factory):
    company_a = await factory.company(name="A Co")
    company_b = await factory.company(name="B Co")
    site_a = await factory.site(company_a, name="A Site")
    db_session.add(
        SiteEventModel(
            id=uuid4(),
            site_id=site_a.id,
            event_type=EventType.attendance.value,
            occurred_on=_yesterday(),
            summary="haazri",
            fields={"headcount": 10},
            confidence=0.9,
            needs_clarification=False,
            source_message_ids=[uuid4()],
        )
    )
    await db_session.commit()

    @asynccontextmanager
    async def session_factory():
        yield db_session

    brief_ids = await run_nightly(session_factory=session_factory)
    assert len(brief_ids) == 2  # one per company

    rows = (await db_session.execute(select(OwnerBrief))).scalars().all()
    by_company = {r.company_id for r in rows}
    assert company_a.id in by_company
    assert company_b.id in by_company
    for r in rows:
        assert r.brief_date == _yesterday()
        assert "text" in r.payload


async def test_run_nightly_no_companies_returns_empty(db_session):
    @asynccontextmanager
    async def session_factory():
        yield db_session

    brief_ids = await run_nightly(session_factory=session_factory)
    assert brief_ids == []
