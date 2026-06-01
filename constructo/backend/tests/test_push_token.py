"""Contractor push-token storage (C-F): upsert endpoint + sender resolution."""
import pytest_asyncio
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.models import PushToken, UserRole
from app.push import sender


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def supervisor(factory):
    return await factory.user(role=UserRole.supervisor)


async def test_register_push_token_upserts(client, db_session, supervisor):
    r1 = await client.post(
        "/api/v1/me/push-token",
        json={"token": "ExponentPushToken[abc]", "platform": "android"},
        headers=auth(supervisor),
    )
    assert r1.status_code == 200, r1.text
    assert r1.json()["ok"] is True

    # Re-registering the same token is idempotent — no duplicate row.
    r2 = await client.post(
        "/api/v1/me/push-token",
        json={"token": "ExponentPushToken[abc]", "platform": "ios"},
        headers=auth(supervisor),
    )
    assert r2.status_code == 200

    rows = (
        await db_session.execute(
            select(PushToken).where(PushToken.user_id == supervisor.id)
        )
    ).scalars().all()
    assert len(rows) == 1
    assert rows[0].token == "ExponentPushToken[abc]"
    assert rows[0].platform == "ios"  # platform updated on re-register


async def test_register_push_token_requires_auth(client):
    resp = await client.post("/api/v1/me/push-token", json={"token": "X"})
    assert resp.status_code == 401


async def test_sender_resolves_contractor_token(client, db_session, supervisor):
    await client.post(
        "/api/v1/me/push-token",
        json={"token": "ExponentPushToken[field]"},
        headers=auth(supervisor),
    )

    tokens = await sender.push_tokens_for_user(db_session, supervisor.id)
    assert tokens == ["ExponentPushToken[field]"]


async def test_notify_user_pushes_in_dry_run(client, db_session, supervisor):
    sender.reset_dry_run_log()
    await client.post(
        "/api/v1/me/push-token",
        json={"token": "ExponentPushToken[field]"},
        headers=auth(supervisor),
    )

    targeted = await sender.notify_user(
        db_session, supervisor.id, "Site update", "New delivery logged"
    )
    assert targeted == ["ExponentPushToken[field]"]
    log = sender.dry_run_log()
    assert any(m["to"] == "ExponentPushToken[field]" for m in log)
    sender.reset_dry_run_log()


async def test_notify_user_no_token_is_empty(db_session, supervisor):
    targeted = await sender.notify_user(db_session, supervisor.id, "T", "B")
    assert targeted == []
