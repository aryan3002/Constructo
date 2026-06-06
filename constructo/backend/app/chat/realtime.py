"""Real-time transport core (2.0 Slice 2) — an in-process pub/sub broadcaster.

The seq-authoritative durable store stays Neon and the REST ``after_seq`` sync
already backfills anything missed; this just pushes new messages *live* so the
thread feels faster than WhatsApp on one bar. The broadcaster here is the tested
core (per-conversation fan-out to subscriber queues); it is in-process, so it
serves a single worker.

PRODUCTION (multi-worker): swap the body of :meth:`publish` / :meth:`subscribe`
for Redis pub/sub on a ``chat:{conversation_id}`` channel — Redis is the
transient bus, Neon stays the ordering authority, and a dropped frame is
recovered by the client's ``after_seq`` refetch. The public interface here is
exactly that seam.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

# A bounded queue per subscriber: a slow client is dropped a frame (it will
# refetch via after_seq) rather than back-pressuring the publisher.
_QUEUE_MAXSIZE = 100


class Broadcaster:
    """Fan-out new chat messages to live subscribers, keyed by conversation."""

    def __init__(self) -> None:
        self._subscribers: dict[UUID, set[asyncio.Queue]] = {}

    def _add(self, conversation_id: UUID) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAXSIZE)
        self._subscribers.setdefault(conversation_id, set()).add(q)
        return q

    def _remove(self, conversation_id: UUID, q: asyncio.Queue) -> None:
        subs = self._subscribers.get(conversation_id)
        if subs is not None:
            subs.discard(q)
            if not subs:
                self._subscribers.pop(conversation_id, None)

    def subscriber_count(self, conversation_id: UUID) -> int:
        return len(self._subscribers.get(conversation_id, ()))

    async def publish(self, conversation_id: UUID, payload: dict) -> None:
        """Push a payload to every live subscriber of a conversation. A full
        subscriber queue is skipped (the client refetches via after_seq)."""
        for q in list(self._subscribers.get(conversation_id, ())):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    @asynccontextmanager
    async def subscribe(self, conversation_id: UUID) -> AsyncIterator[asyncio.Queue]:
        """Subscribe to a conversation for the lifetime of the context."""
        q = self._add(conversation_id)
        try:
            yield q
        finally:
            self._remove(conversation_id, q)


# Process-wide singleton (the WS endpoint and the send path share it).
broadcaster = Broadcaster()
