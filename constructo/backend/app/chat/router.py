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

import hashlib
from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.action_items.detector import detect_action_item
from app.auth.deps import get_current_user
from app.auth.jwt import decode_token
from app.brief.generate import _to_contract
from app.brief.risk import detect_risks, rank_risks
from app.chat.access import require_access
from app.chat.realtime import broadcaster
from app.chat.reply_interpreter import apply_correction, is_approval, parse_correction
from app.common.errors import AppError
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.models import (
    AckKind,
    ActionItem,
    ActionItemEvent,
    ActionItemEventKind,
    ActionItemStatus,
    ChatMessage,
    Conversation,
    ConversationKind,
    ConversationMember,
    ConversationRead,
    DisputeStatus,
    EventDispute,
    HomeownerMember,
    MessageAck,
    MessageSide,
    RawMessageModel,
    Site,
    SiteEventModel,
    User,
    UserRole,
)
from app.queue import enqueue_extraction
from app.sites.router import effective_visible_site_ids
from app.storage import get_storage

# Roles that may directly commit a correction; others' corrections raise a
# dispute (1.7) — they can flag, an authority resolves.
_CORRECTION_AUTHORITY = {UserRole.owner, UserRole.pm}

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])

DEFAULT_LIMIT = 50
MAX_LIMIT = 200

# Sort floor for inbox ordering across two sources (site + group) in Python —
# threads with no messages yet sort last under "newest-first".
_MIN_DT = datetime(1970, 1, 1, tzinfo=UTC)


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
    # Media (1.2 Camera-as-Sensor): a bare R2 key the client uploaded to, plus its
    # mime and kind. Extraction OCRs/STTs it.
    attachment_key: str | None = None
    attachment_mime: str | None = None
    media_type: str = "text"
    # Content hash from the upload (1.7 dedupe) — a replayed challan is caught.
    attachment_sha256: str | None = None


class ChatReadIn(BaseModel):
    site_id: UUID | None = None
    conversation_id: UUID | None = None
    last_seq: int = Field(ge=0)

    @model_validator(mode="after")
    def _one_target(self):
        if self.site_id is None and self.conversation_id is None:
            raise ValueError("provide site_id or conversation_id")
        return self


class MediaUploadOut(BaseModel):
    """The stored object's bare key — the client then sends a message carrying
    it as ``attachment_key`` (and ``attachment_sha256`` for dedupe)."""

    key: str
    media_type: str
    sha256: str


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
    # True when an open dispute contests this event (1.7) — the card shows it.
    contested: bool = False


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
    # Set when this attachment duplicates an earlier one (1.7) — the UI flags it
    # and it never books a second event.
    duplicate_of_id: UUID | None = None
    # The events this message minted via extraction (latest version only). Empty
    # for plain human talk (a bubble) or before extraction has run.
    events: list[ChatEventOut] = Field(default_factory=list)


class ConversationOut(BaseModel):
    """One row in the chat inbox (owner Chat tab / future supervisor + homeowner)."""

    id: UUID
    kind: ConversationKind
    site_id: UUID | None
    title: str | None
    site_name: str | None
    last_message_at: datetime | None
    unread_count: int
    has_homeowner: bool


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


async def _resolve_conversation(
    session: AsyncSession,
    user: User,
    *,
    site_id: UUID | None,
    conversation_id: UUID | None,
) -> Conversation | None:
    """Resolve the target conversation for a read surface from either a
    ``conversation_id`` (any kind, access-checked) or a ``site_id`` (the crew
    site thread, may not exist yet → None). Raises AppError on missing/forbidden.

    ``conversation_id`` wins when both are supplied.
    """
    if conversation_id is not None:
        conv = await session.get(Conversation, conversation_id)
        if conv is None:
            raise AppError(404, "not_found", "Conversation not found")
        await require_access(session, user, conv)
        return conv
    if site_id is None:
        raise AppError(422, "missing_target", "Provide site_id or conversation_id")
    await _require_site(session, user, site_id)
    return (
        await session.execute(
            select(Conversation).where(
                Conversation.site_id == site_id,
                Conversation.kind == ConversationKind.site,
            )
        )
    ).scalar_one_or_none()


