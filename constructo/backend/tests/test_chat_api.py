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
from app.models.homeowner_member import HomeownerMember
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


async def test_reply_stores_parent_context_for_extraction(client, db_session, world):
    """A quote-reply stashes the parent's text (+ type) so extraction reads the
    reply in context (1.5 threading-light)."""
    _, owner, site = world
    parent = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "50 bori cement",
            "capture_type": "delivery",
            "fields": {"material": "cement", "quantity": 50},
        },
        headers=auth(owner),
    )
    parent_id = parent.json()["id"]
    # Book the parent's event so parent_event_type resolves.
    parent_raw = (await db_session.get(ChatMessage, parent_id)).raw_message_id
    await handle_ingested(
        parent_raw, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )

    reply = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "45 nahi 54",
            "reply_to_id": parent_id,
        },
        headers=auth(owner),
    )
    assert reply.status_code == 201, reply.text
    assert reply.json()["reply_to_id"] == parent_id
    reply_msg = await db_session.get(ChatMessage, reply.json()["id"])
    reply_raw = await db_session.get(RawMessageModel, reply_msg.raw_message_id)
    ctx = reply_raw.raw["reply_context"]
    assert ctx["parent_text"] == "50 bori cement"
    assert ctx["parent_event_type"] == "material_delivery"


async def _send_card_and_extract(client, db_session, owner, site, fields):
    sent = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": f"{fields.get('quantity', '')} bori cement",
            "capture_type": "delivery",
            "fields": fields,
        },
        headers=auth(owner),
    )
    raw_id = (await db_session.get(ChatMessage, sent.json()["id"])).raw_message_id
    await handle_ingested(
        raw_id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    return sent.json()["id"]


async def _send_decision_and_extract(client, db_session, user, site):
    sent = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "approve cement PO?",
            "capture_type": "decision",
            "fields": {"question": "approve cement PO?"},
        },
        headers=auth(user),
    )
    raw_id = (await db_session.get(ChatMessage, sent.json()["id"])).raw_message_id
    await handle_ingested(
        raw_id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    return sent.json()["id"]


async def test_owner_reply_approves_decision_card(client, db_session, world):
    """An owner's "haan theek hai" under a Decision card flips it to Approved
    (1.4) — a superseding, attributed event; the reply mints no event."""
    _, owner, site = world
    parent_id = await _send_decision_and_extract(client, db_session, owner, site)
    reply = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "haan theek hai",
            "reply_to_id": parent_id,
        },
        headers=auth(owner),
    )
    assert reply.status_code == 201
    assert reply.json()["events"] == []

    listed = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    parent_row = next(r for r in listed.json() if r["id"] == parent_id)
    fields = parent_row["events"][0]["fields"]
    assert fields["status"] == "approved"
    assert fields["approved_by_role"] == "owner"


async def test_supervisor_cannot_approve_owner_decision(client, db_session, factory, world):
    """The authority gate holds on the crew side — a supervisor's "haan" doesn't
    approve an owner Decision (it just posts as a message)."""
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    parent_id = await _send_decision_and_extract(client, db_session, owner, site)
    await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "haan theek hai",
            "reply_to_id": parent_id,
        },
        headers=auth(sup),
    )
    listed = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    parent_row = next(r for r in listed.json() if r["id"] == parent_id)
    assert parent_row["events"][0]["fields"].get("status") != "approved"


async def test_owner_reply_corrects_card_in_place(client, db_session, world):
    """An owner's "45 nahi 54" reply supersedes the card's value (1.4) — the
    original card now renders 54, and the reply mints no new event."""
    _, owner, site = world
    parent_id = await _send_card_and_extract(
        client, db_session, owner, site, {"material": "cement", "quantity": 45}
    )
    before = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    msg_count_before = len(before.json())

    reply = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "45 nahi 54",
            "reply_to_id": parent_id,
        },
        headers=auth(owner),
    )
    assert reply.status_code == 201
    # The reply has no event of its own (it acted on the parent).
    assert reply.json()["events"] == []

    listed = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    rows = listed.json()
    assert len(rows) == msg_count_before + 1
    parent_row = next(r for r in rows if r["id"] == parent_id)
    assert parent_row["events"][0]["fields"]["quantity"] == 54  # the receipt flipped
    assert parent_row["events"][0]["contested"] is False


