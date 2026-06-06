"""In-app chat — Phase 1.0 (crew site thread + extraction seam).

Covers: send creates a message + mints a source="app_chat" RawMessage; sends are
idempotent on client_msg_id; seq is gap-free; list paginates by seq; scoping
(unassigned site / homeowner role forbidden); the read cursor; and the worker
app_chat seam producing a SiteEvent (incl. the Phase 0.1 structured fast path).
"""
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.extraction.worker import handle_ingested
from app.models import (
    ChatMessage,
    Conversation,
    ConversationRead,
    RawMessageModel,
    SiteEventModel,
    UserRole,
)
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise Heights")
    return company, owner, site


async def test_send_creates_message_and_app_chat_raw(client, db_session, world):
    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "cement aa gaya"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    msg = resp.json()
    assert msg["body"] == "cement aa gaya"
    assert msg["seq"] == 1
    assert msg["sender_side"] == "contractor"

    raw = (
        await db_session.execute(
            select(RawMessageModel).where(RawMessageModel.source == "app_chat")
        )
    ).scalars().one()
    assert raw.external_group_id == f"app:{site.id}"
    assert raw.text == "cement aa gaya"
    # The chat message is bridged to its RawMessage.
    stored = await db_session.get(ChatMessage, msg["id"])
    assert stored.raw_message_id == raw.id


async def test_send_is_idempotent_on_client_msg_id(client, db_session, world):
    _, owner, site = world
    cid = str(uuid4())
    payload = {"site_id": str(site.id), "client_msg_id": cid, "body": "hi"}
    first = await client.post("/api/v1/chat/messages", json=payload, headers=auth(owner))
    second = await client.post("/api/v1/chat/messages", json=payload, headers=auth(owner))
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["seq"] == second.json()["seq"] == 1
    count = await db_session.scalar(select(func.count()).select_from(ChatMessage))
    assert count == 1


async def test_seq_increments_and_list_after_cursor(client, world):
    _, owner, site = world
    for body in ("one", "two", "three"):
        await client.post(
            "/api/v1/chat/messages",
            json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": body},
            headers=auth(owner),
        )
    resp = await client.get(
        f"/api/v1/chat/messages?site_id={site.id}&after_seq=1", headers=auth(owner)
    )
    seqs = [m["seq"] for m in resp.json()]
    assert seqs == [2, 3]  # cursor excludes seq 1


async def test_unassigned_site_is_forbidden(client, factory, world):
    company, _, site = world
    supervisor = await factory.user(company=company, role=UserRole.supervisor)  # not assigned
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "x"},
        headers=auth(supervisor),
    )
    assert resp.status_code == 403


async def test_assigned_supervisor_can_post(client, db_session, factory, world):
    company, _, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "12 mistri aaye"},
        headers=auth(sup),
    )
    assert resp.status_code == 201


async def test_homeowner_role_is_forbidden(client, factory, world):
    company, _, site = world
    ho = await factory.user(company=company, role=UserRole.homeowner)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(ho),
    )
    assert resp.status_code == 403


async def test_empty_message_rejected(client, world):
    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4())},
        headers=auth(owner),
    )
    assert resp.status_code == 422


async def test_read_cursor(client, db_session, world):
    _, owner, site = world
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    resp = await client.post(
        "/api/v1/chat/read", json={"site_id": str(site.id), "last_seq": 1}, headers=auth(owner)
    )
    assert resp.status_code == 204
    conv = (
        await db_session.execute(
            select(Conversation).where(Conversation.site_id == site.id)
        )
    ).scalars().one()
    cursor = await db_session.get(ConversationRead, (conv.id, owner.id))
    assert cursor.last_read_seq == 1


async def test_worker_app_chat_seam_creates_event(db_session, world):
    """A source="app_chat" message resolves its site and produces a SiteEvent."""
    _, owner, site = world
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{site.id}",
        sender_id=str(owner.id),
        sender_name=owner.name,
        media_type="text",
        text="32 mazdoor aaye",
        sent_at=datetime.now(UTC),
        raw={"client": "app_chat", "site_id": str(site.id)},
    )
    db_session.add(raw)
    await db_session.flush()
    ids = await handle_ingested(
        raw.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert len(ids) == 1
    event = await db_session.get(SiteEventModel, ids[0])
    assert event.site_id == site.id
    assert event.event_type == "attendance"


async def test_chat_structured_card_books_verbatim(db_session, world):
    """A typed card sent via chat (capture_type + fields) rides the Phase 0.1
    fast path: confidence 1.0, verbatim fields."""
    _, owner, site = world
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{site.id}",
        sender_id=str(owner.id),
        sender_name=owner.name,
        media_type="text",
        text="50 bori cement",
        sent_at=datetime.now(UTC),
        raw={
            "client": "app_chat",
            "site_id": str(site.id),
            "capture_type": "delivery",
            "fields": {"material": "cement", "quantity": 50},
        },
    )
    db_session.add(raw)
    await db_session.flush()
    ids = await handle_ingested(
        raw.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    event = await db_session.get(SiteEventModel, ids[0])
    assert event.event_type == "material_delivery"
    assert event.fields == {"material": "cement", "quantity": 50}
    assert event.confidence == 1.0
