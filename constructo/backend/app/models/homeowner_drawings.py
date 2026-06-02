"""Published drawings/plans — the contractor publishes a drawing, the homeowner
reads it (C3).

Mirrors the curated-publish pattern of :mod:`app.models.homeowner_feed`: a
drawing only reaches the homeowner because the contractor (publisher) explicitly
POSTed it. Versions are append-only — a new version of the same sheet points at
the row it replaces via ``supersedes_id`` (self-FK, SET NULL so deleting an old
version never orphans the chain). ``plain_summary_en``/``plain_summary_hi`` are
the homeowner-friendly "what changed" lines (E2 spec); kept nullable so the
read side can surface the raw sheet before a plain-language pass exists.
"""
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DrawingKind(StrEnum):
    plan = "plan"  # floor plan
    elevation = "elevation"
    section = "section"
    structural = "structural"
    electrical = "electrical"
    plumbing = "plumbing"
    other = "other"


class PublishedDrawing(Base):
    """A curated, homeowner-visible drawing/plan sheet (E2 columns).

    Append-only versioning: publishing a revision creates a new row whose
    ``supersedes_id`` points at the prior version. The homeowner read slice can
    therefore show the latest version while the chain stays auditable.
    """

    __tablename__ = "published_drawings"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[str] = mapped_column(String, nullable=False)
    file_url: Mapped[str] = mapped_column(String, nullable=False)
    kind: Mapped[DrawingKind] = mapped_column(
        SAEnum(DrawingKind, name="drawing_kind"),
        nullable=False,
        server_default=DrawingKind.other.value,
    )
    published_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    plain_summary_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    plain_summary_hi: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Self-FK to the version this row replaces; SET NULL so pruning an old
    # version never orphans (or cascade-deletes) its successor.
    supersedes_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("published_drawings.id", ondelete="SET NULL"),
        nullable=True,
    )