async def test_nonauthority_reply_raises_dispute(client, db_session, factory, world):
    """A supervisor can't silently overwrite — "45 nahi 54" raises a dispute, and
    the card shows contested (1.4 × 1.7)."""
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    parent_id = await _send_card_and_extract(
        client, db_session, owner, site, {"material": "cement", "quantity": 45}
    )
    reply = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "45 nahi 54",
            "reply_to_id": parent_id,
        },
        headers=auth(sup),
    )
    assert reply.status_code == 201
    listed = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    parent_row = next(r for r in listed.json() if r["id"] == parent_id)
    # Value unchanged (no silent overwrite); the card is contested.
    assert parent_row["events"][0]["fields"]["quantity"] == 45
    assert parent_row["events"][0]["contested"] is True


async def test_reply_across_conversations_rejected(client, db_session, factory, world):
    """A reply_to pointing at another site's thread is refused (no leak)."""
    company, owner, site = world
    other = await factory.site(company, name="Other Site")
    parent = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(other.id), "client_msg_id": str(uuid4()), "body": "hi there"},
        headers=auth(owner),
    )
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "ok",
            "reply_to_id": parent.json()["id"],
        },
        headers=auth(owner),
    )
    assert resp.status_code == 422


async def test_list_messages_includes_linked_event(client, db_session, world):
    """GET /chat/messages returns each message's linked SiteEvent (the inline
    card the thread renders instead of a flat bubble)."""
    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "50 bori cement",
            "capture_type": "delivery",
            "fields": {"material": "cement", "quantity": 50},
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    raw_id = (await db_session.get(ChatMessage, resp.json()["id"])).raw_message_id
    # Drive extraction (the inline send enqueues async; not guaranteed in tests).
    await handle_ingested(
        raw_id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )

    listed = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    assert len(rows) == 1
    events = rows[0]["events"]
    assert len(events) == 1
    ev = events[0]
    assert ev["event_type"] == "material_delivery"
    assert ev["fields"] == {"material": "cement", "quantity": 50}
    assert ev["confidence"] == 1.0
    assert ev["needs_clarification"] is False
    assert ev["summary"]


async def test_list_messages_plain_text_has_no_events(client, world):
    """A plain human message stays a bubble — no linked event."""
    _, owner, site = world
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "good morning team"},
        headers=auth(owner),
    )
    listed = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    assert listed.json()[0]["events"] == []


async def test_list_messages_excludes_superseded_event(client, db_session, world):
    """latest-version-wins: a superseded event never renders as the card."""
    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "45 bori cement",
            "capture_type": "delivery",
            "fields": {"material": "cement", "quantity": 45},
        },
        headers=auth(owner),
    )
    raw_id = (await db_session.get(ChatMessage, resp.json()["id"])).raw_message_id
    ids = await handle_ingested(
        raw_id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    original = await db_session.get(SiteEventModel, ids[0])
    # A correction writes a NEW version superseding the original, same source msg.
    corrected = SiteEventModel(
        site_id=site.id,
        event_type="material_delivery",
        occurred_on=original.occurred_on,
        summary="54 bori cement",
        fields={"material": "cement", "quantity": 54},
        confidence=1.0,
        needs_clarification=False,
        source_message_ids=original.source_message_ids,
        version=2,
        supersedes_event_id=original.id,
    )
    db_session.add(corrected)
    await db_session.commit()

    listed = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    events = listed.json()[0]["events"]
    assert len(events) == 1
    assert events[0]["fields"]["quantity"] == 54  # the latest version only


async def test_send_with_attachment_stores_media(client, db_session, world):
    """A challan photo send (1.2) stores the media + bridges it to extraction."""
    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "media_type": "document",
            "attachment_key": "chat/site/challan-1.jpg",
            "attachment_mime": "image/jpeg",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["media_type"] == "document"
    stored = await db_session.get(ChatMessage, resp.json()["id"])
    assert stored.attachment_key == "chat/site/challan-1.jpg"
    raw = await db_session.get(RawMessageModel, stored.raw_message_id)
    assert raw.media_type == "document"
    assert raw.media_url == "chat/site/challan-1.jpg"


async def test_send_bad_media_type_rejected(client, world):
    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "media_type": "hologram",
            "attachment_key": "k",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 422


async def test_upload_media_stores_and_returns_key(client, world):
    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/media",
        data={"site_id": str(site.id), "kind": "document"},
        files={"file": ("challan.jpg", b"\xff\xd8\xff fake jpeg bytes", "image/jpeg")},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["key"].startswith(f"chat/{site.id}/")
    assert body["media_type"] == "document"


async def test_upload_media_requires_site(client, factory, world):
    company, _, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)  # unassigned
    resp = await client.post(
        "/api/v1/chat/media",
        data={"site_id": str(site.id), "kind": "document"},
        files={"file": ("x.jpg", b"abc", "image/jpeg")},
        headers=auth(sup),
    )
    assert resp.status_code == 403


