"""Wave 1 ORM additions for the Sites module.

Wave 0 froze the core models and `app/auth/scoping.py`, which returns [] for
supervisors because no user<->site assignment table existed yet. This table is
that assignment table; the sites router combines it with `visible_site_ids` to
compute effective visibility for non owner/pm roles without touching frozen code.
"""
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SiteAssignment(Base):
    __tablename__ = "site_assignments"
    __table_args__ = (
        UniqueConstraint("site_id", "user_id", name="uq_site_assignment_site_user"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
