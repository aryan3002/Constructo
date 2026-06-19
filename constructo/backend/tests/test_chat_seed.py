"""Tests for app/ingestion/chat_seed.py.

Uses the shared ``db_session`` + ``factory`` fixtures (transactional rollback
per test; no separate create/drop).  No mocking — exercises real DB behaviour.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from app.ingestion.chat_seed import (
    classify_channel,
    conversation_id,
    get_or_create_conversations,
    seed_chat_message,
)
from app.models import RawMessageModel, UserRole
from app.models.chat import ChatMessage, ConversationKind

# ---------------------------------------------------------------------------
# 1. classify_channel — pure function, no DB
# ---------------------------------------------------------------------------

def test_classify_homeowner_role():
    assert classify_channel(sender_role="homeowner") == "homeowner"


def test_classify_supervisor_to_site():
    assert classify_channel(sender_role="supervisor") == "site"


def test_classify_architect_homeowner_facing():
    assert (
        classify_channel(sender_role="architect", llm_label="homeowner_facing") == "homeowner"
    )


def test_classify_architect_no_label_defaults_site():
    assert classify_channel(sender_role="architect", llm_label=None) == "site"


def test_classify_unknown_role_safe_default():
    assert classify_channel(sender_role="some_unknown_role") == "site"


def test_classify_procurement_to_site():
    assert classify_channel(sender_role="procurement") == "site"


def test_classify_owner_homeowner_facing():
    assert classify_channel(sender_role="owner", llm_label="homeowner_facing") == "homeowner"


def test_classify_owner_no_label_to_site():
    assert classify_channel(sender_role="owner") == "site"


# ---------------------------------------------------------------------------
# 2. get_or_create_conversations — idempotency + correct kinds
# ---------------------------------------------------------------------------

async def test_get_or_create_conversations_creates_both(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)

    site_conv, hw_conv = await get_or_create_conversations(
        db_session, company_id=company.id, site_id=site.id
    )

    assert site_conv.kind == ConversationKind.site
    assert hw_conv.kind == ConversationKind.homeowner
    assert site_conv.site_id == site.id
    assert hw_conv.site_id == site.id
    assert site_conv.company_id == company.id
    assert hw_conv.company_id == company.id


async def test_get_or_create_conversations_idempotent(db_session, factory):
    """Calling twice returns the exact same two conversation rows."""
    company = await factory.company()
    site = await factory.site(company)

    site_conv1, hw_conv1 = await get_or_create_conversations(
        db_session, company_id=company.id, site_id=site.id
    )
    site_conv2, hw_conv2 = await get_or_create_conversations(
        db_session, company_id=company.id, site_id=site.id
    )

    assert site_conv1.id == site_conv2.id
    assert hw_conv1.id == hw_conv2.id


async def test_conversation_id_is_deterministic(factory):
    """conversation_id is a pure function — same input, same output."""
    site_id = uuid4()
    id1 = conversation_id(site_id, "site")
    id2 = conversation_id(site_id, "site")
    assert id1 == id2


async def test_conversation_id_differs_by_kind(factory):
    site_id = uuid4()
    assert conversation_id(site_id, "site") != conversation_id(site_id, "homeowner")


# ---------------------------------------------------------------------------
# 3. seed_chat_message — seq, bridge, idempotency
# ---------------------------------------------------------------------------

async def test_seed_creates_message_and_bridge(db_session, factory):
    """First seeded message gets seq=1; RawMessage bridge is minted correctly."""
    company = await factory.company()
    site = await factory.site(company)
    user = await factory.user(company=company, role=UserRole.owner, name="Arjun Kumar")

    site_conv, _ = await get_or_create_conversations(
        db_session, company_id=company.id, site_id=site.id
    )

    sent = datetime(2024, 3, 15, 9, 30, 0, tzinfo=UTC)
    client_id = uuid4()

    msg = await seed_chat_message(
        db_session,
        conv=site_conv,
        user=user,
        text="Site update: foundation poured",
        media_url=None,
        media_mime=None,
        media_type="text",
        sent_at=sent,
        client_msg_id=client_id,
        sender_side="contractor",
    )

    # seq starts at 1
    assert msg.seq == 1
    assert msg.conversation_id == site_conv.id
    assert msg.body == "Site update: foundation poured"

    # bridge exists
    assert msg.raw_message_id is not None
    raw = await db_session.get(RawMessageModel, msg.raw_message_id)
    assert raw is not None
    assert raw.source == "app_chat"
    assert raw.external_group_id == f"app:{site.id}"
    assert raw.raw["chat_message_id"] == str(msg.id)
    assert raw.raw["sender_side"] == "contractor"
    assert raw.raw["site_id"] == str(site.id)


async def test_seed_sequential_messages(db_session, factory):
    """Second message in the same conversation gets seq=2; conv.last_seq==2."""
    company = await factory.company()
    site = await factory.site(company)
    user = await factory.user(company=company, role=UserRole.owner)

    site_conv, _ = await get_or_create_conversations(
        db_session, company_id=company.id, site_id=site.id
    )

    sent = datetime(2024, 3, 15, 9, 0, 0, tzinfo=UTC)

    msg1 = await seed_chat_message(
        db_session,
        conv=site_conv,
        user=user,
        text="First",
        media_url=None,
        media_mime=None,
        media_type="text",
        sent_at=sent,
        client_msg_id=uuid4(),
        sender_side="contractor",
    )

    msg2 = await seed_chat_message(
        db_session,
        conv=site_conv,
        user=user,
        text="Second",
        media_url=None,
        media_mime=None,
        media_type="text",
        sent_at=sent,
        client_msg_id=uuid4(),
        sender_side="contractor",
    )

    assert msg1.seq == 1
    assert msg2.seq == 2

    # Reload conv from DB to confirm last_seq persisted
    await db_session.refresh(site_conv)
    assert site_conv.last_seq == 2


async def test_seed_idempotent_same_client_msg_id(db_session, factory):
    """Re-seeding with the same client_msg_id returns the original row unchanged."""
    company = await factory.company()
    site = await factory.site(company)
    user = await factory.user(company=company, role=UserRole.owner)

    site_conv, _ = await get_or_create_conversations(
        db_session, company_id=company.id, site_id=site.id
    )

    client_id = uuid4()
    sent = datetime(2024, 3, 15, 10, 0, 0, tzinfo=UTC)

    msg1 = await seed_chat_message(
        db_session,
        conv=site_conv,
        user=user,
        text="Hello",
        media_url=None,
        media_mime=None,
        media_type="text",
        sent_at=sent,
        client_msg_id=client_id,
        sender_side="contractor",
    )

    # Seed a second distinct message so last_seq advances to 2
    msg2 = await seed_chat_message(
        db_session,
        conv=site_conv,
        user=user,
        text="World",
        media_url=None,
        media_mime=None,
        media_type="text",
        sent_at=sent,
        client_msg_id=uuid4(),
        sender_side="contractor",
    )
    assert msg2.seq == 2

    # Re-seed the FIRST message with the same client_msg_id
    msg1_again = await seed_chat_message(
        db_session,
        conv=site_conv,
        user=user,
        text="Hello (retry)",  # different text — should be ignored
        media_url=None,
        media_mime=None,
        media_type="text",
        sent_at=sent,
        client_msg_id=client_id,
        sender_side="contractor",
    )

    # Same row returned, seq unchanged, no new raw message
    assert msg1_again.id == msg1.id
    assert msg1_again.seq == 1  # not incremented to 3

    # conv.last_seq must still be 2 (no extra seq consumed)
    await db_session.refresh(site_conv)
    assert site_conv.last_seq == 2

    # Count chat messages to confirm no duplicate row was inserted
    rows = (
        await db_session.execute(
            select(ChatMessage).where(
                ChatMessage.conversation_id == site_conv.id
            )
        )
    ).scalars().all()
    assert len(rows) == 2


async def test_seed_homeowner_sender_side(db_session, factory):
    """sender_side="homeowner" is stored correctly and reflected in the bridge."""
    company = await factory.company()
    site = await factory.site(company)
    user = await factory.user(company=company, role=UserRole.homeowner)

    _, hw_conv = await get_or_create_conversations(
        db_session, company_id=company.id, site_id=site.id
    )

    msg = await seed_chat_message(
        db_session,
        conv=hw_conv,
        user=user,
        text="Tiles choice confirmed",
        media_url=None,
        media_mime=None,
        media_type="text",
        sent_at=datetime(2024, 4, 1, 8, 0, 0, tzinfo=UTC),
        client_msg_id=uuid4(),
        sender_side="homeowner",
    )

    assert msg.sender_side.value == "homeowner"
    raw = await db_session.get(RawMessageModel, msg.raw_message_id)
    assert raw.raw["sender_side"] == "homeowner"
    assert raw.external_group_id == f"app:{site.id}"
