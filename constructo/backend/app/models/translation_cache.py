"""Content-addressed translation cache (H6.1 contracts-freeze).

A dedup layer for the Slice T (H6.5) render path: re-publishing identical text
is a cache hit even across rows. The unique key is
``(source_table, source_id, source_field, lang)`` — one variant per translatable
field — and a non-unique ``content_hash`` index supports the content-address
lookup (``sha256(canonical + lang + glossary_version + style)``).

``source_id`` carries no FK: it is polymorphic across published_photos / updates
/ weekly_summaries / design_profiles / quiet_periods, following the bare-UUID
precedent in ``homeowner_feed.Change.requested_by``. The H6.5 render path must
tolerate a cache row whose source row was deleted (the content_hash still
validates the variant).
"""
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TranslationCache(Base):
    """One cached translated variant of one field on one source row."""

    __tablename__ = "translation_cache"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    # Which polymorphic source row the canonical lives on.
    source_table: Mapped[str] = mapped_column(String, nullable=False)
    # The source row id — no FK (polymorphic across tables; bare-UUID precedent).
    source_id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), nullable=False)
    # Which field on the row (caption/body/text/phase_reason/…).
    source_field: Mapped[str] = mapped_column(String, nullable=False, server_default="text")
    # Target BCP-47-ish short code ('hi'), matching users.language.
    lang: Mapped[str] = mapped_column(String, nullable=False)
    # sha256(canonical + lang + glossary_version + style) hex — the content-address.
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    canonical: Mapped[str] = mapped_column(Text, nullable=False)
    translated: Mapped[str] = mapped_column(Text, nullable=False)
    engine: Mapped[str] = mapped_column(String, nullable=False)
    # Bump invalidates stale variants.
    glossary_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    style: Mapped[str] = mapped_column(String, nullable=False, server_default="hinglish_warm")
    # Result of the numeric guard; false => never served, falls back to canonical.
    numeric_guard_ok: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="true"
    )
    # Per-variant honest-AI gate (high-stakes needs review).
    approved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    reviewed_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index(
            "uq_translation_cache_key",
            "source_table",
            "source_id",
            "source_field",
            "lang",
            unique=True,
        ),
        Index("ix_translation_cache_content_hash", "content_hash"),
    )
