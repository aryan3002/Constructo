"""Who has a live socket? (spine A6). Push fallback targets the complement.

Redis impl: one counter key per user with a TTL refreshed by the socket
heartbeat — a crashed process leaks at most TTL seconds of 'online'."""
from __future__ import annotations

from functools import cache

_TTL_SECONDS = 90
_PREFIX = "ws:online:"


class InMemoryPresence:
    def __init__(self) -> None:
        self._conns: dict[str, set[str]] = {}

    async def mark_online(self, user_id: str, conn_id: str) -> None:
        self._conns.setdefault(user_id, set()).add(conn_id)

    async def mark_offline(self, user_id: str, conn_id: str) -> None:
        conns = self._conns.get(user_id)
        if conns:
            conns.discard(conn_id)
            if not conns:
                self._conns.pop(user_id, None)

    async def is_online(self, user_id: str) -> bool:
        return bool(self._conns.get(user_id))


class RedisPresence:
    def __init__(self, redis, ttl_seconds: int = _TTL_SECONDS) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    async def mark_online(self, user_id: str, conn_id: str) -> None:
        key = f"{_PREFIX}{user_id}"
        await self._redis.incr(key)
        await self._redis.expire(key, self._ttl)

    async def mark_offline(self, user_id: str, conn_id: str) -> None:
        key = f"{_PREFIX}{user_id}"
        if await self._redis.decr(key) <= 0:
            await self._redis.delete(key)

    async def is_online(self, user_id: str) -> bool:
        value = await self._redis.get(f"{_PREFIX}{user_id}")
        try:
            return int(value or 0) > 0
        except (TypeError, ValueError):
            return False


@cache
def get_presence():
    from app.config import settings

    if settings.chat_realtime == "redis":
        import redis.asyncio as aioredis

        return RedisPresence(aioredis.from_url(settings.redis_url))
    return InMemoryPresence()
