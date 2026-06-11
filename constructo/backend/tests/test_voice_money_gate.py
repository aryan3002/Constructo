"""Voice-money read-back: a money/quantity event from a voice note always lands
needs_clarification, even at high confidence — the read-back confirm is the only
path to settled truth."""
from datetime import UTC, datetime

from sqlalchemy import select

from app.extraction.llm import FakeLLMClient
from app.extraction.worker import handle_ingested
from app.models import RawMessageModel, SiteEventModel
from tests.test_chat_api import _session_factory


async def test_voice_money_event_is_flagged_even_when_confident(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{site.id}",
        sender_id="someone",
        media_type="voice",
        text="vendor ko pachas hazaar dena hai invoice number 57",
        sent_at=datetime.now(UTC),
        raw={
            "capture_type": "invoice",
            "fields": {"amount": 50000, "vendor": "ACC"},
            "site_id": str(site.id),
        },
    )
    db_session.add(raw)
    await db_session.flush()
    await handle_ingested(raw.id, _session_factory(db_session), llm=FakeLLMClient())
    ev = (
        await db_session.execute(
            select(SiteEventModel).where(SiteEventModel.event_type == "invoice_received")
        )
    ).scalars().one()
    assert ev.needs_clarification is True


async def test_voice_non_money_event_keeps_its_confidence(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{site.id}",
        sender_id="someone",
        media_type="voice",
        text="aaj barah mazdoor aaye",
        sent_at=datetime.now(UTC),
        raw={"capture_type": "attendance", "fields": {"headcount": 12}, "site_id": str(site.id)},
    )
    db_session.add(raw)
    await db_session.flush()
    await handle_ingested(raw.id, _session_factory(db_session), llm=FakeLLMClient())
    ev = (
        await db_session.execute(
            select(SiteEventModel).where(SiteEventModel.event_type == "attendance")
        )
    ).scalars().one()
    assert ev.needs_clarification is False
