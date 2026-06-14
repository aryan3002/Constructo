"""The published homeowner feed: PublishedPhoto, Update, WeeklySummary,
Milestone, Change (H0).

Everything here is *curated by the contractor* (the publisher) and read-only to
the homeowner. Raw ops (``site_events``, headcounts, vendor bills) never reach
the homeowner — only what the contractor explicitly publishes into these tables.
"""
from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class UpdateType(StrEnum):
    progress = "progress"
    milestone = "milestone"
    decision_needed = "decision_needed"
    delay = "delay"
    change = "change"
    quiet = "quiet"  # "nothing visible today, here's why" — the anti-silence card


class MilestoneStatus(StrEnum):
    upcoming = "upcoming"
    now = "now"
    done = "done"


class Milestone(Base):
    """A headline phase of the build (foundation, slab, handover, …)."""

    __tablename__ = "milestones"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[MilestoneStatus] = mapped_column(
        SAEnum(MilestoneStatus, name="milestone_status"),
        nullable=False,
        server_default=MilestoneStatus.upcoming.value,
    )
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    completed_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    order: Mapped[int] = mapped_column("order", Integer, nullable=False, server_default="0")


class PublishedPhoto(Base):
    """A curated, homeowner-visible photo (optionally promoted from a SiteEvent)."""

    __tablename__ = "published_photos"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    source_event_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("site_events.id", ondelete="SET NULL"), nullable=True
    )
    image_url: Mapped[str] = mapped_column(String, nullable=False)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    room_tag: Mapped[str | None] = mapped_column(String, nullable=True)
    milestone_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("milestones.id", ondelete="SET NULL"), nullable=True
    )
    is_starred: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    published_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Update(Base):
    """A timeline card in Project Updates (one of six types)."""

    __tablename__ = "updates"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[UpdateType] = mapped_column(
        SAEnum(UpdateType, name="update_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Structured delay story (Calm Cockpit §5/§8). Only ``type=delay`` rows set
    # these; they are nullable at the DB level so the other five update types (and
    # legacy delay rows) stay backward-safe. The publish API enforces that a new
    # delay always carries revised_date + reason + at least one impact, so the
    # homeowner UI never has to fabricate the story to render the red treatment.
    revised_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    impact_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Rupees (mirrors Change.cost_delta) — the mobile client formats lakh/crore.
    impact_cost_delta: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class WeeklySummary(Base):
    """The flagship weekly digest card (AI-drafted, contractor-approved)."""

    __tablename__ = "weekly_summaries"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    published_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Change(Base):
    """A scope/cost/schedule change in the running changes log."""

    __tablename__ = "changes"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    cost_delta: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    schedule_delta_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Bare UUIDs (no FK): requester may be a homeowner; approver is the owner.
    requested_by: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    approved_by: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PhotoComment(Base):
    """A homeowner comment on a published feed photo (threaded conversation).

    The author's name/role are SNAPSHOTTED at write time so the thread stays
    readable even if the member is later removed ("who said it" is part of the
    homeowner contract).
    """

    __tablename__ = "photo_comments"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    photo_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("published_photos.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The author's member row (SET NULL if removed later); name/role snapshotted.
    member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("homeowner_members.id", ondelete="SET NULL"),
        nullable=True,
    )
    author_name: Mapped[str | None] = mapped_column(String, nullable=True)
    author_role: Mapped[str | None] = mapped_column(String, nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HomeownerNotification(Base):
    """An in-app notification record (the inbox/bell feed). Created alongside the
    push in ``app.push.sender.notify_site_homeowners`` — one per site event,
    shown to every member. Per-member read state is tracked by a ``last_seen_at``
    timestamp in the member's ``notif_prefs`` (no per-row join needed)."""

    __tablename__ = "homeowner_notifications"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # 'photo' | 'request' | 'update' | 'weekly_summary' | None.
    type: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # The push `data` blob (carries ids for deep-linking), stored verbatim.
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
