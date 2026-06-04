from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class CompanyNotificationSettings(Base):
    """Per-company notification & SLA preferences (W4.7).

    One row per company (created lazily on first PUT; a missing row means the
    defaults below). ``escalate_overdue`` is honoured by the SLA sweep — a
    company that turns it off keeps its overdue decisions un-escalated.
    ``sla_hours`` is the company's documented target window; ``daily_digest``
    governs the nightly brief.
    """

    __tablename__ = "company_notification_settings"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    sla_hours: Mapped[int] = mapped_column(Integer, nullable=False, server_default="24")
    escalate_overdue: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    daily_digest: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
