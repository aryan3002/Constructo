"""Queue wiring tests: sync mode runs inline; enqueue is resilient to Redis down."""
from contextlib import asynccontextmanager
from datetime import datetime

import app.queue as queue_mod
from app.models import RawMessageModel, SiteEventModel, WhatsappGroup


async def test_enqueue_sync_runs_inline(monkeypatch, db_session, factory):
    """With EXTRACTION_SYNC the row is extracted inline (no Redis)."""
    company = await factory.company()
    site = await factory.site(company=company)
    group = WhatsappGroup(
        company_id=company.id,
        site_id=site.id,
        external_group_id="grp-sync",
        source="baileys",
    )
    msg = RawMessageModel(
        source="baileys",
        external_group_id="grp-sync",
        sender_id="s1",
        media_type="text",
        text="24 mazdoor aaye",
        sent_at=datetime(2026, 5, 28, 9, 0),
        raw={},
    )
    db_session.add_all([group, msg])
    await db_session.flush()

    # Force sync mode and bind handle_ingested to the test session.
    monkeypatch.setattr(queue_mod.settings, "extraction_sync", True)

    @asynccontextmanager
    async def _factory():
        yield db_session

    import app.extraction.worker as worker_mod

    real = worker_mod.handle_ingested

    async def _bound(raw_message_id, session_factory=None, **kw):
        return await real(raw_message_id, session_factory=_factory, **kw)

    monkeypatch.setattr(worker_mod, "handle_ingested", _bound)

    await queue_mod.enqueue_extraction(msg.id)

    from sqlalchemy import select

    rows = (await db_session.execute(select(SiteEventModel))).scalars().all()
    assert len(rows) == 1
    assert rows[0].event_type == "attendance"


async def test_enqueue_does_not_raise_when_redis_unavailable(monkeypatch):
    """Async-mode enqueue must swallow Redis errors (row already stored)."""
    monkeypatch.setattr(queue_mod.settings, "extraction_sync", False)

    def _boom():
        raise ConnectionError("redis down")

    monkeypatch.setattr(queue_mod, "get_queue", _boom)

    from uuid import uuid4

    # Should not raise.
    await queue_mod.enqueue_extraction(uuid4())


def test_run_handle_ingested_coerces_uuid_and_runs(monkeypatch):
    """The sync RQ wrapper coerces the str id and returns stringified ids."""
    from uuid import UUID, uuid4

    import app.extraction.worker as worker_mod

    out_id = uuid4()
    seen = {}

    async def _fake_handle(raw_message_id):
        seen["id"] = raw_message_id
        return [out_id]

    monkeypatch.setattr(worker_mod, "handle_ingested", _fake_handle)

    rid = uuid4()
    result = queue_mod.run_handle_ingested(str(rid))
    assert seen["id"] == UUID(str(rid))
    assert result == [str(out_id)]
