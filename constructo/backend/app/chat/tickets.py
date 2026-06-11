"""One-time WebSocket auth tickets (spine A2).

A JWT in a WS query string leaks via proxy/access logs; a 60s single-use ticket
does not. Redis-backed in prod (any replica can consume a ticket issued by
another); in-memory for tests/dev single-process."""
from __future__ import annotations

import time
from functools import cache
from uuid import uuid4

_TTL_SECONDS = 60
_PREFIX = "wsticket:"


class InMemoryTicketStore:
    def __init__(self, ttl_seconds: int = _TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._tickets: dict[str, tuple[str, float]] = {}

    async def issue(self, user_id: str) -> str:
        ticket = uuid4().hex
        self._tickets[ticket] = (user_id, time.monotonic() + self._ttl)
        return ticket

    async def consume(self, ticket: str) -> str | None:
        entry = self._tickets.pop(ticket, None)
        if entry is None:
            return None
        user_id, expires = entry
        return user_id if time.monotonic() < expires else None


class RedisTicketStore:
    def __init__(self, redis, ttl_seconds: int = _TTL_SECONDS) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    async def issue(self, user_id: str) -> str:
        ticket = uuid4().hex
        await self._redis.set(f"{_PREFIX}{ticket}", user_id, ex=self._ttl)
        return ticket

    async def consume(self, ticket: str) -> str | None:
        # GETDEL: atomic single-use across replicas.
        value = await self._redis.getdel(f"{_PREFIX}{ticket}")
        if value is None:
            return None
        return value.decode() if isinstance(value, bytes) else str(value)


@cache
def get_ticket_store():
    from app.config import settings

    if settings.chat_realtime == "redis":
        import redis.asyncio as aioredis

        return RedisTicketStore(aioredis.from_url(settings.redis_url))
    return InMemoryTicketStore()