async def _parent_event(session: AsyncSession, reply_to_id: UUID | None) -> SiteEventModel | None:
    """The latest ``SiteEvent`` the reply's parent message produced (or None)."""
    if reply_to_id is None:
        return None
    parent = await session.get(ChatMessage, reply_to_id)
    if parent is None or parent.raw_message_id is None:
        return None
    return (
        await session.execute(
            select(SiteEventModel)
            .where(SiteEventModel.source_message_ids.overlap([parent.raw_message_id]))
            .where(latest_event_clause())
            .order_by(SiteEventModel.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _apply_reply_correction(
    session: AsyncSession,
    user: User,
    reply_to_id: UUID | None,
    body: str | None,
) -> dict | None:
    """Reply-to-Card (1.4): a deterministic numeric correction ("45 nahi 54")
    against a card. An authority (owner/PM) supersedes the field in place
    (append-only new version); anyone else raises a dispute (1.7) — never a
    silent overwrite. Returns a small outcome dict, or None when the reply isn't
    a recognised correction."""
    if not body:
        return None
    event = await _parent_event(session, reply_to_id)
    if event is None:
        return None
    corr = parse_correction(body)
    if corr is None:
        return None
    applied = apply_correction(event.fields, corr)
    if applied is None:
        return None
    new_fields, changed_key = applied

    if user.role in _CORRECTION_AUTHORITY:
        superseding = SiteEventModel(
            site_id=event.site_id,
            event_type=event.event_type,
            occurred_on=event.occurred_on,
            summary=event.summary,
            fields=new_fields,
            confidence=1.0,
            needs_clarification=False,
            source_message_ids=event.source_message_ids,
            version=event.version + 1,
            supersedes_event_id=event.id,
        )
        session.add(superseding)
        await session.flush()
        return {"action": "corrected", "field": changed_key, "event_id": str(superseding.id)}

    dispute = EventDispute(
        company_id=user.company_id,
        site_id=event.site_id,
        event_id=event.id,
        raised_by=user.id,
        raised_by_role=user.role.value,
        reason=(body or "").strip()[:2000],
        proposed_fields=new_fields,
        status=DisputeStatus.open,
    )
    session.add(dispute)
    await session.flush()
    return {"action": "disputed", "field": changed_key, "dispute_id": str(dispute.id)}


async def _propose_action_item(
    session: AsyncSession, user: User, site_id: UUID, message_id: UUID, body: str
) -> None:
    """AI-detect a to-do in a chat message and stage a badged Action Item (2.7).
    created_by_ai (Nivaan), no assignee — the user keeps or dismisses it. The
    add is staged on the session and committed with the message."""
    proposal = detect_action_item(body)
    if proposal is None:
        return
    item = ActionItem(
        company_id=user.company_id,
        site_id=site_id,
        title=proposal.title,
        created_by=None,
        created_by_ai=True,
        due_on=proposal.due_on,
        source_message_id=message_id,
        status=ActionItemStatus.open,
    )
    session.add(item)
    await session.flush()
    session.add(
        ActionItemEvent(
            action_item_id=item.id, kind=ActionItemEventKind.created, actor_is_ai=True
        )
    )


async def _apply_reply_approval(
    session: AsyncSession,
    user: User,
    reply_to_id: UUID | None,
    body: str | None,
) -> dict | None:
    """Reply-to-Card approve (1.4): "haan theek hai" under an approval/Decision
    card flips it to "Approved by <role> · v2" — a logged, attributed,
    superseding event. Authority-gated: only an owner/PM can approve (a
    supervisor can't approve an owner-only Decision). Returns the outcome, or
    None when the reply isn't an approval of a Decision card."""
    if not body or not is_approval(body):
        return None
    event = await _parent_event(session, reply_to_id)
    if event is None or event.event_type != "approval":
        return None
    if user.role not in _CORRECTION_AUTHORITY:
        return None  # not the deciding authority — let it send as a plain message
    now = datetime.now(UTC)
    superseding = SiteEventModel(
        site_id=event.site_id,
        event_type="approval",
        occurred_on=event.occurred_on,
        summary=event.summary,
        fields={
            **(event.fields or {}),
            "status": "approved",
            "approved_by": str(user.id),
            "approved_by_role": user.role.value,
            "approved_at": now.isoformat(),
        },
        confidence=1.0,
        needs_clarification=False,
        source_message_ids=event.source_message_ids,
        version=event.version + 1,
        supersedes_event_id=event.id,
    )
    session.add(superseding)
    await session.flush()
    return {"action": "approved", "event_id": str(superseding.id)}


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

    # Adversarial-capture dedupe (1.7): a replayed attachment (same content hash
    # already in this thread) is recorded as a duplicate and NOT extracted, so it
    # can't double-book a delivery. client_msg_id can't catch this.
    duplicate_of_id: UUID | None = None
    if body.attachment_sha256:
        prior = (
            await session.execute(
                select(ChatMessage.id)
                .where(
                    ChatMessage.conversation_id == conv.id,
                    ChatMessage.media_sha256 == body.attachment_sha256,
                    ChatMessage.duplicate_of_id.is_(None),
                )
                .order_by(ChatMessage.seq)
                .limit(1)
            )
        ).scalar_one_or_none()
        duplicate_of_id = prior

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
        media_sha256=body.attachment_sha256,
        duplicate_of_id=duplicate_of_id,
    )
    session.add(msg)
    await session.flush()

    # A duplicate capture is persisted (the thread shows it, flagged) but never
    # extracted — it must not mint a second event.
    if duplicate_of_id is not None:
        await session.commit()
        await session.refresh(msg)
        out = ChatMessageOut.model_validate(msg)
        out.attachment_url = _safe_attachment_url(msg.attachment_key)
        return out

    # Reply-to-Card (1.4): a deterministic correction ("45 nahi 54") acts on the
    # parent card — it supersedes the value (authority) or raises a dispute — and
    # is NOT itself re-extracted as a new capture.
    correction = await _apply_reply_correction(session, user, body.reply_to_id, body.body)
    if correction is not None:
        await session.commit()
        await session.refresh(msg)
        return ChatMessageOut.model_validate(msg)

    # Reply-to-Card (1.4): "haan theek hai" under an approval card commits the
    # approval (authority-gated) and is not itself re-extracted.
    approval = await _apply_reply_approval(session, user, body.reply_to_id, body.body)
    if approval is not None:
        await session.commit()
        await session.refresh(msg)
        return ChatMessageOut.model_validate(msg)

    # AI-detected Action Item (2.7): a plain-text assignment ("Ramesh ko Friday
    # tak bolo") spawns a badged, dismissable to-do. Only on free text (a typed
    # capture / media is a capture, not a task). Best-effort: never fails a send.
    if body.body and not body.capture_type and not body.fields and not body.attachment_key:
        await _propose_action_item(session, user, body.site_id, msg.id, body.body)

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
    # Push the new message live to any subscribed clients (2.0). The card upgrade
    # arrives on the client's next refetch once extraction runs; the bubble is live.
    await broadcaster.publish(conv.id, out.model_dump(mode="json"))
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
    return MediaUploadOut(key=key, media_type=media_type, sha256=hashlib.sha256(data).hexdigest())


@router.get("/messages", response_model=list[ChatMessageOut])
async def list_messages(
    site_id: UUID | None = Query(None),
    conversation_id: UUID | None = Query(None),
    after_seq: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ChatMessageOut]:
    """A thread, oldest→newest, after a seq cursor (for sync-on-reconnect).

    Keyed by ``conversation_id`` (any kind, access-checked) or the crew
    ``site_id``. An empty site thread (no conversation yet) lists as []."""
    conv = await _resolve_conversation(
        session, user, site_id=site_id, conversation_id=conversation_id
    )
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
    contested = await _contested_event_ids(
        session, [e.id for evs in events_by_raw.values() for e in evs]
    )
    storage = get_storage()
    out: list[ChatMessageOut] = []
    for r in rows:
        msg_out = ChatMessageOut.model_validate(r)
        msg_out.attachment_url = _safe_attachment_url(r.attachment_key, storage)
        events = []
        for e in events_by_raw.get(r.raw_message_id, []):
            eo = ChatEventOut.model_validate(e)
            eo.contested = e.id in contested
            events.append(eo)
        msg_out.events = events
        out.append(msg_out)
    return out


async def _contested_event_ids(session: AsyncSession, event_ids: list[UUID]) -> set[UUID]:
    """Event ids with an OPEN dispute (1.7), batched. Empty when there are none."""
    if not event_ids:
        return set()
    rows = (
        await session.execute(
            select(EventDispute.event_id).where(
                EventDispute.event_id.in_(event_ids),
                EventDispute.status == DisputeStatus.open,
            )
        )
    ).scalars().all()
    return set(rows)


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


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConversationOut]:
    """The chat inbox: every site crew thread the caller can access plus every
    group thread they belong to, with unread counts and a 'client present' cue.
    Site membership is derived from site scope; group membership is explicit
    (``ConversationMember``). The homeowner inbox stays closed in Phase 2 — the
    homeowner Messages surface is a later slice gated on a membrane review."""
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Homeowner chat is not available yet")

    visible = await effective_visible_site_ids(session, user)

    # ---- site threads (skipped entirely for homeowner role) ----------------
    out_sites: list[ConversationOut] = []
    if visible:
        rows = (
            await session.execute(
                select(Conversation, Site.name)
                .join(Site, Site.id == Conversation.site_id)
                .where(
                    Conversation.kind == ConversationKind.site,
                    Conversation.site_id.in_(visible),
                )
            )
        ).all()
        if rows:
            site_conv_ids = [conv.id for conv, _ in rows]
            site_ids = list({conv.site_id for conv, _ in rows})
            site_reads = await _reads_for(session, user, site_conv_ids)
            homeowner_site_ids = set(
                (
                    await session.execute(
                        select(HomeownerMember.site_id)
                        .where(HomeownerMember.site_id.in_(site_ids))
                        .distinct()
                    )
                ).scalars().all()
            )
            out_sites = [
                ConversationOut(
                    id=conv.id,
                    kind=conv.kind,
                    site_id=conv.site_id,
                    title=conv.title,
                    site_name=site_name,
                    last_message_at=conv.last_message_at,
                    unread_count=max(0, conv.last_seq - site_reads.get(conv.id, 0)),
                    has_homeowner=conv.site_id in homeowner_site_ids,
                )
                for conv, site_name in rows
            ]

    # ---- group threads (explicit membership; any role) ---------------------
    group_rows = (
        await session.execute(
            select(Conversation)
            .join(
                ConversationMember,
                ConversationMember.conversation_id == Conversation.id,
            )
            .where(
                ConversationMember.user_id == user.id,
                Conversation.kind == ConversationKind.group,
                Conversation.archived_at.is_(None),
            )
        )
    ).scalars().all()
    out_groups: list[ConversationOut] = []
    if group_rows:
        g_ids = [g.id for g in group_rows]
        group_reads = await _reads_for(session, user, g_ids)
        homeowner_group_ids = set(
            (
                await session.execute(
                    select(ConversationMember.conversation_id)
                    .join(User, User.id == ConversationMember.user_id)
                    .where(
                        ConversationMember.conversation_id.in_(g_ids),
                        User.role == UserRole.homeowner,
                    )
                    .distinct()
                )
            ).scalars().all()
        )
        out_groups = [
            ConversationOut(
                id=g.id,
                kind=g.kind,
                site_id=None,
                title=g.title,
                site_name=None,
                last_message_at=g.last_message_at,
                unread_count=max(0, g.last_seq - group_reads.get(g.id, 0)),
                has_homeowner=g.id in homeowner_group_ids,
            )
            for g in group_rows
        ]

    combined = out_sites + out_groups
    combined.sort(key=lambda c: c.last_message_at or _MIN_DT, reverse=True)
    return combined


async def _reads_for(
    session: AsyncSession, user: User, conv_ids: list[UUID]
) -> dict[UUID, int]:
    """The caller's last-read seq per conversation, batched."""
    if not conv_ids:
        return {}
    return {
        r.conversation_id: r.last_read_seq
        for r in (
            await session.execute(
                select(ConversationRead).where(
                    ConversationRead.conversation_id.in_(conv_ids),
                    ConversationRead.user_id == user.id,
                )
            )
        ).scalars().all()
    }


class BriefRiskOut(BaseModel):
    kind: str
    severity: str
    message: str
    evidence_event_ids: list[UUID]


class ChatBriefOut(BaseModel):
    """The owner's brief, pinned in the site thread (1.8). Exceptions-first:
    the top ranked risks, each with its evidence, or 'all caught up'."""

    site_id: UUID
    risk_count: int
    headline: str
    risks: list[BriefRiskOut]


_BRIEF_HISTORY_DAYS = 14


@router.get("/brief", response_model=ChatBriefOut)
async def site_brief(
    site_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChatBriefOut:
    """The site's ranked risks for today — the brief as a pinned thread card.
    Reuses the deterministic risk engine (labour shortfall, unverified invoices,
    pending approvals, data quality); abstains honestly when there's nothing."""
    await _require_site(session, user, site_id)
    today = date.today()

    today_rows = (
        await session.execute(
            select(SiteEventModel)
            .where(SiteEventModel.site_id == site_id, SiteEventModel.occurred_on == today)
            .where(latest_event_clause())
        )
    ).scalars().all()
    history_rows = (
        await session.execute(
            select(SiteEventModel)
            .where(
                SiteEventModel.site_id == site_id,
                SiteEventModel.event_type == "attendance",
                SiteEventModel.occurred_on >= today - timedelta(days=_BRIEF_HISTORY_DAYS),
                SiteEventModel.occurred_on < today,
            )
            .where(latest_event_clause())
        )
    ).scalars().all()

    risks = detect_risks(
        [_to_contract(r) for r in today_rows],
        site_id=site_id,
        history_events=[_to_contract(r) for r in history_rows],
    )
    top = rank_risks(risks, 3)
    headline = (
        "All caught up" if not top else f"{len(top)} thing{'s' if len(top) != 1 else ''} need you"
    )
    return ChatBriefOut(
        site_id=site_id,
        risk_count=len(top),
        headline=headline,
        risks=[
            BriefRiskOut(
                kind=r["kind"],
                severity=r["severity"],
                message=r["message"],
                evidence_event_ids=r.get("evidence_event_ids", []),
            )
            for r in top
        ],
    )


class AckIn(BaseModel):
    ack: AckKind


class ResolveOut(BaseModel):
    closed_action_items: int


async def _load_message_in_scope(
    session: AsyncSession, user: User, message_id: UUID
) -> ChatMessage:
    msg = await session.get(ChatMessage, message_id)
    if msg is None:
        raise AppError(404, "not_found", "Message not found")
    conv = await session.get(Conversation, msg.conversation_id)
    if conv is None:
        raise AppError(404, "not_found", "Conversation not found")
    await _require_site(session, user, conv.site_id)
    return msg


@router.post("/messages/{message_id}/ack", status_code=204)
async def ack_message(
    message_id: UUID,
    body: AckIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Word-ack a message (Seen / On it / Done) — never an emoji (2.6). One ack
    per user per message; re-acking overwrites."""
    await _load_message_in_scope(session, user, message_id)
    existing = await session.get(MessageAck, (message_id, user.id))
    if existing is None:
        session.add(MessageAck(message_id=message_id, user_id=user.id, ack=body.ack))
    else:
        existing.ack = body.ack
    await session.commit()


@router.post("/messages/{message_id}/resolve", response_model=ResolveOut)
async def resolve_thread(
    message_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ResolveOut:
    """Resolve a thread → close the Action Item(s) lifted from this message (2.6
    'resolve-thread closes its linked object'). Idempotent; audit-logged."""
    await _load_message_in_scope(session, user, message_id)
    items = (
        await session.execute(
            select(ActionItem).where(
                ActionItem.source_message_id == message_id,
                ActionItem.status == ActionItemStatus.open,
            )
        )
    ).scalars().all()
    for item in items:
        item.status = ActionItemStatus.done
        item.completed_at = datetime.now(UTC)
        session.add(
            ActionItemEvent(
                action_item_id=item.id, kind=ActionItemEventKind.completed, actor_id=user.id,
                note="resolved via thread",
            )
        )
    await session.commit()
    return ResolveOut(closed_action_items=len(items))


@router.websocket("/ws")
async def chat_ws(
    websocket: WebSocket,
    site_id: UUID | None = Query(None),
    conversation_id: UUID | None = Query(None),
    token: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Live message stream for a thread (2.0). Auth is a query ``token``
    (WS can't carry an Authorization header cleanly); scoping reuses the REST
    rules via ``_resolve_conversation`` (so homeowner is still blocked from a
    site thread, but may subscribe to a group it belongs to). The
    seq-authoritative store is still Neon and the client backfills anything
    missed via ``after_seq`` — this only pushes new messages live."""
    try:
        user = await session.get(User, UUID(decode_token(token)["sub"]))
    except Exception:
        await websocket.close(code=1008)
        return
    if user is None:
        await websocket.close(code=1008)
        return
    try:
        conv = await _resolve_conversation(
            session, user, site_id=site_id, conversation_id=conversation_id
        )
    except AppError:
        await websocket.close(code=1008)
        return
    if conv is None:
        await websocket.close(code=1011)
        return

    await websocket.accept()
    try:
        async with broadcaster.subscribe(conv.id) as queue:
            while True:
                payload = await queue.get()
                await websocket.send_json(payload)
    except WebSocketDisconnect:
        return
    except Exception:  # pragma: no cover - defensive (client gone)
        return


@router.post("/read", status_code=204)
async def mark_read(
    body: ChatReadIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Advance the caller's read cursor for the target thread."""
    conv = await _resolve_conversation(
        session, user, site_id=body.site_id, conversation_id=body.conversation_id
    )
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