async def test_upload_returns_content_hash(client, world):
    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/media",
        data={"site_id": str(site.id), "kind": "document"},
        files={"file": ("challan.jpg", b"same-challan-bytes", "image/jpeg")},
        headers=auth(owner),
    )
    import hashlib

    assert resp.json()["sha256"] == hashlib.sha256(b"same-challan-bytes").hexdigest()


async def test_replayed_attachment_is_deduped(client, db_session, world):
    """The same challan re-sent (same content hash) is flagged a duplicate and
    never books a second event (1.7 adversarial-capture dedupe)."""
    import hashlib

    _, owner, site = world
    digest = hashlib.sha256(b"challan-xyz").hexdigest()
    first = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "media_type": "document",
            "attachment_key": "chat/site/a.jpg",
            "attachment_sha256": digest,
        },
        headers=auth(owner),
    )
    assert first.json()["duplicate_of_id"] is None
    first_raw = (await db_session.get(ChatMessage, first.json()["id"])).raw_message_id
    assert first_raw is not None  # the original IS bridged to extraction

    second = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "media_type": "document",
            "attachment_key": "chat/site/b.jpg",
            "attachment_sha256": digest,
        },
        headers=auth(owner),
    )
    assert second.json()["duplicate_of_id"] == first.json()["id"]
    # The duplicate is NOT bridged to extraction — it can't double-book.
    second_msg = await db_session.get(ChatMessage, second.json()["id"])
    assert second_msg.raw_message_id is None


async def test_worker_ocrs_document_attachment(db_session, world):
    """A document message runs OCR (Camera-as-Sensor) → a structured event."""
    from app.extraction.ocr import FakeOCR

    _, owner, site = world
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{site.id}",
        sender_id=str(owner.id),
        sender_name=owner.name,
        media_type="document",
        text=None,
        media_url="http://example.test/challan.jpg",  # http passes through url_for
        media_mime="image/jpeg",
        sent_at=datetime.now(UTC),
        raw={"client": "app_chat", "site_id": str(site.id)},
    )
    db_session.add(raw)
    await db_session.flush()
    ids = await handle_ingested(
        raw.id,
        session_factory=_session_factory(db_session),
        llm=FakeLLMClient(),
        ocr=FakeOCR(default="Sharma Traders\nCement 50 bori\nInvoice 85000"),
    )
    assert len(ids) >= 1
    event = await db_session.get(SiteEventModel, ids[0])
    assert event.site_id == site.id


async def test_chat_assignment_spawns_ai_action_item(client, db_session, world):
    """A plain-text assignment auto-creates a badged Nivaan to-do (2.7)."""
    from app.models import ActionItem

    _, owner, site = world
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "Ramesh ko kal tak cement order karne bolo",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201
    items = (
        await db_session.execute(select(ActionItem).where(ActionItem.site_id == site.id))
    ).scalars().all()
    assert len(items) == 1
    assert items[0].created_by_ai is True
    assert items[0].created_by is None
    assert items[0].source_message_id is not None


async def test_plain_chatter_spawns_no_action_item(client, db_session, world):
    from app.models import ActionItem

    _, owner, site = world
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "good morning team"},
        headers=auth(owner),
    )
    items = (
        await db_session.execute(select(ActionItem).where(ActionItem.site_id == site.id))
    ).scalars().all()
    assert items == []


async def test_send_publishes_to_live_subscribers(client, db_session, world):
    """A send pushes the new message to the realtime broadcaster (2.0) — a live
    subscriber receives it without polling."""
    import asyncio

    from app.chat.realtime import broadcaster
    from app.models import Conversation

    _, owner, site = world
    # Ensure the conversation exists, then subscribe before sending.
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "first"},
        headers=auth(owner),
    )
    conv = (
        await db_session.execute(select(Conversation).where(Conversation.site_id == site.id))
    ).scalar_one()

    async with broadcaster.subscribe(conv.id) as queue:
        await client.post(
            "/api/v1/chat/messages",
            json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "live one"},
            headers=auth(owner),
        )
        payload = await asyncio.wait_for(queue.get(), 1)
        assert payload["body"] == "live one"
        assert payload["seq"] == 2


