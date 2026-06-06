"""Action Items (Phase 1.6) — chat → tracked to-do.

A task lifted from a message (or created standalone) with an owner, a status, and
a due date. Distinct from a :class:`Decision` (which is an *approve/comment*
authority act): an action item is a *do-a-task* assignment. Every lifecycle
change is recorded in :class:`ActionItemEvent` so the trail is auditable and can
feed the brief / Standing Sentinel.

Created by a human, or by the AI (``created_by_ai`` — the "added by Nivaan"
badge, the Phase-2 ``propose_action_item`` tool); either way any user may edit or
delete it.
"""
from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ActionItemStatus(StrEnum):
    open = "open"
    done = "done"
    cancelled = "cancelled"


class ActionItemEventKind(StrEnum):
    created = "created"
    edited = "edited"
    assigned = "assigned"
    completed = "completed"
    reopened = "reopened"
    cancelled = "cancelled"
    deleted = "deleted"


class ActionItem(Base):
    __tablename__ = "action_items"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Provenance: the chat message this was lifted from (if any).
    source_message_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Who pinned it. created_by is the user; created_by_ai flags a Nivaan-created
    # item (created_by is then null) — the "added by Nivaan" badge.
    created_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_by_ai: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    assignee_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ActionItemStatus] = mapped_column(
        SAEnum(ActionItemStatus, name="action_item_status"),
        nullable=False,
        server_default=ActionItemStatus.open.value,
    )
    due_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ActionItemEvent(Base):
    """Append-only lifecycle log for an action item (audit trail)."""

    __tablename__ = "action_item_events"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    action_item_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("action_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[ActionItemEventKind] = mapped_column(
        SAEnum(ActionItemEventKind, name="action_item_event_kind"), nullable=False
    )
    # The actor; null when the AI (Nivaan) made the change.
    actor_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_is_ai: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
