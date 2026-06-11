"""Offline members get an Expo push with a deep link; online members don't."""
from uuid import uuid4

from app.chat.presence import InMemoryPresence, get_presence
from app.models import UserRole
from app.push.sender import dry_run_log, reset_dry_run_log
from app.sites.models import SiteAssignment
from tests.test_chat_api import auth


async def test_presence_roundtrip():
    p = InMemoryPresence()
    assert not await p.is_online("u1")
    await p.mark_online("u1", "conn-a")
    assert await p.is_online("u1")
    await p.mark_offline("u1", "conn-a")
    assert not await p.is_online("u1")


async def test_send_pushes_offline_members_not_sender(client, factory, db_session, monkeypatch):
    reset_dry_run_log()
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    from app.models import PushToken

    db_session.add(PushToken(user_id=supervisor.id, token="ExponentPushToken[sup]"))
    db_session.add(PushToken(user_id=owner.id, token="ExponentPushToken[own]"))
    await db_session.flush()

    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "cement aa gaya"},
        headers=auth(owner),
    )
    assert resp.status_code == 201
    tokens = [m["to"] for m in dry_run_log()]
    assert "ExponentPushToken[sup]" in tokens   # offline recipient pushed
    assert "ExponentPushToken[own]" not in tokens  # sender never pushed
    data = next(m for m in dry_run_log() if m["to"] == "ExponentPushToken[sup]")["data"]
    assert data["conversation_id"] and isinstance(data["seq"], int)


async def test_online_member_is_not_pushed(client, factory, db_session):
    reset_dry_run_log()
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    from app.models import PushToken

    db_session.add(PushToken(user_id=supervisor.id, token="ExponentPushToken[sup]"))
    await db_session.flush()
    await get_presence().mark_online(str(supervisor.id), "conn-1")
    try:
        await client.post(
            "/api/v1/chat/messages",
            json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "x"},
            headers=auth(owner),
        )
        assert all(m["to"] != "ExponentPushToken[sup]" for m in dry_run_log())
    finally:
        await get_presence().mark_offline(str(supervisor.id), "conn-1")
