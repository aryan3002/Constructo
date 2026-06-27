"""Persisted proactive-intelligence findings.

Risks were historically ephemeral (computed each brief, embedded in
``owner_briefs.payload``). The proactive engine persists them as first-class,
dedupable, acknowledgeable rows so the Site Health dashboard and the homeowner
heads-up surface can read, filter, and track them over time.

``finding_type`` / ``severity`` / ``status`` are plain strings (mirroring
``site_events.event_type``) — no DB enum, so adding a detector never needs a
migration. ``dedupe_key`` (``finding_type:phase``) is what keeps a recurring
condition one row instead of a nightly pile-up.
"""
from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# Allowed values (documented, not DB-enforced — see module docstring).
SEVERITIES = ("low", "medium", "high", "critical")
STATUSES = ("open", "acknowledged", "resolved")


class SiteFinding(Base):
    __tablename__ = "site_findings"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    finding_type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="open")
    headline: Mapped[str] = mapped_column(Text, nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")
    phase: Mapped[str | None] = mapped_column(String, nullable=True)
    # Stable identity for a recurring condition: f"{finding_type}:{phase or '-'}".
    dedupe_key: Mapped[str] = mapped_column(String, nullable=False)
    # Evidence handles as strings — heterogeneous (site_event UUIDs, milestone
    # ids), stored as a JSONB list so a finding can point at any source.
    evidence: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    detected_on: Mapped[date] = mapped_column(Date, nullable=False)
    resolved_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
