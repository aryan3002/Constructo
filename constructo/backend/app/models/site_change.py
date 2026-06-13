"""Site-condition changes — the field → designer feedback loop.

A site engineer (supervisor) reports an as-built condition that diverges from the
design (slab cover missing, a wall out of plumb, an opening narrower than drawn).
It routes to the designer (architect), who reviews it, optionally LINKS it to a
drawing revision that folds the fix in, and RESOLVES it. Append-only-ish: the
status walks new → linked/resolved; the trail is the row's status + timestamps.

Company-scoped; visibility follows the same site-scoping as everything else
(owner/pm/architect see all company sites, the field roles see assigned sites).
``impact`` is a plain design-impact note a human writes — no LLM, no fabricated
scores (Determinism Doctrine).
"""
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class SiteChangeStatus(StrEnum):
    new = "new"  # reported from site, awaiting the designer's review
    linked = "linked"  # folded into a drawing revision (linked_drawing_id)
    resolved = "resolved"  # closed out


class SiteChange(Base):
    __tablename__ = "site_changes"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True
    )
    room: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    # The designer-facing design impact (what it means for the design / a fix).
    impact: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    # Who reported it (the site engineer); null-safe on user delete.
    reported_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[SiteChangeStatus] = mapped_column(
        SAEnum(SiteChangeStatus, name="site_change_status"),
        nullable=False,
        server_default=SiteChangeStatus.new.value,
    )
    # The drawing revision this was folded into, when linked.
    linked_drawing_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("published_drawings.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
