"""Redis/RQ queue wiring for the extraction pipeline.

The ingest endpoint enqueues an extraction job per stored ``RawMessageModel``.
RQ workers are synchronous, so we expose a small sync wrapper
(:func:`run_handle_ingested`) that drives the async
:func:`app.extraction.worker.handle_ingested` via ``asyncio.run``.

Resilience: :func:`enqueue_extraction` never raises into the request path. If
Redis is unavailable it logs a warning and returns ``None`` (the RawMessage row
is already committed, so the message is not lost — it can be re-driven later).

Local/test mode: when ``settings.extraction_sync`` is true, extraction runs
inline instead of being enqueued, so neither tests nor a quick local loop need a
live worker process.
"""
from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from rq import Retry

from app.config import settings

logger = logging.getLogger(__name__)

_redis_conn = None
_queue = None


def get_redis():
    """Return a lazily-created, cached Redis connection."""
    global _redis_conn
    if _redis_conn is None:
        from redis import Redis

        _redis_conn = Redis.from_url(settings.redis_url)
    return _redis_conn


def get_queue():
    """Return a lazily-created, cached RQ queue bound to the Redis connection."""
    global _queue
    if _queue is None:
        from rq import Queue

        _queue = Queue(settings.extraction_queue, connection=get_redis())
    return _queue


def run_handle_ingested(raw_message_id: str) -> list[str]:
    """Sync entry point an RQ worker runs for one ingested message.

    RQ serializes args; the id arrives as a string. We coerce it back to a
    ``UUID`` and drive the async worker to completion on a fresh event loop.
    """
    from app.extraction.worker import handle_ingested

    ids = asyncio.run(handle_ingested(UUID(str(raw_message_id))))
    return [str(i) for i in ids]


async def enqueue_extraction(raw_message_id: UUID) -> None:
    """Enqueue (or, in sync mode, run inline) extraction for one raw message.

    Never raises into the caller: Redis being down must not 500 an ingest whose
    row is already persisted.
    """
    if settings.extraction_sync:
        # Inline mode (tests / local without a worker). Run the async worker
        # directly in the current loop so it shares no Redis dependency.
        from app.extraction.worker import handle_ingested

        try:
            await handle_ingested(raw_message_id)
        except Exception:
            logger.exception("enqueue_extraction(sync): extraction failed for %s", raw_message_id)
        return None

    try:
        queue = get_queue()
        queue.enqueue(
            run_handle_ingested,
            str(raw_message_id),
            retry=Retry(max=3, interval=[10, 60, 300]),
        )
    except Exception:
        # Redis unreachable / RQ error: log and move on. The row is stored.
        logger.warning(
            "enqueue_extraction: could not enqueue %s (Redis unavailable?); "
            "row stored, extraction skipped",
            raw_message_id,
            exc_info=True,
        )
    return None
