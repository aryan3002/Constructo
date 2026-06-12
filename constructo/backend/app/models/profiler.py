"""Design Profiler engine tables — moodboard inputs -> deterministic taste -> brief.

Additive: new cohesive `profiler_*` tables. The thin existing `design_*` tables
(design_fingerprint) are left untouched and reconciled in a later sub-project.
Models are FK-only (no relationship()), matching the rest of app/models.
"""
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
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


class ProfileScope(StrEnum):
    whole_house = "whole_house"
    rooms = "rooms"
    elements = "elements"


class ProfileStatus(StrEnum):
    not_started = "not_started"
    intake_started = "intake_started"
    collecting_inputs = "collecting_inputs"
    ranking = "ranking"
    ai_interpreting = "ai_interpreting"
    needs_clarification = "needs_clarification"
    theme_suggested = "theme_suggested"
    homeowner_review = "homeowner_review"
    revision_requested = "revision_requested"
    architect_review = "architect_review"
    contractor_brief_ready = "contractor_brief_ready"
    approved = "approved"
    locked = "locked"


class AreaKind(StrEnum):
    house_build = "house_build"
    interior = "interior"
    element = "element"


class AreaStatus(StrEnum):
    not_started = "not_started"
    in_progress = "in_progress"
    ready = "ready"


class ContributorRole(StrEnum):
    owner = "owner"
    co_owner = "co_owner"
    family = "family"
    advisor = "advisor"
    architect = "architect"


class ReferenceSource(StrEnum):
    upload = "upload"
    camera = "camera"
    pinterest_link = "pinterest_link"
    pinterest_oauth = "pinterest_oauth"
    preset = "preset"


class ConsistencyStatus(StrEnum):
    consistent = "consistent"
    tension = "tension"
    conflict = "conflict"


class ProfilerProfile(Base):
    __tablename__ = "profiler_profiles"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    scope_type: Mapped[ProfileScope] = mapped_column(
        SAEnum(ProfileScope, name="profiler_scope"),
        nullable=False,
        server_default=ProfileScope.whole_house.value,
    )
    status: Mapped[ProfileStatus] = mapped_column(
        SAEnum(ProfileStatus, name="profiler_status"),
        nullable=False,
        server_default=ProfileStatus.not_started.value,
    )
    created_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProfilerArea(Base):
    __tablename__ = "profiler_areas"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    area_kind: Mapped[AreaKind] = mapped_column(
        SAEnum(AreaKind, name="profiler_area_kind"), nullable=False
    )
    area_key: Mapped[str] = mapped_column(String(64), nullable=False)
    space_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="SET NULL"), nullable=True
    )
    component_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("components.id", ondelete="SET NULL"), nullable=True
    )
    recommended_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="6")
    status: Mapped[AreaStatus] = mapped_column(
        SAEnum(AreaStatus, name="profiler_area_status"),
        nullable=False,
        server_default=AreaStatus.not_started.value,
    )
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, server_default="0")
    has_conflict: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    taste_model: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProfilerContributor(Base):
    __tablename__ = "profiler_contributors"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("homeowner_members.id", ondelete="SET NULL"), nullable=True
    )
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    role: Mapped[ContributorRole] = mapped_column(
        SAEnum(ContributorRole, name="profiler_contributor_role"), nullable=False
    )
    is_decision_owner: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProfilerReference(Base):
    __tablename__ = "profiler_references"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    profile_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_profiles.id", ondelete="CASCADE"), nullable=False
    )
    area_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("profiler_areas.id", ondelete="CASCADE"), nullable=False
    )
    contributor_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("profiler_contributors.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_type: Mapped[ReferenceSource] = mapped_column(
        SAEnum(ReferenceSource, name="profiler_reference_source"), nullable=False
    )
    image_r2_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    preset_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    consistency_status: Mapped[ConsistencyStatus | None] = mapped_column(
        SAEnum(ConsistencyStatus, name="profiler_consistency_status"), nullable=True
    )
    consistency_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ProfilerRanking(Base):
    __tablename__ = "profiler_rankings"
    __table_args__ = (
        UniqueConstraint(
            "reference_id", "contributor_id", name="uq_profiler_ranking_ref_contributor"
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    reference_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("profiler_references.id", ondelete="CASCADE"),
        nullable=False,
    )
    contributor_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("profiler_contributors.id", ondelete="CASCADE"),
        nullable=False,
    )
    stars: Mapped[int] = mapped_column(Integer, nullable=False)
    tags: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default='{"positive": [], "negative": []}'
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class ProfilerReferenceAttributes(Base):
    __tablename__ = "profiler_reference_attributes"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    reference_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("profiler_references.id", ondelete="CASCADE"),
        nullable=False,
    )
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, server_default="0")
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
