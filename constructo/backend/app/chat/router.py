"""In-app chat — Phase 1.0 (the crew per-site thread).

The foundation slice: contractors post to their site's conversation, messages
get a gap-free per-conversation ``seq`` (assigned under a row lock), sends are
idempotent on ``client_msg_id`` (for an offline outbox), and every message with
content mints a ``RawMessage(source="app_chat")`` into the SAME extraction
pipeline — so structured capture, the bot, and search all work for free.

Scope: the caller must be assigned to the site (owner/PM see all company sites).
The curated homeowner room (``kind="homeowner"``, with masking + translation) is
a later slice; homeowner-role users are out of scope here.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    ConversationRead,
    MessageSide,
    RawMessageModel,
    User,
    UserRole,
)
from app.queue import enqueue_extraction
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class ChatSendIn(BaseModel):
    site_id: UUID
    client_msg_id: UUID
    body: str | None = None
    reply_to_id: UUID | None = None
    # Structured-capture hints (Phase 0.1 fast path) — a typed card / slash-cmd.
    capture_type: str | None = None
    fields: dict | None = None


class ChatReadIn(BaseModel):
    site_id: UUID
    last_seq: int = Field(ge=0)


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    sender_id: UUID | None
    sender_side: MessageSide
    seq: int
    body: str | None
    reply_to_id: UUID | None
    media_type: str
    created_at: datetime


def _side_for(user: User) -> MessageSide:
    return (
        MessageSide.homeowner
        if user.role is UserRole.homeowner
        else MessageSide.contractor
    )


async def _require_site(session: AsyncSession, user: User, site_id: UUID) -> None:
    if user.role is UserRole.homeowner:
        # The curated homeowner room is a later slice.
        raise AppError(403, "forbidden", "Homeowner chat is not available yet")
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "You are not assigned to this site")


async def _get_or_create_site_conversation(
    session: AsyncSession, user: User, site_id: UUID
) -> Conversation:
    conv = (
        await session.execute(
            select(Conversation).where(
                Conversation.site_id == site_id,
                Conversation.kind == ConversationKind.site,
            )
        )
    ).scalar_one_or_none()
    if conv is None:
        conv = Conversation(
            company_id=user.company_id,
            site_id=site_id,
            kind=ConversationKind.site,
            created_by=user.id,
        )
        session.add(conv)
        await session.flush()
    return conv


@router.post("/messages", response_model=ChatMessageOut, status_code=201)
async def send_message(
    body: ChatSendIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChatMessageOut:
    """Post a message to the site's crew thread (idempotent on client_msg_id)."""
    await _require_site(session, user, body.site_id)

    has_content = bool(body.body and body.body.strip()) or bool(body.fields)
    if not has_content:
        raise AppError(422, "empty_message", "Provide body text or structured fields")

    conv = await _get_or_create_site_conversation(session, user, body.site_id)

    # Idempotency: a retried send (offline outbox) returns the existing row.
    existing = (
        await session.execute(
            select(ChatMessage).where(
                ChatMessage.conversation_id == conv.id,
                ChatMessage.client_msg_id == body.client_msg_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return ChatMessageOut.model_validate(existing)

    # Assign a gap-free seq under a row lock on the conversation (ordering
    # authority, independent of client clock skew).
    locked = (
        await session.execute(
            select(Conversation).where(Conversation.id == conv.id).with_for_update()
        )
    ).scalar_one()
    now = datetime.now(UTC)
    seq = locked.last_seq + 1
    locked.last_seq = seq
    locked.last_message_at = now

    msg = ChatMessage(
        conversation_id=conv.id,
        sender_id=user.id,
        sender_side=_side_for(user),
        client_msg_id=body.client_msg_id,
        seq=seq,
        body=body.body,
        reply_to_id=body.reply_to_id,
        media_type="text",
    )
    session.add(msg)
    await session.flush()

    # Extraction seam — mint a RawMessage(source="app_chat") and bridge it. The
    # capture_type/fields hints ride the Phase 0.1 fast path.
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{body.site_id}",
        sender_id=str(user.id),
        sender_name=user.name,
        media_type="text",
        text=body.body,
        sent_at=now,
        received_at=now,
        raw={
            "client": "app_chat",
            "capture_type": body.capture_type,
            "fields": body.fields,
            "site_id": str(body.site_id),
            "chat_message_id": str(msg.id),
        },
    )
    session.add(raw)
    await session.flush()
    msg.raw_message_id = raw.id
    await session.commit()
    await session.refresh(msg)

    # Best-effort: a worker failure must never fail the send.
    await enqueue_extraction(raw.id)
    return ChatMessageOut.model_validate(msg)


@router.get("/messages", response_model=list[ChatMessageOut])
async def list_messages(
    site_id: UUID = Query(...),
    after_seq: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ChatMessageOut]:
    """The site thread, oldest→newest, after a seq cursor (for sync-on-reconnect)."""
    await _require_site(session, user, site_id)
    conv = (
        await session.execute(
            select(Conversation).where(
                Conversation.site_id == site_id,
                Conversation.kind == ConversationKind.site,
            )
        )
    ).scalar_one_or_none()
    if conv is None:
        return []
    rows = (
        await session.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conv.id, ChatMessage.seq > after_seq)
            .order_by(ChatMessage.seq)
            .limit(limit)
        )
    ).scalars().all()
    return [ChatMessageOut.model_validate(r) for r in rows]


@router.post("/read", status_code=204)
async def mark_read(
    body: ChatReadIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Advance the caller's read cursor for the site thread."""
    await _require_site(session, user, body.site_id)
    conv = (
        await session.execute(
            select(Conversation).where(
                Conversation.site_id == body.site_id,
                Conversation.kind == ConversationKind.site,
            )
        )
    ).scalar_one_or_none()
    if conv is None:
        return
    cursor = await session.get(ConversationRead, (conv.id, user.id))
    if cursor is None:
        session.add(
            ConversationRead(
                conversation_id=conv.id, user_id=user.id, last_read_seq=body.last_seq
            )
        )
    else:
        cursor.last_read_seq = max(cursor.last_read_seq, body.last_seq)
    await session.commit()
