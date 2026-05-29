"""Phase B semantic-search index support (pgvector).

Stores one embedding per SiteEvent. The table + HNSW vector index are created
here so the schema is stable, but a feature agent owns backfilling/indexing and
the query path — there is NO backfill in the foundation migration.

The `vector` extension must exist in the database (created by migration 0001 and
by the test setup). The embedding dimension (1536) matches OpenAI
text-embedding-3-small; a feature agent may change this in its own migration if
it picks a different model.
"""
from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

EMBEDDING_DIM = 1536


class EventEmbedding(Base):
    __tablename__ = "event_embeddings"
    __table_args__ = (
        # HNSW index supports cosine-distance nearest-neighbour search and builds
        # fine on an empty table (no training pass, unlike ivfflat).
        Index(
            "ix_event_embeddings_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_event_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("site_events.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
