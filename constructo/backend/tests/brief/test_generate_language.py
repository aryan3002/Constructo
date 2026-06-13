"""build_brief threads the recipient's language into the LLM system prompt, so an
English owner stops receiving a Hindi brief (2026-06-12 QA finding)."""
from datetime import date
from uuid import uuid4

import pytest_asyncio

from app.brief.generate import build_brief
from app.contracts.events import EventType
from app.extraction.llm import FakeLLMClient
from app.models import SiteEventModel, UserRole

DAY = date(2026, 5, 27)


@pytest_asyncio.fixture
async def company_site(factory):
    company = await factory.company()
    site = await factory.site(company, name="Tower A")
    return company, site


async def _attendance(session, site_id):
    session.add(
        SiteEventModel(
            id=uuid4(), site_id=site_id, event_type=EventType.attendance.value,
            occurred_on=DAY, summary="12 aaye", fields={"headcount": 12},
            confidence=0.9, needs_clarification=False, source_message_ids=[uuid4()],
        )
    )
    await session.flush()


async def test_explicit_english_directive(db_session, company_site):
    company, site = company_site
    await _attendance(db_session, site.id)
    fake = FakeLLMClient(canned={"text": "ok"})
    await build_brief(db_session, company.id, DAY, llm=fake, language="en")
    assert "English" in fake.calls[0]["system"]


async def test_explicit_hindi_directive(db_session, company_site):
    company, site = company_site
    await _attendance(db_session, site.id)
    fake = FakeLLMClient(canned={"text": "ok"})
    await build_brief(db_session, company.id, DAY, llm=fake, language="hi")
    assert "Hindi" in fake.calls[0]["system"]


async def test_defaults_to_owner_language(db_session, factory):
    company = await factory.company()
    site = await factory.site(company, name="Tower A")
    owner = await factory.user(company=company, role=UserRole.owner)
    owner.language = "hi"
    await db_session.flush()
    await _attendance(db_session, site.id)
    fake = FakeLLMClient(canned={"text": "ok"})
    await build_brief(db_session, company.id, DAY, llm=fake)  # no language -> resolve owner
    assert "Hindi" in fake.calls[0]["system"]
