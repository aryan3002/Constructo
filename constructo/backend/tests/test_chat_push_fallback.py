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


async def test_muted_group_member_not_pushed_unmuted_is_pushed(
    client, factory, db_session
):
    """Muted group members must NOT receive a push; unmuted offline members must.
    Without the mute-exclusion check in _push_offline_members both tokens would
    appear in dry_run_log, causing the first assertion to fail."""
    from app.models import (
        Conversation,
        ConversationKind,
        ConversationMember,
        MemberRole,
        PushToken,
    )

    reset_dry_run_log()
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    crew_muted = await factory.user(company=company, role=UserRole.supervisor)
    crew_unmuted = await factory.user(company=company, role=UserRole.supervisor)

    # Build a group conversation with three members: owner (admin), one muted
    # crew member, and one unmuted crew member.
    conv = Conversation(
        company_id=company.id,
        site_id=None,
        kind=ConversationKind.group,
        title="Mute Test Group",
        created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()

    db_session.add(
        ConversationMember(
            conversation_id=conv.id,
            user_id=owner.id,
            role=MemberRole.admin,
            added_by=owner.id,
        )
    )
    db_session.add(
        ConversationMember(
            conversation_id=conv.id,
            user_id=crew_muted.id,
            role=MemberRole.member,
            added_by=owner.id,
            muted=True,
        )
    )
    db_session.add(
        ConversationMember(
            conversation_id=conv.id,
            user_id=crew_unmuted.id,
            role=MemberRole.member,
            added_by=owner.id,
            muted=False,
        )
    )

    db_session.add(PushToken(user_id=crew_muted.id, token="ExponentPushToken[muted]"))
    db_session.add(
        PushToken(user_id=crew_unmuted.id, token="ExponentPushToken[unmuted]")
    )
    await db_session.flush()

    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "conversation_id": str(conv.id),
            "client_msg_id": str(uuid4()),
            "body": "group message test",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text

    tokens_pushed = [m["to"] for m in dry_run_log()]
    assert "ExponentPushToken[muted]" not in tokens_pushed   # muted — no push
    assert "ExponentPushToken[unmuted]" in tokens_pushed     # unmuted — must push
