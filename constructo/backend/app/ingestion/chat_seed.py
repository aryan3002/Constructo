"""chat_seed — seeds real WhatsApp history into Constructo's in-app chat.

Called by the WhatsApp importer (scripts/import_whatsapp_export.py) to turn
each WhatsApp message into a ``ChatMessage`` (so the Messages tab is populated)
bridged to a ``RawMessage(source="app_chat")`` (so the existing extraction
pipeline produces events/cards).

Three public entry points
-------------------------
conversation_id   – deterministic UUID for a (site, kind) singleton
get_or_create_conversations – idempotent bootstrap of the two per-site threads
classify_channel  – pure routing: which thread does a WhatsApp message belong in
seed_chat_message – create ChatMessage + RawMessage bridge; fully idempotent
"""
from __future__ import annotations

from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RawMessageModel, User
from app.models.chat import ChatMessage, Conversation, ConversationKind, MessageSide, SenderKind

# ---------------------------------------------------------------------------
# 1. Deterministic conversation UUID + idempotent creation
# ---------------------------------------------------------------------------

def conversation_id(site_id: UUID, kind: str) -> UUID:
    """Deterministic UUID for a (site_id, kind) conversation.

    Using uuid5 lets the importer always reference the same row without a prior
    DB lookup, and lets two import runs stay idempotent.
    """
    return uuid5(NAMESPACE_URL, f"constructo.chat-seed.{site_id}.{kind}")


async def get_or_create_conversations(
    session: AsyncSession,
    *,
    company_id: UUID,
    site_id: UUID,
) -> tuple[Conversation, Conversation]:
    """Return ``(site_conv, homeowner_conv)`` for *site_id*.

    Respects the partial-unique index on ``(site_id, kind)`` by querying first;
    creates with the deterministic uuid5 id when absent.  Idempotent: safe to
    call multiple times in the same import run.
    """
    site_conv = await _get_or_create_conv(
        session,
        company_id=company_id,
        site_id=site_id,
        kind=ConversationKind.site,
    )
    homeowner_conv = await _get_or_create_conv(
        session,
        company_id=company_id,
        site_id=site_id,
        kind=ConversationKind.homeowner,
    )
    return site_conv, homeowner_conv


async def _get_or_create_conv(
    session: AsyncSession,
    *,
    company_id: UUID,
    site_id: UUID,
    kind: ConversationKind,
) -> Conversation:
    conv = (
        await session.execute(
            select(Conversation).where(
                Conversation.site_id == site_id,
                Conversation.kind == kind,
            )
        )
    ).scalar_one_or_none()

    if conv is None:
        conv = Conversation(
            id=conversation_id(site_id, kind.value),
            company_id=company_id,
            site_id=site_id,
            kind=kind,
        )
        session.add(conv)
        await session.flush()

    return conv


# ---------------------------------------------------------------------------
# 2. Channel routing (pure — no DB access)
# ---------------------------------------------------------------------------

def classify_channel(
    *,
    sender_role: str,
    text: str | None = None,
    media_kind: str | None = None,
    llm_label: str | None = None,
) -> str:
    """Return ``"site"`` or ``"homeowner"``.

    Routing rules (in priority order):
    - homeowner role          → "homeowner" (they only see their thread)
    - supervisor/procurement/labor_contractor → "site" (crew-only ops thread)
    - firm roles (owner/pm/architect/accountant) → "homeowner" when the
      message is labelled homeowner_facing (e.g. "Tiles confirmed"); else "site"
    - anything else           → "site" (safe default; crew can read both)
    """
    if sender_role == "homeowner":
        return "homeowner"

    if sender_role in {"supervisor", "procurement", "labor_contractor"}:
        return "site"

    if sender_role in {"owner", "pm", "architect", "accountant"}:
        return "homeowner" if llm_label == "homeowner_facing" else "site"

    return "site"


# ---------------------------------------------------------------------------
# 3. Seed one message: ChatMessage + bridged RawMessage
# ---------------------------------------------------------------------------

def _chat_message_id(conv_id: UUID, client_msg_id: UUID) -> UUID:
    return uuid5(NAMESPACE_URL, f"chat-seed-msg:{conv_id}:{client_msg_id}")


async def seed_chat_message(
    session: AsyncSession,
    *,
    conv: Conversation,
    user: User,
    text: str | None,
    media_url: str | None,
    media_mime: str | None,
    media_type: str,
    sent_at,
    client_msg_id: UUID,
    sender_side: str,
) -> ChatMessage:
    """Mint one ``ChatMessage`` + ``RawMessage(source="app_chat")`` bridge.

    Idempotent on ``(conv.id, client_msg_id)``: if a matching row already exists
    it is returned unchanged (no seq increment, no extra RawMessage).

    The caller (importer) controls the transaction and calls
    ``handle_ingested(msg.raw_message_id)`` separately — this function never
    commits.

    Parameters
    ----------
    session       AsyncSession (caller owns the transaction)
    conv          The target ``Conversation`` row (already flushed)
    user          The ``User`` who sent the original WhatsApp message
    text          Message body (may be None for pure media)
    media_url     R2 key / public URL of the attachment, if any
    media_mime    MIME type of the attachment, if any
    media_type    Constructo media_type string (e.g. "text", "image", "voice")
    sent_at       Original send time (datetime, tz-aware)
    client_msg_id Deterministic UUID derived from the chat line number
    sender_side   "homeowner" or "contractor" (the MessageSide string value)
    """
    # --- idempotency check ---------------------------------------------------
    existing: ChatMessage | None = (
        await session.execute(
            select(ChatMessage).where(
                ChatMessage.conversation_id == conv.id,
                ChatMessage.client_msg_id == client_msg_id,
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        return existing

    # --- acquire row lock + assign seq ---------------------------------------
    locked: Conversation = (
        await session.execute(
            select(Conversation).where(Conversation.id == conv.id).with_for_update()
        )
    ).scalar_one()

    seq = locked.last_seq + 1
    locked.last_seq = seq
    locked.last_message_at = sent_at

    # --- ChatMessage ---------------------------------------------------------
    msg = ChatMessage(
        id=_chat_message_id(conv.id, client_msg_id),
        conversation_id=conv.id,
        sender_id=user.id,
        sender_side=MessageSide(sender_side),
        sender_kind=SenderKind.user,
        client_msg_id=client_msg_id,
        seq=seq,
        body=text,
        media_type=media_type,
        attachment_key=media_url,
        attachment_mime=media_mime,
        created_at=sent_at,
    )
    session.add(msg)
    await session.flush()  # resolve msg.id before RawMessage references it

    # --- RawMessage bridge ---------------------------------------------------
    assert conv.site_id is not None, "chat_seed only works on site/homeowner conversations"
    raw = RawMessageModel(
        source="app_chat",
        external_group_id=f"app:{conv.site_id}",
        sender_id=str(user.id),
        sender_name=user.name,
        media_type=media_type,
        text=text,
        media_url=media_url,
        media_mime=media_mime,
        sent_at=sent_at,
        received_at=sent_at,
        raw={
            "client": "app_chat",
            "site_id": str(conv.site_id),
            "chat_message_id": str(msg.id),
            "sender_side": sender_side,
        },
    )
    session.add(raw)
    await session.flush()  # resolve raw.id

    msg.raw_message_id = raw.id
    await session.flush()

    return msg
