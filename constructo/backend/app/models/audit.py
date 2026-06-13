"""Audit package — AI-assisted site quality inspection (Labs).

An owner requests a quality audit of a site; a site engineer inspects; the
result is a scored report with work-sections and actionable findings. All
numeric scores are computed deterministically in Python from counts/inputs —
NEVER produced by an LLM (Determinism Doctrine). The LLM may only draft prose
(a one-line finding note when none exists).
"""
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class AuditStatus(StrEnum):
    requested = "requested"
    in_progress = "in_progress"
    completed = "completed"


class FindingSeverity(StrEnum):
    critical = "critical"
    major = "major"
    minor = "minor"


class FindingStatus(StrEnum):
    open = "open"
    assigned = "assigned"
    resolved = "resolved"


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[AuditStatus] = mapped_column(
        SAEnum(AuditStatus, name="audit_status"),
        nullable=False,
        server_default=AuditStatus.requested.value,
    )
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0–100, null until done
    requested_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    conducted_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    scheduled_for: Mapped[str | None] = mapped_column(String, nullable=True)  # "today"|"this_week"
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    conducted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AuditSection(Base):
    __tablename__ = "audit_sections"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    audit_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("audits.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pass_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    obs_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    fail_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # list of {"label": str, "status": "ok"|"obs"|"fail"}
    items: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)


class AuditFinding(Base):
    __tablename__ = "audit_findings"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    audit_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("audits.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[FindingSeverity] = mapped_column(
        SAEnum(FindingSeverity, name="finding_severity"), nullable=False
    )
    room: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[FindingStatus] = mapped_column(
        SAEnum(FindingStatus, name="finding_status"),
        nullable=False,
        server_default=FindingStatus.open.value,
    )
    assignee_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
