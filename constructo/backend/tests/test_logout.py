"""Sign-out ends the token on the server (revoked_tokens)."""
from datetime import UTC, datetime, timedelta

import jwt as pyjwt
from sqlalchemy import select

from app.auth.jwt import create_access_token, decode_token
from app.config import settings
from app.models import RevokedToken, UserRole


def _h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_access_tokens_carry_a_unique_jti():
    a = decode_token(create_access_token("u", "owner"))
    b = decode_token(create_access_token("u", "owner"))
    assert a["jti"] and b["jti"] and a["jti"] != b["jti"]


async def test_logout_revokes_only_the_presented_token(client, factory, db_session):
    user = await factory.user(role=UserRole.owner)
    await db_session.commit()
    t1 = create_access_token(str(user.id), "owner")
    t2 = create_access_token(str(user.id), "owner")  # another device

    assert (await client.post("/api/v1/auth/logout", headers=_h(t1))).status_code == 204
    gone = await client.get("/api/v1/auth/me", headers=_h(t1))
    assert gone.status_code == 401
    assert gone.json()["error"]["code"] == "invalid_token"
    assert (await client.get("/api/v1/auth/me", headers=_h(t2))).status_code == 200
    # Idempotent.
    assert (await client.post("/api/v1/auth/logout", headers=_h(t1))).status_code == 204


async def test_pre_jti_tokens_keep_working_until_they_expire(client, factory, db_session):
    user = await factory.user(role=UserRole.owner)
    await db_session.commit()
    now = datetime.now(UTC)
    legacy = pyjwt.encode(
        {"sub": str(user.id), "role": "owner", "iat": now, "exp": now + timedelta(hours=1)},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )
    assert (await client.get("/api/v1/auth/me", headers=_h(legacy))).status_code == 200
    assert (await client.post("/api/v1/auth/logout", headers=_h(legacy))).status_code == 204
    assert (await client.get("/api/v1/auth/me", headers=_h(legacy))).status_code == 200


async def test_logout_needs_a_valid_token(client):
    assert (await client.post("/api/v1/auth/logout")).status_code == 401
    bad = await client.post("/api/v1/auth/logout", headers=_h("not-a-jwt"))
    assert bad.status_code == 401


async def test_logout_purges_expired_revocations(client, factory, db_session):
    db_session.add(RevokedToken(jti="old", expires_at=datetime.now(UTC) - timedelta(days=1)))
    user = await factory.user(role=UserRole.owner)
    await db_session.commit()
    token = create_access_token(str(user.id), "owner")
    await client.post("/api/v1/auth/logout", headers=_h(token))
    jtis = set((await db_session.execute(select(RevokedToken.jti))).scalars().all())
    assert "old" not in jtis
    assert decode_token(token)["jti"] in jtis
