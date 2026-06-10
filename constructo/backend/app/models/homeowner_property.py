"""Homeowner-facing property skeleton: Property, Space, Component (H0).

A *property* is the homeowner-facing view of an internal ``sites`` row — the
build the homeowner watches. *Spaces* are its hierarchy (floor → room → zone);
*components* are the minimal per-room work items (V1.1 granularity, deliberately
coarse). All three are curated by the contractor (the publisher) and read by the
homeowner app; the homeowner never edits them.
"""
from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SpaceKind(StrEnum):
    floor = "floor"
    room = "room"
    zone = "zone"


class ComponentStatus(StrEnum):
    not_started = "not_started"
    in_progress = "in_progress"
    done = "done"


class Property(Base):
    """The homeowner-facing view of a site (the build they see)."""

    __tablename__ = "properties"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    display_name: Mapped[str] = mapped_column(String, nullable=False)
    type: Mapped[str | None] = mapped_column(String, nullable=True)  # villa / apartment / ...
    status: Mapped[str | None] = mapped_column(String, nullable=True)  # planning / building / ...
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_handover_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Space(Base):
    """A node in the property skeleton (floor/room/zone), optionally nested."""

    __tablename__ = "spaces"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[SpaceKind] = mapped_column(SAEnum(SpaceKind, name="space_kind"), nullable=False)
    # Display order within siblings. Reserved word; column is explicitly quoted.
    order: Mapped[int] = mapped_column("order", Integer, nullable=False, server_default="0")


class Component(Base):
    """A minimal per-space work item (kept coarse for V1.1)."""

    __tablename__ = "components"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    space_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[ComponentStatus] = mapped_column(
        SAEnum(ComponentStatus, name="component_status"),
        nullable=False,
        server_default=ComponentStatus.not_started.value,
    )
    location: Mapped[str | None] = mapped_column(String, nullable=True)  # wall / sub-location
    assignee_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    progress_pct: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
