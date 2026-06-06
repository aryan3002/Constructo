"""Contested-truth state machine (Safety rail 1.7) — committed → disputed →
resolved, *before* any money-tier tool writes against an event.

The wedge's whole promise is a dispute-proof record, which means the ledger needs
a theory of *disagreement*: when two people disagree about a number (a mukadam
logs "12 mason", an owner says "nahi, 10 the"), neither side may silently
overwrite the other. A dispute is raised against an event and resolved by an
authority; resolving with a corrected value writes a NEW superseding
``SiteEvent`` version (append-only, ``supersedes_event_id``) and records WHO
resolved it and WHY — *"12 → disputed by Owner → resolved at 10, 6:58am"* is a
stronger receipt than a silent v2. This must land before money tools (2.5).
"""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DisputeStatus(StrEnum):
    open = "open"  # the event is contested
    resolved = "resolved"  # an authority settled it (maybe wrote a new version)
    withdrawn = "withdrawn"  # the raiser took it back


class EventDispute(Base):
    """A contest against one :class:`SiteEventModel`. Open disputes mark the
    event *contested*; a resolution is append-only and attributed."""

    __tablename__ = "event_disputes"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("site_events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    raised_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    raised_by_role: Mapped[str | None] = mapped_column(String, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    # What the raiser claims the truth should be (optional — they may just flag it).
    proposed_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[DisputeStatus] = mapped_column(
        SAEnum(DisputeStatus, name="dispute_status"),
        nullable=False,
        server_default=DisputeStatus.open.value,
    )
    # Resolution (append-only, attributed) — never a silent overwrite.
    resolved_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_fields: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # The superseding SiteEvent the resolution wrote (if the value changed).
    resolved_event_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("site_events.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
