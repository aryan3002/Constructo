"""Extraction lifecycle: pending→done; failure stamps failed+error; retry endpoint
re-enqueues; event_update frame reaches subscribers when cards land."""
import asyncio
from uuid import uuid4

import pytest

from app.chat.realtime import Broadcaster
from app.extraction.worker import handle_ingested
from app.models import RawMessageModel, UserRole
from tests.test_chat_api import _session_factory, auth


async def _send(client, user, site, **extra):
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "5 mistri aaye",
              "capture_type": "attendance", "fields": {"headcount": 5}, **extra},
        headers=auth(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_worker_stamps_done(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    await _send(client, owner, site)
    raw = (await db_session.execute(
        __import__("sqlalchemy").select(RawMessageModel)
    )).scalars().one()
    await handle_ingested(raw.id, _session_factory(db_session))
    await db_session.refresh(raw)
    assert raw.status == "done"
    assert raw.attempts == 1


async def test_worker_stamps_failed_and_reraises(client, db_session, factory, monkeypatch):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    await _send(client, owner, site)
    raw = (await db_session.execute(
        __import__("sqlalchemy").select(RawMessageModel)
    )).scalars().one()

    async def boom(*a, **k):
        raise RuntimeError("llm exploded")

    monkeypatch.setattr("app.extraction.worker.extract", boom)
    with pytest.raises(RuntimeError):
        await handle_ingested(raw.id, _session_factory(db_session))
    await db_session.refresh(raw)
    assert raw.status == "failed"
    assert "llm exploded" in (raw.last_error or "")


async def test_retry_endpoint_requeues_failed(client, db_session, factory, monkeypatch):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    msg = await _send(client, owner, site)
    raw = (await db_session.execute(
        __import__("sqlalchemy").select(RawMessageModel)
    )).scalars().one()
    raw.status = "failed"
    await db_session.flush()
    enqueued = []
    monkeypatch.setattr(
        "app.chat.router.enqueue_extraction",
        lambda raw_id: enqueued.append(raw_id) or _noop(),
    )
    resp = await client.post(
        f"/api/v1/chat/messages/{msg['id']}/retry-extraction", headers=auth(owner)
    )
    assert resp.status_code == 202
    assert enqueued == [raw.id]


def _noop():
    async def coro():
        return []
    return coro()


async def test_event_update_frame_published(client, db_session, factory, monkeypatch):
    from app.chat import realtime

    bus = Broadcaster()
    realtime.get_broadcaster.cache_clear()
    monkeypatch.setattr(realtime, "get_broadcaster", lambda: bus)
    monkeypatch.setattr("app.extraction.worker.get_broadcaster", lambda: bus, raising=False)
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    msg = await _send(client, owner, site)
    raw = (await db_session.execute(
        __import__("sqlalchemy").select(RawMessageModel)
    )).scalars().one()
    from uuid import UUID

    async with bus.subscribe(UUID(msg["conversation_id"])) as queue:
        await handle_ingested(raw.id, _session_factory(db_session))
        frame = await asyncio.wait_for(queue.get(), timeout=2)
    assert frame["type"] == "event_update"
    assert frame["message_id"] == msg["id"]
    assert frame["events"][0]["event_type"] == "attendance"
