"""Worker tests: persist SiteEventModel rows from a seeded RawMessageModel."""
from contextlib import asynccontextmanager
from datetime import datetime

from sqlalchemy import select

from app.extraction.llm import FakeLLMClient
from app.extraction.worker import handle_ingested
from app.models import RawMessageModel, SiteEventModel, WhatsappGroup


def _session_factory(db_session):
    """Wrap the rolled-back test session so handle_ingested reuses it.

    ``commit()`` inside the worker becomes a SAVEPOINT release (per conftest's
    ``join_transaction_mode="create_savepoint"``) and the session is NOT closed,
    so assertions afterwards can still read the rows.
    """

    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


async def test_handle_ingested_persists_events(db_session, factory):
    company = await factory.company()
    site = await factory.site(company=company)
    group = WhatsappGroup(
        company_id=company.id,
        site_id=site.id,
        external_group_id="grp-x",
        source="baileys",
        label="Site crew",
    )
    msg = RawMessageModel(
        source="baileys",
        external_group_id="grp-x",
        sender_id="s1",
        media_type="text",
        text="24 mazdoor aaye",
        sent_at=datetime(2026, 5, 28, 9, 0),
        raw={},
    )
    db_session.add_all([group, msg])
    await db_session.flush()

    ids = await handle_ingested(
        msg.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert len(ids) == 1

    stored = (
        await db_session.execute(select(SiteEventModel).where(SiteEventModel.id == ids[0]))
    ).scalar_one()
    assert stored.site_id == site.id
    assert stored.event_type == "attendance"
    assert stored.fields["headcount"] == 24
    assert stored.source_message_ids == [msg.id]


async def test_handle_ingested_skips_when_no_group_mapping(db_session, factory):
    msg = RawMessageModel(
        source="baileys",
        external_group_id="unmapped",
        sender_id="s1",
        media_type="text",
        text="cement delivered",
        sent_at=datetime(2026, 5, 28, 9, 0),
        raw={},
    )
    db_session.add(msg)
    await db_session.flush()

    ids = await handle_ingested(
        msg.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert ids == []
    count = (await db_session.execute(select(SiteEventModel))).scalars().all()
    assert count == []


async def test_handle_ingested_skips_when_group_has_no_site(db_session, factory):
    company = await factory.company()
    group = WhatsappGroup(
        company_id=company.id,
        site_id=None,
        external_group_id="grp-nosite",
        source="baileys",
    )
    msg = RawMessageModel(
        source="baileys",
        external_group_id="grp-nosite",
        sender_id="s1",
        media_type="text",
        text="24 mazdoor aaye",
        sent_at=datetime(2026, 5, 28, 9, 0),
        raw={},
    )
    db_session.add_all([group, msg])
    await db_session.flush()

    ids = await handle_ingested(
        msg.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert ids == []


async def test_handle_ingested_missing_message_returns_empty(db_session):
    from uuid import uuid4

    ids = await handle_ingested(
        uuid4(), session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert ids == []
