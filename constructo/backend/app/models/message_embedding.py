"""Message RAG index (2.3) — one embedding per chat message.

The chatter/transcript graveyard becomes searchable: "where did we discuss the
slab leak?" retrieves the message, scoped to the caller's visible sites (same
narrow-never-widen + abstain-floor discipline as the event index). Mirrors
``event_embeddings``; a feature backfill owns indexing (no backfill in any
foundation migration). Dimension 1536 matches text-embedding-3-small.
"""
from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.event_embedding import EMBEDDING_DIM


class MessageEmbedding(Base):
    __tablename__ = "message_embeddings"
    __table_args__ = (
        Index(
            "ix_message_embeddings_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    chat_message_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("chat_messages.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
