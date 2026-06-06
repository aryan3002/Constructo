"""Vendor Confirm-Loop (Phase 3.8) — the no-install, two-party-verified GRN.

The contractor generates a confirm link for a delivery/invoice; the vendor opens
it with NO app install (the token is the capability) and confirms or disputes the
quantity. A confirmation that the vendor agrees to is a two-party-verified GRN
WhatsApp's siloed chats can't produce — the *wedge half* of the vendor loop.

Deliberately scoped: this is the private, per-contractor confirm loop only. The
cross-contractor reputation ledger is gated (>=3 contractors + GSTIN + DPDP, plan
§7) and is NOT built here. The public view exposes only the quantity claim — no
prices, no rates, no other site data.
"""
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class VendorConfirmStatus(StrEnum):
    pending = "pending"
    confirmed = "confirmed"
    disputed = "disputed"


class VendorConfirmation(Base):
    __tablename__ = "vendor_confirmations"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    # The delivery/invoice event being confirmed (optional — may pre-date capture).
    event_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("site_events.id", ondelete="SET NULL"), nullable=True
    )
    token: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    vendor_name: Mapped[str] = mapped_column(String, nullable=False)
    material: Mapped[str | None] = mapped_column(String, nullable=True)
    claimed_qty: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    claimed_unit: Mapped[str | None] = mapped_column(String, nullable=True)
    delivered_on: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[VendorConfirmStatus] = mapped_column(
        SAEnum(VendorConfirmStatus, name="vendor_confirm_status"),
        nullable=False,
        server_default=VendorConfirmStatus.pending.value,
    )
    response_qty: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    response_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
