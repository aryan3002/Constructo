"""Indexing: embed a SiteEvent's searchable text and upsert into ``event_embeddings``.

The *searchable document* for an event is a compact natural-language rendering of
its type, summary, and salient structured fields (see :func:`build_document`).
This is what we embed — the metadata filter columns (site_id, occurred_on,
event_type) already live on ``site_events`` and are joined at query time, so they
are NOT re-embedded.

NOT wired into ingestion. The hook point is end of
``app.extraction.worker`` / ``app.ingestion`` after a SiteEvent is persisted:
call ``await index_event(session, event.id)`` (fire-and-forget / on a queue) so
new events become searchable. Backfill existing rows with
:func:`index_all_unindexed`.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import EventEmbedding, SiteEventModel
from app.search.embeddings import EmbeddingsClient, get_embeddings_client

# Human-readable field labels included in the embedded document. Keeping this
# small and stable keeps the document focused on what people actually search for.
_FIELD_LABELS = {
    "material": "material",
    "quantity": "quantity",
    "unit": "unit",
    "vendor": "vendor",
    "headcount": "headcount",
    "amount": "amount",
    "currency": "currency",
    "invoice_number": "invoice",
    "severity": "severity",
    "description": "description",
    "to": "to",
}


def build_document(event: SiteEventModel) -> str:
    """Render the text we embed for an event.

    Format: ``"<event_type>: <summary> | label=value; ..."`` — the event type
    (so "deliveries" matches material_delivery), the plain-language summary, and
    a short tail of salient structured fields. Deterministic ordering keeps
    re-indexing idempotent.
    """
    etype = (event.event_type or "").replace("_", " ")
    parts = [f"{etype}: {event.summary or ''}".strip()]
    fields = event.fields or {}
    tail = []
    for key, label in _FIELD_LABELS.items():
        if key in fields and fields[key] not in (None, "", []):
            tail.append(f"{label}={fields[key]}")
    if tail:
        parts.append(" | " + "; ".join(tail))
    return "".join(parts).strip()


async def index_event(
    session: AsyncSession,
    site_event_id: UUID,
    *,
    client: EmbeddingsClient | None = None,
) -> EventEmbedding | None:
    """Embed one event's document and upsert its row in ``event_embeddings``.

    Returns the persisted/updated row, or ``None`` if the event does not exist.
    Idempotent: re-indexing the same event overwrites its embedding + model
    (unique constraint on ``site_event_id``).
    """
    event = await session.get(SiteEventModel, site_event_id)
    if event is None:
        return None

    client = client or get_embeddings_client()
    document = build_document(event)
    [vector] = await client.embed([document])

    stmt = (
        pg_insert(EventEmbedding)
        .values(
            site_event_id=event.id,
            embedding=vector,
            model=client.model,
        )
        .on_conflict_do_update(
            index_elements=[EventEmbedding.site_event_id],
            set_={"embedding": vector, "model": client.model},
        )
        .returning(EventEmbedding.id)
    )
    result = await session.execute(stmt)
    emb_id = result.scalar_one()
    await session.flush()
    return await session.get(EventEmbedding, emb_id)


async def index_all_unindexed(
    session: AsyncSession,
    *,
    client: EmbeddingsClient | None = None,
    batch_size: int = 100,
) -> int:
    """Backfill: embed every SiteEvent that has no embedding yet.

    Returns the number of events indexed. Processes in batches to bound memory
    and the embedding API payload size. Safe to re-run (only missing rows are
    picked up).
    """
    client = client or get_embeddings_client()
    indexed_subq = select(EventEmbedding.site_event_id)
    stmt = (
        select(SiteEventModel)
        .where(SiteEventModel.id.not_in(indexed_subq))
        .order_by(SiteEventModel.id)
    )
    events = list((await session.execute(stmt)).scalars().all())
    if not events:
        return 0

    total = 0
    for start in range(0, len(events), batch_size):
        batch = events[start : start + batch_size]
        documents = [build_document(e) for e in batch]
        vectors = await client.embed(documents)
        for event, vector in zip(batch, vectors, strict=True):
            stmt = (
                pg_insert(EventEmbedding)
                .values(
                    site_event_id=event.id,
                    embedding=vector,
                    model=client.model,
                )
                .on_conflict_do_update(
                    index_elements=[EventEmbedding.site_event_id],
                    set_={"embedding": vector, "model": client.model},
                )
            )
            await session.execute(stmt)
            total += 1
        await session.flush()
    return total
