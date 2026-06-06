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

from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    ConversationRead,
    MessageSide,
    RawMessageModel,
    SiteEventModel,
    User,
    UserRole,
)
from app.queue import enqueue_extraction
from app.sites.router import effective_visible_site_ids
from app.storage import get_storage

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


# Media a chat message can carry (Camera-as-Sensor / voice). "document" routes a
# challan/invoice through OCR; "image" is a scene photo; "voice" runs STT.
_CHAT_MEDIA_TYPES = {"text", "image", "document", "voice"}


class ChatSendIn(BaseModel):
    site_id: UUID
    client_msg_id: UUID
    body: str | None = None
    reply_to_id: UUID | None = None
    # Structured-capture hints (Phase 0.1 fast path) — a typed card / slash-cmd.
    capture_type: str | None = None
    fields: dict | None = None
    # Media (1.2 Camera-as-Sensor): a bare R2 key the client uploaded to via the
    # presign ticket, plus its mime and kind. Extraction OCRs/STTs it.
    attachment_key: str | None = None
    attachment_mime: str | None = None
    media_type: str = "text"


class ChatReadIn(BaseModel):
    site_id: UUID
    last_seq: int = Field(ge=0)


class MediaUploadOut(BaseModel):
    """The stored object's bare key — the client then sends a message carrying
    it as ``attachment_key``."""

    key: str
    media_type: str


class ChatEventOut(BaseModel):
    """The structured ``SiteEvent`` a message produced — rendered inline as a
    Card (event-type pill + key fields + evidence) instead of a flat bubble.
    This is what makes "capture with a conversation around it" visible."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_type: str
    occurred_on: date
    summary: str
    fields: dict
    confidence: float
    needs_clarification: bool


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
    # A short-lived presigned GET URL for the attachment (None for text). The DB
    # stores only the bare key; reads resolve it through storage.url_for.
    attachment_url: str | None = None
    # The events this message minted via extraction (latest version only). Empty
    # for plain human talk (a bubble) or before extraction has run.
    events: list[ChatEventOut] = Field(default_factory=list)


def _safe_attachment_url(key: str | None, storage=None) -> str | None:
    """Best-effort presigned GET for an attachment key. Never raises — a presign
    hiccup must not break sending or listing (the client can re-fetch)."""
    if not key:
        return None
    try:
        return (storage or get_storage()).url_for(key)
    except Exception:  # pragma: no cover - defensive
        return None


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


async def _reply_context(
    session: AsyncSession, conversation_id: UUID, reply_to_id: UUID | None
) -> dict | None:
    """Resolve a quote-reply's parent into a small context dict for extraction.

    Validates the parent is in the same conversation (no cross-thread leak) and
    returns ``{parent_text, parent_event_type?}`` — the signal that lets a terse
    reply be read in its parent's schema. ``None`` when there is no/invalid parent.
    """
    if reply_to_id is None:
        return None
    parent = await session.get(ChatMessage, reply_to_id)
    if parent is None or parent.conversation_id != conversation_id:
        raise AppError(422, "bad_reply_to", "reply_to is not in this conversation")
    ctx: dict = {"parent_text": parent.body or ""}
    if parent.raw_message_id is not None:
        ev_type = (
            await session.execute(
                select(SiteEventModel.event_type)
                .where(SiteEventModel.source_message_ids.overlap([parent.raw_message_id]))
                .where(latest_event_clause())
                .order_by(SiteEventModel.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if ev_type:
            ctx["parent_event_type"] = ev_type
    return ctx


@router.post("/messages", response_model=ChatMessageOut, status_code=201)
async def send_message(
    body: ChatSendIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChatMessageOut:
    """Post a message to the site's crew thread (idempotent on client_msg_id)."""
    await _require_site(session, user, body.site_id)

    if body.media_type not in _CHAT_MEDIA_TYPES:
        raise AppError(422, "bad_media_type", f"media_type must be one of {_CHAT_MEDIA_TYPES}")
    has_content = (
        bool(body.body and body.body.strip())
        or bool(body.fields)
        or bool(body.attachment_key)
    )
    if not has_content:
        raise AppError(
            422, "empty_message", "Provide body text, structured fields, or an attachment"
        )

    conv = await _get_or_create_site_conversation(session, user, body.site_id)

    # Threading (1.5): a quote-reply must target a message in THIS thread, and we
    # stash the parent's text + type so extraction can read a terse reply in its
    # parent's context ("haan theek hai" under a Decision, "45 nahi 54" under a
    # Delivery). Scoping: never let a reply_to point across conversations.
    reply_context = await _reply_context(session, conv.id, body.reply_to_id)

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
        media_type=body.media_type,
        attachment_key=body.attachment_key,
        attachment_mime=body.attachment_mime,
    )
    session.add(msg)
    await session.flush()

    # Extraction seam — mint a RawMessage(source="app_chat") and bridge it. The
    # capture_type/fields hints ride the Phase 0.1 fast path; a media attachment
    # (challan photo / voice note) flows through OCR/STT (1.2 Camera-as-Sensor).
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{body.site_id}",
        sender_id=str(user.id),
        sender_name=user.name,
        media_type=body.media_type,
        text=body.body,
        media_url=body.attachment_key,
        media_mime=body.attachment_mime,
        sent_at=now,
        received_at=now,
        raw={
            "client": "app_chat",
            "capture_type": body.capture_type,
            "fields": body.fields,
            "site_id": str(body.site_id),
            "chat_message_id": str(msg.id),
            **({"reply_context": reply_context} if reply_context else {}),
        },
    )
    session.add(raw)
    await session.flush()
    msg.raw_message_id = raw.id
    await session.commit()
    await session.refresh(msg)

    # Best-effort: a worker failure must never fail the send.
    await enqueue_extraction(raw.id)
    out = ChatMessageOut.model_validate(msg)
    out.attachment_url = _safe_attachment_url(msg.attachment_key)
    return out


