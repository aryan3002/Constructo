"""Abuse limits on the public auth surface (app.common.ratelimit)."""
from datetime import UTC, datetime, timedelta

import pytest
from starlette.requests import Request

from app.common import ratelimit
from app.common.errors import AppError
from app.config import settings
from app.models import HomeownerMember, HomeownerSubRole, UserRole


def _req(peer: str = "203.0.113.9", xff: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff else []
    return Request({"type": "http", "headers": headers, "client": (peer, 1234)})


# ---- the store + client IP --------------------------------------------------


async def test_memory_store_counts_and_expires():
    store = ratelimit.MemoryRateLimitStore()
    assert (await store.incr("k", 60))[0] == 1
    count, retry = await store.incr("k", 60)
    assert count == 2 and 0 < retry <= 60
    assert (await store.peek("k"))[0] == 2
    store._buckets["k"][0] = 0  # window over
    assert (await store.peek("k"))[0] == 0
    assert (await store.incr("k", 60))[0] == 1


async def test_hit_refuses_over_the_limit_with_retry_after():
    for _ in range(3):
        await ratelimit.hit("t:hit", 3)
    with pytest.raises(AppError) as exc:
        await ratelimit.hit("t:hit", 3)
    err = exc.value
    assert err.status_code == 429 and err.code == "rate_limited"
    assert err.extra["retry_after"] > 0
    assert err.headers["Retry-After"] == str(err.extra["retry_after"])


async def test_disabled_limiter_never_refuses(monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_enabled", False)
    for _ in range(10):
        await ratelimit.hit("t:off", 1)


def test_client_ip_ignores_forwarded_for_unless_trusted(monkeypatch):
    req = _req(xff="1.1.1.1, 198.51.100.7")
    assert ratelimit.client_ip(req) == "203.0.113.9"
    monkeypatch.setattr(settings, "trusted_proxy_hops", 1)
    # One trusted proxy appended the real client last; the left part is forgeable.
    assert ratelimit.client_ip(req) == "198.51.100.7"
    assert ratelimit.client_ip(_req()) == "203.0.113.9"


# ---- the endpoints ------------------------------------------------------------


@pytest.fixture
def tight(monkeypatch):
    for name, value in {
        "rate_limit_otp_per_phone": 3,
        "rate_limit_otp_per_ip": 5,
        "rate_limit_login_failures": 5,
        "rate_limit_login_per_ip": 100,
        "rate_limit_join_per_ip": 4,
        "rate_limit_join_per_code": 3,
    }.items():
        monkeypatch.setattr(settings, name, value)


async def test_request_otp_limited_per_phone_and_ip(client, tight):
    for _ in range(3):
        ok = await client.post("/api/v1/auth/request-otp", json={"phone": "9810000001"})
        assert ok.status_code == 200
    # Same phone in another format shares the counter.
    over = await client.post("/api/v1/auth/request-otp", json={"phone": "+919810000001"})
    assert over.status_code == 429
    assert over.json()["error"]["code"] == "rate_limited"
    assert int(over.headers["Retry-After"]) > 0
    # Other phones from the same IP until the per-IP cap (5 counted so far: 4).
    assert (
        await client.post("/api/v1/auth/request-otp", json={"phone": "9810000002"})
    ).status_code == 200
    assert (
        await client.post("/api/v1/auth/request-otp", json={"phone": "9810000003"})
    ).status_code == 429


async def test_login_locks_a_phone_after_five_wrong_codes(client, factory, db_session, tight):
    company = await factory.company()
    await factory.user(company=company, role=UserRole.owner, phone="+919810000010")
    await db_session.commit()
    for _ in range(5):
        r = await client.post(
            "/api/v1/auth/login", json={"phone": "+919810000010", "otp": "111111"}
        )
        assert r.status_code == 401
    locked = await client.post(
        "/api/v1/auth/login", json={"phone": "9810000010", "otp": "000000"}
    )
    assert locked.status_code == 429  # even the right code waits out the lockout
    assert locked.json()["error"]["retry_after"] > 0
    # Another phone is unaffected.
    other = await client.post(
        "/api/v1/auth/login",
        json={"phone": "+919810000011", "otp": "000000", "signup": True},
    )
    assert other.status_code == 200


async def test_login_per_ip_cap(client, monkeypatch):
    monkeypatch.setattr(settings, "rate_limit_login_per_ip", 2)
    for i in range(2):
        r = await client.post("/api/v1/auth/login", json={"phone": f"981000002{i}", "otp": "1"})
        assert r.status_code == 401
    r = await client.post("/api/v1/auth/login", json={"phone": "9810000029", "otp": "1"})
    assert r.status_code == 429


async def test_step_up_otp_endpoints_are_limited(client, factory, db_session, tight):
    from app.auth.jwt import create_access_token

    user = await factory.user(role=UserRole.owner)
    await db_session.commit()
    h = {"Authorization": f"Bearer {create_access_token(str(user.id), 'owner')}"}
    for _ in range(3):
        assert (await client.post("/api/v1/auth/step-up/request-otp", headers=h)).status_code == 200
    assert (await client.post("/api/v1/auth/step-up/request-otp", headers=h)).status_code == 429
    for _ in range(5):
        r = await client.post("/api/v1/auth/step-up/verify", json={"otp": "9"}, headers=h)
        assert r.status_code == 401
    r = await client.post("/api/v1/auth/step-up/verify", json={"otp": "000000"}, headers=h)
    assert r.status_code == 429


async def _member(factory, db_session, phone=None, age_days=0) -> HomeownerMember:
    company = await factory.company()
    site = await factory.site(company)
    m = HomeownerMember(site_id=site.id, sub_role=HomeownerSubRole.primary_owner, phone=phone)
    db_session.add(m)
    await db_session.flush()
    if age_days:
        m.created_at = datetime.now(UTC) - timedelta(days=age_days)
        await db_session.flush()
    await db_session.commit()
    return m


async def test_join_limited_per_code_and_ip(client, factory, db_session, tight):
    m = await _member(factory, db_session)
    for _ in range(3):
        r = await client.post(
            "/api/v1/homeowner/join",
            json={"join_code": m.join_code, "phone": "+919810000040", "otp": "1"},
        )
        assert r.status_code == 401
    r = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": m.join_code, "phone": "+919810000040", "otp": "000000"},
    )
    assert r.status_code == 429
    # Per IP: a 5th try with any code is refused (4 per IP).
    r = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": "NOPE-NOPE", "phone": "+919810000041", "otp": "000000"},
    )
    assert r.status_code == 429


async def test_phoneless_join_code_expires_after_14_days(client, factory, db_session):
    stale = await _member(factory, db_session, age_days=15)
    r = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": stale.join_code, "phone": "+919810000050", "otp": "000000"},
    )
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "code_expired"

    fresh = await _member(factory, db_session, age_days=13)
    r = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": fresh.join_code, "phone": "+919810000051", "otp": "000000"},
    )
    assert r.status_code == 200, r.text


async def test_phone_bound_join_code_does_not_expire(client, factory, db_session):
    bound = await _member(factory, db_session, phone="+919810000052", age_days=30)
    r = await client.post(
        "/api/v1/homeowner/join",
        json={"join_code": bound.join_code, "phone": "+919810000052", "otp": "000000"},
    )
    assert r.status_code == 200, r.text
