"""In-app chat (Phase 1.0): conversations, messages, read cursors.

The thread is "capture with a conversation around it": every message in a
site/homeowner conversation also mints a ``RawMessage(source="app_chat")`` and
flows through the SAME extraction pipeline (``chat_messages.raw_message_id`` is
the bridge). Ordering authority is the per-conversation ``seq`` (a monotonic
counter on the conversation row, assigned under a row lock); ``client_msg_id``
makes sends idempotent so an offline outbox can retry safely.

Membership is derived from site scope in v1 (homeowner members + the site's
contractor team), so there is no explicit members table yet.
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ConversationKind(StrEnum):
    homeowner = "homeowner"  # curated homeowner <-> contractor (Calm Cockpit)
    site = "site"  # the crew's per-site thread (Blueprint)


class MessageSide(StrEnum):
    homeowner = "homeowner"
    contractor = "contractor"


class Conversation(Base):
    """One thread, scoped to a site. v1: one per (site, kind)."""

    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("site_id", "kind", name="uq_conversation_site_kind"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[ConversationKind] = mapped_column(
        SAEnum(ConversationKind, name="conversation_kind"), nullable=False
    )
    title: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    # Per-conversation monotonic message counter (ordering authority). Assigned
    # under a row lock on send so it is gap-free and clock-independent.
    last_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    last_message_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ChatMessage(Base):
    """A single message. Carries the extraction bridge + threading substrate."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id", "client_msg_id", name="uq_chat_message_client_id"
        ),
        UniqueConstraint("conversation_id", "seq", name="uq_chat_message_seq"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    sender_side: Mapped[MessageSide] = mapped_column(
        SAEnum(MessageSide, name="message_side"), nullable=False
    )
    client_msg_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    seq: Mapped[int] = mapped_column(BigInteger, nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Threading substrate (feature 14) — a quote-reply / thread-under-card parent.
    reply_to_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    # The extraction bridge — set when this message minted a RawMessage.
    raw_message_id: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    attachment_key: Mapped[str | None] = mapped_column(String, nullable=True)
    attachment_mime: Mapped[str | None] = mapped_column(String, nullable=True)
    media_type: Mapped[str] = mapped_column(String, nullable=False, server_default="text")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ConversationRead(Base):
    """Per-user read cursor (for unread counts)."""

    __tablename__ = "conversation_reads"

    conversation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    last_read_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
