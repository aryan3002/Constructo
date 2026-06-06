"""Word-based acknowledgements (2.6 Slack-borrow) — Seen / On it / Done.

Never an emoji (Calm-Cockpit-safe). One ack per (message, user); re-acking
overwrites. Distinct from a reply: an ack is a lightweight receipt, not content.
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AckKind(StrEnum):
    seen = "seen"
    on_it = "on_it"
    done = "done"


class MessageAck(Base):
    __tablename__ = "message_acks"

    message_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("chat_messages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    ack: Mapped[AckKind] = mapped_column(SAEnum(AckKind, name="ack_kind"), nullable=False)
    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), default=uuid4, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
