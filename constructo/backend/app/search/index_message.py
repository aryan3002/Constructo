"""Indexing: embed a chat message's text and upsert into ``message_embeddings``.

Mirrors ``index_event`` — idempotent on ``chat_message_id``. Only text-bearing
messages are embedded (an attachment-only / empty message has nothing to index).
"""
from __future__ import annotations

from uuid import UUID

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
