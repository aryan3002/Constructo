"""Phase B government approvals & permitting lifecycle.

Tracks a permit/NOC through its authority workflow. Expiry/renewal alerting is
computed by a feature agent off `expiry_on`/`expected_on`; this table only stores
the lifecycle state.
"""
from datetime import date, datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PermitStatus(StrEnum):
    not_started = "not_started"
    applied = "applied"
    under_review = "under_review"
    approved = "approved"
    rejected = "rejected"
    expired = "expired"


class Permit(Base):
    __tablename__ = "permits"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    # e.g. commencement / RERA / NOC-fire / water / electrical / occupancy
    permit_type: Mapped[str] = mapped_column(Text, nullable=False)
    authority: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[PermitStatus] = mapped_column(
        SAEnum(PermitStatus, name="permit_status"),
        nullable=False,
        server_default=PermitStatus.not_started.value,
    )
    applied_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    decided_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    reference_no: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
