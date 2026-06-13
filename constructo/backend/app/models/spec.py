from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SpecApprovalStatus(StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Spec(Base):
    """One row of the Material Specification Schedule: a material instance bound
    to a specific component/wall. AI may propose; a human commits. Costing is
    summed deterministically from these rows — never produced by an LLM.
    """

    __tablename__ = "specs"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    component_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("components.id", ondelete="CASCADE"), nullable=False
    )
    material_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("materials.id", ondelete="SET NULL"), nullable=True
    )
    label: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "Laminate-1", "Louvers"
    qty: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    unit: Mapped[str | None] = mapped_column(String, nullable=True)
    wastage_pct: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    unit_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)  # rupees/unit
    approval_status: Mapped[SpecApprovalStatus] = mapped_column(
        SAEnum(SpecApprovalStatus, name="spec_approval_status"),
        nullable=False,
        server_default=SpecApprovalStatus.pending.value,
    )
    client_final_code: Mapped[str | None] = mapped_column(String, nullable=True)
    assignee_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Designer routing (the architect's selection lifecycle). ``approval_status``
    # stays the owner/architect's decision (pending/approved/rejected); these two
    # stamps add the *route* on top so the read side can derive a single state:
    # draft → out-for-approval (sent_at) → approved → released (released_at), with
    # rejected surfacing as "returned — revise". Both nullable; never break the
    # plain approval flow the owner's Specs schedule already uses.
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
