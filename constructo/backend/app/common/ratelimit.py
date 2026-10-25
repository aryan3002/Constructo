"""Small abuse limits for the public auth surface (OTP, login, join, step-up).

Fixed-window counters per key. The default backend is in-process memory, which
is right for production today (one replica, no Redis); ``RATE_LIMIT_BACKEND=
redis`` shares the counters across replicas once there is a Redis.

Two shapes:

- :func:`hit` — count an attempt and refuse once a key goes over its limit
  (per-IP caps, OTP sends, join-code tries).
- :func:`assert_not_locked` + :func:`record_failure` — a lockout that only
  wrong answers feed (e.g. 5 wrong OTPs per phone in 15 minutes).

A refusal is 429 ``rate_limited`` with ``retry_after`` seconds in the body and
a ``Retry-After`` header.
"""
from __future__ import annotations

import math
import time
from functools import cache

from fastapi import Request

from app.common.errors import AppError
from app.config import settings

_PREFIX = "ratelimit:"
_MAX_KEYS = 10_000  # memory backend: prune expired windows past this many keys


class MemoryRateLimitStore:
    def __init__(self) -> None:
        self._buckets: dict[str, list[float]] = {}  # key -> [window_end, count]

    def _bucket(self, key: str, now: float) -> list[float] | None:
        b = self._buckets.get(key)
        if b is not None and now >= b[0]:
            del self._buckets[key]
            return None
        return b

    async def incr(self, key: str, window: int) -> tuple[int, float]:
        now = time.monotonic()
        b = self._bucket(key, now)
        if b is None:
            if len(self._buckets) >= _MAX_KEYS:
                self._prune(now)
            b = self._buckets[key] = [now + window, 0]
        b[1] += 1
        return int(b[1]), b[0] - now

    async def peek(self, key: str) -> tuple[int, float]:
        now = time.monotonic()
        b = self._bucket(key, now)
        return (0, 0.0) if b is None else (int(b[1]), b[0] - now)

    async def reset(self, key: str) -> None:
        self._buckets.pop(key, None)

    def clear(self) -> None:
        self._buckets.clear()

    def _prune(self, now: float) -> None:
        for k in [k for k, b in self._buckets.items() if now >= b[0]]:
            del self._buckets[k]


class RedisRateLimitStore:
    def __init__(self, redis) -> None:
        self._redis = redis

    async def incr(self, key: str, window: int) -> tuple[int, float]:
        k = _PREFIX + key
        count = await self._redis.incr(k)
        if count == 1:
            await self._redis.expire(k, window)
        ttl = await self._redis.ttl(k)
        return int(count), float(max(ttl, 0))

    async def peek(self, key: str) -> tuple[int, float]:
        k = _PREFIX + key
        value = await self._redis.get(k)
        if value is None:
            return 0, 0.0
        return int(value), float(max(await self._redis.ttl(k), 0))

    async def reset(self, key: str) -> None:
        await self._redis.delete(_PREFIX + key)

    def clear(self) -> None:  # pragma: no cover - only the memory store is cleared in tests
        pass


@cache
def get_rate_limit_store():
    if settings.rate_limit_backend == "redis":
        import redis.asyncio as aioredis

        return RedisRateLimitStore(aioredis.from_url(settings.redis_url))
    return MemoryRateLimitStore()


def _refuse(retry_after: float) -> AppError:
    seconds = max(1, math.ceil(retry_after))
    minutes = math.ceil(seconds / 60)
    return AppError(
        429,
        "rate_limited",
        f"Too many attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
        extra={"retry_after": seconds},
        headers={"Retry-After": str(seconds)},
    )


def _window() -> int:
    return settings.rate_limit_window_seconds


async def hit(key: str, limit: int) -> None:
    """Count one attempt for ``key``; 429 once it exceeds ``limit`` in the window."""
    if not settings.rate_limit_enabled:
        return
    count, retry_after = await get_rate_limit_store().incr(key, _window())
    if count > limit:
        raise _refuse(retry_after)


async def assert_not_locked(key: str, limit: int) -> None:
    """429 while ``key`` has ``limit`` or more recorded failures in the window."""
    if not settings.rate_limit_enabled:
        return
    count, retry_after = await get_rate_limit_store().peek(key)
    if count >= limit:
        raise _refuse(retry_after)


async def record_failure(key: str) -> None:
    if settings.rate_limit_enabled:
        await get_rate_limit_store().incr(key, _window())


def client_ip(request: Request) -> str:
    """The caller's IP. Behind a proxy (Azure Container Apps) set
    ``TRUSTED_PROXY_HOPS`` to the number of proxies that append to
    X-Forwarded-For; the client is then that many entries from the right (the
    left part is whatever the client sent and can be forged). 0 ignores the
    header and uses the socket peer."""
    hops = settings.trusted_proxy_hops
    if hops > 0:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            parts = [p.strip() for p in forwarded.split(",") if p.strip()]
            if parts:
                return parts[-hops] if len(parts) >= hops else parts[0]
    return request.client.host if request.client else "unknown"
