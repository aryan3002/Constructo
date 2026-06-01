"""Quiet-period detection state (H6.1 contracts-freeze).

A *quiet period* is "nothing visible happened on site today — and here is the
SOURCED reason why" (curing, inspection-wait, …). Slice Q (H6.2/H6.3) fills in
the detection sweep, contractor-confirm flow, and projection into
``updates(type=quiet)``. H6.1 only freezes the table shape so that wave can land
without a second migration.

Doctrine: the reason is never invented. ``phase_reason`` is NULL when unknown,
and the AI may only *rephrase* a known phase (see ``app.homeowner.ai``). A
partial-unique index enforces at most one live window per site (the idempotency
invariant the sweep relies on, mirroring ``nudge.py``'s ``nudged_at IS NULL``).
"""
from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class QuietStatus(StrEnum):
    open = "open"            # detected, not yet drafted/confirmed
    suggested = "suggested"  # AI draft awaiting contractor confirm
    confirmed = "confirmed"  # contractor confirmed; ready to project
    published = "published"  # projected into updates(type=quiet)
    closed = "closed"        # auto-closed by a real signal
    dismissed = "dismissed"  # contractor dismissed


class QuietPeriod(Base):
    """One detected silent window on a site (inert until Slice Q fills it)."""

    __tablename__ = "quiet_periods"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_signal_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    gap_days: Mapped[int] = mapped_column(Integer, nullable=False)
    # The SOURCED fact from milestones (curing/inspection-wait). NULL => unknown => abstain.
    phase_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason_source: Mapped[str] = mapped_column(
        String, nullable=False, server_default="schedule"
    )
    next_expected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # AI Hinglish draft — never shown to the homeowner until contractor-confirmed.
    draft_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    draft_text_hi: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # < 0.6 => force SUGGEST mode (code-enforced in Slice Q).
    confidence: Mapped[Decimal] = mapped_column(
        Numeric(4, 3), nullable=False, server_default="1.000"
    )
    update_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("updates.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[QuietStatus] = mapped_column(
        SAEnum(QuietStatus, name="quiet_status"),
        nullable=False,
        server_default=QuietStatus.open.value,
    )
    confirmed_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        # One live window per site (the sweep's DB-level idempotency invariant).
        Index(
            "uq_quiet_open_per_site",
            "site_id",
            unique=True,
            postgresql_where=text("status IN ('open','suggested','confirmed','published')"),
        ),
        Index("ix_quiet_periods_site_id", "site_id"),
    )
