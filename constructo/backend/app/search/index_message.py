"""Indexing: embed a chat message's text and upsert into ``message_embeddings``.

Mirrors ``index_event`` — idempotent on ``chat_message_id``. Only text-bearing
messages are embedded (an attachment-only / empty message has nothing to index).
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, MessageEmbedding
from app.search.embeddings import EmbeddingsClient, get_embeddings_client


async def index_message(
    session: AsyncSession,
    chat_message_id: UUID,
    *,
    client: EmbeddingsClient | None = None,
) -> MessageEmbedding | None:
    """Embed one message's text and upsert its row. Returns the row, or ``None``
    if the message is missing or has no text to embed."""
    msg = await session.get(ChatMessage, chat_message_id)
    if msg is None or not (msg.body and msg.body.strip()):
        return None

    client = client or get_embeddings_client()
    [vector] = await client.embed([msg.body.strip()])

    stmt = (
        pg_insert(MessageEmbedding)
        .values(chat_message_id=msg.id, embedding=vector, model=client.model)
        .on_conflict_do_update(
            index_elements=[MessageEmbedding.chat_message_id],
            set_={"embedding": vector, "model": client.model},
        )
        .returning(MessageEmbedding.id)
    )
    emb_id = (await session.execute(stmt)).scalar_one()
    await session.flush()
    return await session.get(MessageEmbedding, emb_id)


async def index_all_unindexed_messages(
    session: AsyncSession,
    *,
    client: EmbeddingsClient | None = None,
    batch_size: int = 100,
) -> int:
    """Backfill: embed every text-bearing chat message with no embedding yet.

    Makes the historical thread (e.g. WhatsApp-imported chatter) searchable. Safe
    to re-run — only missing rows are picked up. Network-free unless real
    embedding creds are configured (else FakeEmbeddings)."""
    client = client or get_embeddings_client()
    indexed = select(MessageEmbedding.chat_message_id)
    stmt = (
        select(ChatMessage)
        .where(ChatMessage.id.not_in(indexed))
        .where(func.length(func.coalesce(ChatMessage.body, "")) > 0)
        .order_by(ChatMessage.id)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    if not rows:
        return 0
    total = 0
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        vectors = await client.embed([m.body.strip() for m in batch])
        for msg, vector in zip(batch, vectors, strict=True):
            await session.execute(
                pg_insert(MessageEmbedding)
                .values(chat_message_id=msg.id, embedding=vector, model=client.model)
                .on_conflict_do_update(
                    index_elements=[MessageEmbedding.chat_message_id],
                    set_={"embedding": vector, "model": client.model},
                )
            )
            total += 1
        await session.commit()
    return total
