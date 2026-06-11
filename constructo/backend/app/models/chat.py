"""In-app chat (Phase 1.0): conversations, messages, read cursors.

The thread is "capture with a conversation around it": every message in a
site/homeowner conversation also mints a ``RawMessage(source="app_chat")`` and
flows through the SAME extraction pipeline (``chat_messages.raw_message_id`` is
the bridge). Ordering authority is the per-conversation ``seq`` (a monotonic
counter on the conversation row, assigned under a row lock); ``client_msg_id``
makes sends idempotent so an offline outbox can retry safely.

Membership for ``group`` conversations is explicit (the ``conversation_members``
table); ``site``/``homeowner`` membership stays derived from site scope
(homeowner members + the site's contractor team).
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ConversationKind(StrEnum):
    homeowner = "homeowner"  # curated homeowner <-> contractor (Calm Cockpit)
    site = "site"  # the crew's per-site thread (Blueprint)
    group = "group"  # ad-hoc group thread (explicit membership, site optional)


class MessageSide(StrEnum):
    homeowner = "homeowner"
    contractor = "contractor"


class SenderKind(StrEnum):
    user = "user"      # a human member
    nivaan = "nivaan"  # the AI (Phase B; rows are real, seq-ordered)
    system = "system"  # membrane/system notices ("member added", provenance)


class Conversation(Base):
    """One chat thread. ``site``/``homeowner`` threads are singletons per
    (site, kind); ``group`` threads are additive (a site may have many) and may
    be site-less. The singleton applies only to site/homeowner kinds."""

    __tablename__ = "conversations"
    __table_args__ = (
        Index(
            "uq_conversation_site_singleton",
            "site_id",
            "kind",
            unique=True,
            postgresql_where=text("kind IN ('site','homeowner')"),
        ),
        # site_id is nullable only so groups can be site-less; site/homeowner
        # threads must keep a site_id (NULLs would also defeat the partial
        # unique index above, since Postgres treats NULLs as distinct).
        CheckConstraint(
            "kind NOT IN ('site','homeowner') OR site_id IS NOT NULL",
            name="ck_conversation_site_required",
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=True
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
    archived_at: Mapped[datetime | None] = mapped_column(
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
    # Who/what authored this row (Phase B uses nivaan/system; default human).
    sender_kind: Mapped[SenderKind] = mapped_column(
        SAEnum(SenderKind, name="sender_kind"), nullable=False, server_default="user"
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
    # Adversarial-capture dedupe (1.7): a content hash of the attachment. The same
    # physical challan re-sent (a replayed JPEG) is caught here — client_msg_id
    # can't see it. A duplicate is recorded and NOT extracted, so it can't
    # double-book a delivery.
    media_sha256: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    duplicate_of_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    media_type: Mapped[str] = mapped_column(String, nullable=False, server_default="text")
    # Machine payloads only (proposal cards, provenance, blocked-action notices) —
    # never rendered as free text.
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
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
    # Delivered cursor (✓✓): client advances after persisting messages locally.
    # Monotonic max, gap-free seq ⇒ "delivered through N" is well-defined.
    last_delivered_seq: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default="0"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
