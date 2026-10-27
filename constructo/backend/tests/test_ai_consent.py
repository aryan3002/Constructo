"""One-time AI consent (S7): the flag, the endpoint and the migration."""
import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.auth.jwt import create_access_token
from app.config import settings
from app.models import UserRole

BACKEND = Path(__file__).resolve().parents[1]


def _auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_me_reports_no_consent_until_agreed(client, factory, db_session):
    user = await factory.user(role=UserRole.supervisor)
    await db_session.commit()

    me = await client.get("/api/v1/auth/me", headers=_auth(user))
    assert me.status_code == 200
    assert me.json()["ai_consent_at"] is None

    agreed = await client.post("/api/v1/users/me/ai-consent", headers=_auth(user))
    assert agreed.status_code == 200, agreed.text
    stamp = agreed.json()["ai_consent_at"]
    assert stamp is not None
    assert agreed.json()["id"] == str(user.id)

    me = await client.get("/api/v1/auth/me", headers=_auth(user))
    assert me.json()["ai_consent_at"] == stamp


async def test_consent_is_recorded_once(client, factory, db_session):
    user = await factory.user(role=UserRole.homeowner)
    await db_session.commit()

    first = await client.post("/api/v1/users/me/ai-consent", headers=_auth(user))
    second = await client.post("/api/v1/users/me/ai-consent", headers=_auth(user))
    assert first.status_code == second.status_code == 200
    # The first agreement's time is kept.
    assert second.json()["ai_consent_at"] == first.json()["ai_consent_at"]


async def test_consent_needs_a_login(client):
    resp = await client.post("/api/v1/users/me/ai-consent")
    assert resp.status_code == 401


async def test_consent_is_per_person(client, factory, db_session):
    company = await factory.company()
    a = await factory.user(company=company, role=UserRole.owner)
    b = await factory.user(company=company, role=UserRole.pm)
    await db_session.commit()

    await client.post("/api/v1/users/me/ai-consent", headers=_auth(a))
    me_b = await client.get("/api/v1/auth/me", headers=_auth(b))
    assert me_b.json()["ai_consent_at"] is None


def _alembic(db_url: str, *args: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND,
        env={**os.environ, "DATABASE_URL": db_url},
        check=True,
        capture_output=True,
    )


async def test_migration_adds_and_drops_the_column():
    base, _, name = settings.database_url.rpartition("/")
    scratch = f"{name}_migration_ai_consent"
    admin = create_async_engine(f"{base}/postgres", isolation_level="AUTOCOMMIT")
    async with admin.connect() as conn:
        await conn.execute(text(f'DROP DATABASE IF EXISTS "{scratch}"'))
        await conn.execute(text(f'CREATE DATABASE "{scratch}"'))
    url = f"{base}/{scratch}"

    async def has_column() -> bool:
        engine = create_async_engine(url)
        async with engine.connect() as conn:
            found = await conn.scalar(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name = 'users' AND column_name = 'ai_consent_at'"
                )
            )
        await engine.dispose()
        return bool(found)

    try:
        _alembic(url, "upgrade", "e8f9a0b1c2d3")
        assert await has_column()
        _alembic(url, "downgrade", "-1")
        assert not await has_column()
        _alembic(url, "upgrade", "head")
        assert await has_column()
    finally:
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{scratch}"'))
        await admin.dispose()