async def test_site_brief_surfaces_labor_shortfall(client, db_session, world):
    """The pinned brief (1.8) surfaces a ranked risk from the deterministic
    engine — here a labour shortfall vs the learned baseline."""
    from datetime import date, timedelta

    from app.models import SiteEventModel

    _, owner, site = world
    today = date.today()
    # A history of ~20 workers/day, then a sharp drop today → shortfall risk.
    for i in range(1, 6):
        db_session.add(
            SiteEventModel(
                site_id=site.id, event_type="attendance", occurred_on=today - timedelta(days=i),
                summary="att", fields={"headcount": 20}, confidence=1.0,
                needs_clarification=False, source_message_ids=[],
            )
        )
    db_session.add(
        SiteEventModel(
            site_id=site.id, event_type="attendance", occurred_on=today,
            summary="att", fields={"headcount": 6}, confidence=1.0,
            needs_clarification=False, source_message_ids=[],
        )
    )
    await db_session.flush()

    resp = await client.get(f"/api/v1/chat/brief?site_id={site.id}", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["risk_count"] >= 1
    assert any(r["kind"] == "labor_shortfall" for r in body["risks"])
    assert "need you" in body["headline"]


async def test_site_brief_all_clear_when_no_risks(client, world):
    _, owner, site = world
    resp = await client.get(f"/api/v1/chat/brief?site_id={site.id}", headers=auth(owner))
    assert resp.status_code == 200
    assert resp.json()["risk_count"] == 0
    assert resp.json()["headline"] == "All caught up"


async def test_site_brief_scoped(client, factory, world):
    company, _, site = world
    other = await factory.user(company=company, role=UserRole.supervisor)  # unassigned
    resp = await client.get(f"/api/v1/chat/brief?site_id={site.id}", headers=auth(other))
    assert resp.status_code == 403


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


# ---------------------------------------------------------------------------
# GET /api/v1/chat/conversations  (owner Chat inbox — Task 1)
# ---------------------------------------------------------------------------


async def test_conversations_inbox_lists_existing_site_threads(client, world):
    company, owner, site = world
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data) == 1
    row = data[0]
    assert row["site_id"] == str(site.id)
    assert row["kind"] == "site"
    assert row["site_name"] == site.name
    assert row["unread_count"] == 1
    assert row["has_homeowner"] is False
    assert row["last_message_at"] is not None


async def test_conversations_inbox_excludes_sites_without_a_thread(client, factory, world):
    company, owner, site = world
    await factory.site(company, name="Site B")
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    site_ids = {r["site_id"] for r in resp.json()}
    assert site_ids == {str(site.id)}


