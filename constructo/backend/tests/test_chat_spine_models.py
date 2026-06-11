"""Spine schema deltas: delivered cursor, sender_kind/meta, raw status."""
from uuid import uuid4

from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    ConversationRead,
    MessageSide,
    RawMessageModel,
    SenderKind,
)


async def test_chat_message_defaults_sender_kind_user_and_null_meta(db_session, factory):
    company = await factory.company()
    user = await factory.user(company=company)
    site = await factory.site(company)
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site, last_seq=1
    )
    db_session.add(conv)
    await db_session.flush()
    msg = ChatMessage(
        conversation_id=conv.id,
        sender_id=user.id,
        sender_side=MessageSide.contractor,
        client_msg_id=uuid4(),
        seq=1,
    )
    db_session.add(msg)
    await db_session.flush()
    await db_session.refresh(msg)
    assert msg.sender_kind is SenderKind.user
    assert msg.meta is None


async def test_conversation_read_has_delivered_cursor_default_zero(db_session, factory):
    company = await factory.company()
    user = await factory.user(company=company)
    site = await factory.site(company)
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(conv)
    await db_session.flush()
    cur = ConversationRead(conversation_id=conv.id, user_id=user.id, last_read_seq=3)
    db_session.add(cur)
    await db_session.flush()
    await db_session.refresh(cur)
    assert cur.last_delivered_seq == 0


async def test_raw_message_status_defaults_pending(db_session):
    from datetime import UTC, datetime

    row = RawMessageModel(
        source="app_chat",
        external_group_id="app:x",
        sender_id="u",
        media_type="text",
        text="hi",
        sent_at=datetime.now(UTC),
        raw={},
    )
    db_session.add(row)
    await db_session.flush()
    await db_session.refresh(row)
    assert row.status == "pending"
    assert row.attempts == 0
    assert row.last_error is None
    assert row.provider_message_id is None
