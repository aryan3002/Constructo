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
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import cache
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


_CHANNEL_PREFIX = "chat:"


class RedisBroadcaster:
    """Cross-worker fan-out: publish → Redis PUBLISH; one listener task per
    process pumps Redis frames into a local :class:`Broadcaster`. Redis is a
    TRANSIENT bus — a dropped frame is recovered by the client's after_seq
    refetch; Neon stays the ordering authority. Same public interface as
    :class:`Broadcaster` (the documented seam)."""

    def __init__(self, redis, local: Broadcaster | None = None) -> None:
        self._redis = redis
        self._local = local or Broadcaster()
        self._pubsub = None
        self._listener: asyncio.Task | None = None

    async def publish(self, conversation_id: UUID, payload: dict) -> None:
        try:
            await self._redis.publish(
                f"{_CHANNEL_PREFIX}{conversation_id}", json.dumps(payload)
            )
        except Exception:  # pragma: no cover - defensive
            # Redis down: degrade to local-only (correct on one replica); the
            # client resync covers cross-replica gaps.
            await self._local.publish(conversation_id, payload)

    @asynccontextmanager
    async def subscribe(self, conversation_id: UUID) -> AsyncIterator[asyncio.Queue]:
        await self._ensure_listener()
        await self._pubsub.subscribe(f"{_CHANNEL_PREFIX}{conversation_id}")
        try:
            async with self._local.subscribe(conversation_id) as queue:
                yield queue
        finally:
            if self._local.subscriber_count(conversation_id) == 0:
                try:
                    await self._pubsub.unsubscribe(f"{_CHANNEL_PREFIX}{conversation_id}")
                except Exception:  # pragma: no cover - defensive
                    pass

    async def _ensure_listener(self) -> None:
        if self._pubsub is None:
            self._pubsub = self._redis.pubsub()
        if self._listener is None or self._listener.done():
            self._listener = asyncio.create_task(self._listen())

    async def _listen(self) -> None:
        while True:
            try:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
            except asyncio.CancelledError:  # pragma: no cover
                return
            except Exception:  # pragma: no cover - bus hiccup; retry
                await asyncio.sleep(0.5)
                continue
            if message is None or message.get("type") != "message":
                continue
            channel = message["channel"]
            if isinstance(channel, bytes):
                channel = channel.decode()
            try:
                conv_id = UUID(channel.removeprefix(_CHANNEL_PREFIX))
                payload = json.loads(message["data"])
            except (ValueError, TypeError):  # pragma: no cover - malformed frame
                continue
            await self._local.publish(conv_id, payload)

    async def close(self) -> None:
        if self._listener is not None:
            self._listener.cancel()
            try:
                await self._listener
            except (asyncio.CancelledError, Exception):  # pragma: no cover
                pass


@cache
def get_broadcaster():
    """Process-wide broadcaster, selected by settings.chat_realtime."""
    from app.config import settings

    if settings.chat_realtime == "redis":
        import redis.asyncio as aioredis

        return RedisBroadcaster(aioredis.from_url(settings.redis_url))
    # Memory mode reuses the documented process-wide singleton so the WS
    # endpoint, the send path, and direct callers all share one instance.
    return broadcaster


async def shutdown_broadcaster() -> None:
    """Tear down the process broadcaster on app shutdown.

    No-op for the in-memory ``Broadcaster`` (nothing to release) and when no
    broadcaster was ever instantiated. For a ``RedisBroadcaster`` this cancels
    the pub/sub listener task and closes the Redis connection so a restart does
    not leak it. Safe to call unconditionally from the FastAPI lifespan.
    """
    if get_broadcaster.cache_info().currsize == 0:
        return  # never instantiated — don't create one just to close it
    close = getattr(get_broadcaster(), "close", None)
    if close is not None:
        await close()