async def test_conversations_inbox_unread_clears_after_read(client, world):
    company, owner, site = world
    sent = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    seq = sent.json()["seq"]
    await client.post(
        "/api/v1/chat/read",
        json={"site_id": str(site.id), "last_seq": seq},
        headers=auth(owner),
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.json()[0]["unread_count"] == 0


async def test_conversations_inbox_has_homeowner_flag(client, db_session, world):
    company, owner, site = world
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    db_session.add(HomeownerMember(site_id=site.id, join_code="ABC123"))
    await db_session.flush()
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.json()[0]["has_homeowner"] is True


async def test_conversations_inbox_scoped_to_assigned_sites_for_supervisor(
    client, db_session, factory, world
):
    company, owner, site = world
    other = await factory.site(company, name="Site B")
    for s in (site, other):
        await client.post(
            "/api/v1/chat/messages",
            json={"site_id": str(s.id), "client_msg_id": str(uuid4()), "body": "x"},
            headers=auth(owner),
        )
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    resp = await client.get("/api/v1/chat/conversations", headers=auth(sup))
    assert {r["site_id"] for r in resp.json()} == {str(site.id)}


async def test_conversations_inbox_forbidden_for_homeowner(
    client, factory, world
):
    # Doc 18 Phase 2 non-goal: the inbox is the homeowner's discovery surface and
    # stays closed for the homeowner role. The homeowner Messages surface (and
    # lifting this block) is Phase 3, gated on a membrane review.
    company, owner, site = world
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    ho = await factory.user(company=company, role=UserRole.homeowner)
    resp = await client.get("/api/v1/chat/conversations", headers=auth(ho))
    assert resp.status_code == 403, resp.text


# ---- groups: conversation_id-keyed reads + inbox (doc 18 Phase 2) ----------


async def _make_group(db_session, company, created_by, members, *, title="Coord",
                      archived=False):
    from datetime import UTC, datetime

    from app.models import Conversation, ConversationKind, ConversationMember

    conv = Conversation(
        company_id=company.id,
        site_id=None,
        kind=ConversationKind.group,
        title=title,
        created_by=created_by.id,
        archived_at=datetime.now(UTC) if archived else None,
    )
    db_session.add(conv)
    await db_session.flush()
    for member_user, role in members:
        db_session.add(
            ConversationMember(
                conversation_id=conv.id,
                user_id=member_user.id,
                role=role,
                added_by=created_by.id,
            )
        )
    await db_session.flush()
    return conv


async def test_list_messages_by_conversation_id_for_member_returns_empty(
    client, db_session, factory, world
):
    from app.models import MemberRole

    company, owner, _ = world
    conv = await _make_group(db_session, company, owner, [(owner, MemberRole.admin)])
    resp = await client.get(
        f"/api/v1/chat/messages?conversation_id={conv.id}", headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == []


async def test_list_messages_by_conversation_id_blocks_non_member(
    client, db_session, factory, world
):
    from app.models import MemberRole

    company, owner, _ = world
    outsider = await factory.user(company=company, role=UserRole.supervisor)
    conv = await _make_group(db_session, company, owner, [(owner, MemberRole.admin)])
    resp = await client.get(
        f"/api/v1/chat/messages?conversation_id={conv.id}", headers=auth(outsider)
    )
    assert resp.status_code == 403, resp.text


async def test_list_messages_site_keyed_path_unchanged(client, world):
    # The legacy site_id-keyed read still works end-to-end (send then list).
    _, owner, site = world
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    resp = await client.get(
        f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    bodies = [m["body"] for m in resp.json()]
    assert bodies == ["hi"]


async def test_inbox_includes_group_for_member(client, db_session, factory, world):
    from app.models import MemberRole

    company, owner, _ = world
    conv = await _make_group(
        db_session, company, owner, [(owner, MemberRole.admin)], title="Vendors"
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    groups = [r for r in resp.json() if r["kind"] == "group"]
    assert len(groups) == 1
    assert groups[0]["id"] == str(conv.id)
    assert groups[0]["title"] == "Vendors"
    assert groups[0]["site_id"] is None


async def test_inbox_excludes_archived_group(client, db_session, factory, world):
    from app.models import MemberRole

    company, owner, _ = world
    await _make_group(
        db_session, company, owner, [(owner, MemberRole.admin)],
        title="Old", archived=True,
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    assert [r for r in resp.json() if r["kind"] == "group"] == []


async def test_inbox_group_has_homeowner_flag(client, db_session, factory, world):
    """A group with a homeowner-role member surfaces has_homeowner=True in the
    inbox (the 'client present' cue); a group with crew only stays False."""
    from app.models import MemberRole

    company, owner, _ = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    with_ho = await _make_group(
        db_session,
        company,
        owner,
        [(owner, MemberRole.admin), (homeowner, MemberRole.member)],
        title="With homeowner",
    )
    crew = await factory.user(company=company, role=UserRole.supervisor)
    without_ho = await _make_group(
        db_session,
        company,
        owner,
        [(owner, MemberRole.admin), (crew, MemberRole.member)],
        title="Crew only",
    )

    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    groups = {r["id"]: r for r in resp.json() if r["kind"] == "group"}
    assert groups[str(with_ho.id)]["has_homeowner"] is True
    assert groups[str(without_ho.id)]["has_homeowner"] is False


async def test_conversations_inbox_orders_by_last_message_desc(client, factory, world):
    company, owner, site = world
    site_b = await factory.site(company, name="Site B")
    # send to site A first, then site B -> B is more recent
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "first"},
        headers=auth(owner),
    )
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site_b.id), "client_msg_id": str(uuid4()), "body": "second"},
        headers=auth(owner),
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    ordered = [r["site_id"] for r in resp.json()]
    assert ordered == [str(site_b.id), str(site.id)]  # most-recent first
