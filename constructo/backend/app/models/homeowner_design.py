"""Homeowner design artifacts: DesignProfile, DesignReference, DesignSelection (H0).

The *design profile* is the AI-drafted text profile (tone + per-room overrides)
generated from intake selections and references, then confirmed by the
homeowner. *References* are inspiration images (uploaded or pulled from
Pinterest). *Selections* are concrete material/finish choices, optionally scoped
to a space, that the advisor runs a (non-gatekeeping) consistency check over.
"""
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ReferenceSource(StrEnum):
    upload = "upload"
    pinterest = "pinterest"


class DesignProfile(Base):
    """One AI-drafted design profile per site (jsonb: tone + per-room overrides)."""

    __tablename__ = "design_profiles"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    profile: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DesignReference(Base):
    """An inspiration image attached to a site (and optionally a room tag)."""

    __tablename__ = "design_references"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    image_url: Mapped[str] = mapped_column(String, nullable=False)
    room_tag: Mapped[str | None] = mapped_column(String, nullable=True)
    source: Mapped[ReferenceSource] = mapped_column(
        SAEnum(ReferenceSource, name="reference_source"),
        nullable=False,
        server_default=ReferenceSource.upload.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DesignSelection(Base):
    """A concrete material/finish choice, optionally scoped to a space."""

    __tablename__ = "design_selections"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    space_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="SET NULL"), nullable=True
    )
    item: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "living room flooring"
    choice: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "oak engineered wood"
    # Open-ended lifecycle (proposed / selected / approved); kept a string so the
    # homeowner flow can evolve without a migration.
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="proposed")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
