"""Per-site financial-tracking baseline (W2.6 — display-only money tracking).

One row per site. Holds the owner-maintained contract figures (quotation +
billed) so the web "Financial Tracking" view can show
Quotation -> Billed -> Received -> Outstanding. ``Received`` is NOT stored here
— it is computed at read time from the payments ledger (per-site inflow), and
``Outstanding`` = billed - received. Constructo never moves money; this is
tracking only (no rail).
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SiteFinancials(Base):
    __tablename__ = "site_financials"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("sites.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    # Owner-maintained contract figures (nullable until the owner sets them).
    quotation_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    billed_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String, nullable=False, server_default="INR")
    updated_by: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
