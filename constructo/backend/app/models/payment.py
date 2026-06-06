"""Phase B payment TRACKING (no payment rail).

Records money movements for visibility/reconciliation only — Constructo never
moves money. `method` is informational text (upi/cash/cheque/bank). An optional
`source_event_id` links a recorded payment back to the SiteEvent (e.g. a
payment_request) it settles.
"""
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PaymentDirection(StrEnum):
    homeowner_to_contractor = "homeowner_to_contractor"
    contractor_to_supplier = "contractor_to_supplier"


class PaymentStatus(StrEnum):
    recorded = "recorded"
    confirmed = "confirmed"
    disputed = "disputed"


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="SET NULL"), nullable=True
    )
    direction: Mapped[PaymentDirection] = mapped_column(
        SAEnum(PaymentDirection, name="payment_direction"), nullable=False
    )
    counterparty_name: Mapped[str] = mapped_column(String, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String, nullable=False, server_default="INR")
    paid_on: Mapped[date] = mapped_column(Date, nullable=False)
    # Informational only: upi/cash/cheque/bank/etc. Constructo does not move money.
    method: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_no: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="payment_status"),
        nullable=False,
        server_default=PaymentStatus.recorded.value,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_event_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("site_events.id", ondelete="SET NULL"), nullable=True
    )
    created_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # Proof-Locked Approval L1 (2.5): an approval physically refuses to commit
    # without bound evidence, stamps who/when, and is reversible-until a window
    # (undo reverts the RECORD — Constructo never moves money).
    approved_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    evidence_event_ids: Mapped[list[UUID]] = mapped_column(
        ARRAY(PgUUID(as_uuid=True)), nullable=False, default=list
    )
    reversible_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
