from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RawMessageModel(Base):
    __tablename__ = "raw_messages"
    __table_args__ = (
        Index(
            "uq_raw_provider_message",
            "source",
            "provider_message_id",
            unique=True,
            postgresql_where=text("provider_message_id IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    source: Mapped[str] = mapped_column(String, nullable=False)
    external_group_id: Mapped[str] = mapped_column(String, nullable=False)
    sender_id: Mapped[str] = mapped_column(String, nullable=False)
    sender_name: Mapped[str | None] = mapped_column(String, nullable=True)
    media_type: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_url: Mapped[str | None] = mapped_column(String, nullable=True)
    media_mime: Mapped[str | None] = mapped_column(String, nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    raw: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Extraction lifecycle (spine A7): pending → processing → done|failed|skipped.
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Provider-assigned id (Cloud API message id) — webhook re-deliveries dedupe here.
    provider_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
