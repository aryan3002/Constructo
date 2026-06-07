"""Explicit conversation membership (Groups subsystem, doc 18 Phase 2).

Group threads (``ConversationKind.group``) carry membership in this table rather
than deriving it from site scope. Each row is one user in one conversation, with
a role (admin/member), a mute flag, and provenance (who added them).
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class MemberRole(StrEnum):
    admin = "admin"
    member = "member"


class ConversationMember(Base):
    """One user's membership in one conversation."""

    __tablename__ = "conversation_members"

    conversation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[MemberRole] = mapped_column(
        SAEnum(MemberRole, name="member_role"), nullable=False, server_default="member"
    )
    added_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    muted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
