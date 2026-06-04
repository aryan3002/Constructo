from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CompanyBilling(Base):
    """Per-company billing/subscription TRACKING (W4.8).

    Tracking-only — no payment rail, no charges processed here. One row per
    company (lazily created on first PUT); just records what the company tells us
    about its plan and where invoices should go.
    """

    __tablename__ = "company_billing"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    plan: Mapped[str | None] = mapped_column(String, nullable=True)
    billing_email: Mapped[str | None] = mapped_column(String, nullable=True)
    billing_contact: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