_MEDIA_EXT = {"image": "jpg", "document": "pdf", "voice": "m4a"}
CHAT_MAX_MEDIA_BYTES = 15 * 1024 * 1024


@router.post("/media", response_model=MediaUploadOut, status_code=201)
async def upload_media(
    file: UploadFile = File(...),
    site_id: UUID = Form(...),
    kind: str = Form("document"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MediaUploadOut:
    """Upload chat media (1.2 Camera-as-Sensor). The server streams the file to
    object storage (R2 in prod, local in CI — same ``put_bytes`` contract) and
    returns the bare key; the client then sends a message carrying it as
    ``attachment_key``, and the worker OCRs/STTs it into a Card."""
    await _require_site(session, user, site_id)
    data = await file.read()
    if not data:
        raise AppError(422, "empty_file", "No file content")
    if len(data) > CHAT_MAX_MEDIA_BYTES:
        raise AppError(413, "media_too_large", "Attachment exceeds 15 MB")
    ext = _MEDIA_EXT.get(kind, "bin")
    key = f"chat/{site_id}/{uuid4().hex}.{ext}"
    get_storage().put_bytes(key, data, file.content_type or "application/octet-stream")
    media_type = kind if kind in _CHAT_MEDIA_TYPES else "document"
    return MediaUploadOut(key=key, media_type=media_type)


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

    events_by_raw = await _events_for_messages(session, rows)
    storage = get_storage()
    out: list[ChatMessageOut] = []
    for r in rows:
        msg_out = ChatMessageOut.model_validate(r)
        msg_out.attachment_url = _safe_attachment_url(r.attachment_key, storage)
        msg_out.events = [
            ChatEventOut.model_validate(e)
            for e in events_by_raw.get(r.raw_message_id, [])
        ]
        out.append(msg_out)
    return out


async def _events_for_messages(
    session: AsyncSession, rows: list[ChatMessage]
) -> dict[UUID, list[SiteEventModel]]:
    """Resolve each message's linked ``SiteEvent``(s) in one batched query.

    A message's ``raw_message_id`` lands in the event's ``source_message_ids``
    (the extraction bridge), so an array-overlap fetches the whole page at once
    (no N+1). ``latest_event_clause()`` keeps it latest-version-wins, so a future
    reply-to-card edit or promote-to-card never double-renders.
    """
    raw_ids = [r.raw_message_id for r in rows if r.raw_message_id is not None]
    if not raw_ids:
        return {}
    events = (
        await session.execute(
            select(SiteEventModel)
            .where(SiteEventModel.source_message_ids.overlap(raw_ids))
            .where(latest_event_clause())
            .order_by(SiteEventModel.created_at)
        )
    ).scalars().all()
    raw_id_set = set(raw_ids)
    by_raw: dict[UUID, list[SiteEventModel]] = {}
    for ev in events:
        for sid in ev.source_message_ids:
            if sid in raw_id_set:
                by_raw.setdefault(sid, []).append(ev)
    return by_raw


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
