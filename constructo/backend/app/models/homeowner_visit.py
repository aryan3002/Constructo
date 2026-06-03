"""Homeowner-uploaded "site visit" photos (R1 — the My-visits tab).

UNLIKE the published feed (``PublishedPhoto``, curated by the contractor), these
are the HOMEOWNER's OWN uploads — private to the household. The bytes live in
object storage (R2) and only the object key is stored here; it is resolved to a
short-lived presigned GET URL at read time (private bucket).
"""
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class HomeownerVisitPhoto(Base):
    __tablename__ = "homeowner_visit_photos"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    # The household member who uploaded it (SET NULL if they're later removed).
    member_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("homeowner_members.id", ondelete="SET NULL"),
        nullable=True,
    )
    storage_key: Mapped[str] = mapped_column(String, nullable=False)
    caption: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
