"""Contractor push-token storage (C-F): upsert endpoint + sender resolution."""
import pytest_asyncio
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.models import (
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    PushToken,
    UserRole,
)
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


async def _tokens(db_session, user_id) -> list[str]:
    rows = (
        await db_session.execute(select(PushToken).where(PushToken.user_id == user_id))
    ).scalars().all()
    return sorted(r.token for r in rows)


async def test_unregister_push_token_deletes_only_that_token(client, db_session, supervisor):
    for tok in ("ExponentPushToken[old-phone]", "ExponentPushToken[other-phone]"):
        r = await client.post(
            "/api/v1/me/push-token", json={"token": tok}, headers=auth(supervisor)
        )
        assert r.status_code == 200, r.text

    resp = await client.request(
        "DELETE",
        "/api/v1/me/push-token",
        json={"token": "ExponentPushToken[old-phone]"},
        headers=auth(supervisor),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["ok"] is True
    assert await _tokens(db_session, supervisor.id) == ["ExponentPushToken[other-phone]"]

    # Idempotent: deleting it again (or an unknown token) is still ok.
    again = await client.request(
        "DELETE",
        "/api/v1/me/push-token",
        json={"token": "ExponentPushToken[old-phone]"},
        headers=auth(supervisor),
    )
    assert again.status_code == 200


async def test_unregister_push_token_leaves_other_users_rows(
    client, db_session, factory, supervisor
):
    other = await factory.user(role=UserRole.supervisor)
    shared = "ExponentPushToken[shared-phone]"
    for u in (supervisor, other):
        await client.post("/api/v1/me/push-token", json={"token": shared}, headers=auth(u))

    resp = await client.request(
        "DELETE", "/api/v1/me/push-token", json={"token": shared}, headers=auth(supervisor)
    )
    assert resp.status_code == 200
    assert await _tokens(db_session, supervisor.id) == []
    assert await _tokens(db_session, other.id) == [shared]


async def test_unregister_push_token_clears_homeowner_notif_prefs(client, db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    owner_of_home = await factory.user(company=company, role=UserRole.homeowner)
    tok = "ExponentPushToken[home-phone]"
    member = HomeownerMember(
        site_id=site.id,
        user_id=owner_of_home.id,
        sub_role=HomeownerSubRole.primary_owner,
        status=MemberStatus.active,
        notif_prefs={"push_token": tok, "cadence": {"photos": "daily"}},
    )
    other_member = HomeownerMember(
        site_id=site.id,
        user_id=(await factory.user(company=company, role=UserRole.homeowner)).id,
        sub_role=HomeownerSubRole.family,
        status=MemberStatus.active,
        notif_prefs={"push_token": tok},
    )
    db_session.add_all([member, other_member])
    await db_session.commit()

    resp = await client.request(
        "DELETE", "/api/v1/me/push-token", json={"token": tok}, headers=auth(owner_of_home)
    )
    assert resp.status_code == 200, resp.text
    await db_session.refresh(member)
    await db_session.refresh(other_member)
    assert member.notif_prefs == {"cadence": {"photos": "daily"}}
    assert other_member.notif_prefs == {"push_token": tok}


async def test_unregister_push_token_requires_auth(client):
    resp = await client.request("DELETE", "/api/v1/me/push-token", json={"token": "X"})
    assert resp.status_code == 401
