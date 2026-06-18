"""Verify that GET /api/v1/chat/messages returns sender_name and sender_role
on each message row (Task P1.1 — chat sender attribution).

Seeds a site conversation with two messages from two different users (a
supervisor "Lokesh" and an owner "Saurabh"), GETs the list as an authorized
crew user, and asserts each row carries the correct name and a non-null role.
"""
from uuid import uuid4

import pytest

from app.auth.jwt import create_access_token
from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    MessageSide,
    SenderKind,
    UserRole,
)
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest.fixture
async def world(factory):
    company = await factory.company(name="Sunrise Builders")
    owner = await factory.user(company=company, role=UserRole.owner, name="Saurabh")
    supervisor = await factory.user(company=company, role=UserRole.supervisor, name="Lokesh")
    site = await factory.site(company, name="CivilArch Plot 5")
    return company, owner, supervisor, site


@pytest.mark.asyncio
async def test_sender_name_and_role_on_list(client, db_session, factory, world):
    """GET /messages returns sender_name + sender_role matching each author."""
    company, owner, supervisor, site = world

    # Assign supervisor to the site so he has access.
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    await db_session.flush()

    # Create the site conversation manually (mirrors test_chat_api pattern).
    conv = Conversation(
        company_id=company.id,
        site_id=site.id,
        kind=ConversationKind.site,
        created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()

    # Insert two messages from two different users directly via db_session.
    msg1 = ChatMessage(
        conversation_id=conv.id,
        sender_id=supervisor.id,
        sender_side=MessageSide.contractor,
        sender_kind=SenderKind.user,
        client_msg_id=uuid4(),
        seq=1,
        body="12 mistri aaye aaj",
        media_type="text",
    )
    msg2 = ChatMessage(
        conversation_id=conv.id,
        sender_id=owner.id,
        sender_side=MessageSide.contractor,
        sender_kind=SenderKind.user,
        client_msg_id=uuid4(),
        seq=2,
        body="Theek hai, kaam jaari rakho",
        media_type="text",
    )
    db_session.add(msg1)
    db_session.add(msg2)
    await db_session.flush()

    # Fetch as the owner (authorized crew member).
    resp = await client.get(
        f"/api/v1/chat/messages?conversation_id={conv.id}",
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    rows = resp.json()
    assert len(rows) == 2

    # Build a lookup by sender_id for easy assertion.
    by_sender = {r["sender_id"]: r for r in rows}

    sup_row = by_sender[str(supervisor.id)]
    assert sup_row["sender_name"] == "Lokesh"
    assert sup_row["sender_role"] == "supervisor"

    owner_row = by_sender[str(owner.id)]
    assert owner_row["sender_name"] == "Saurabh"
    assert owner_row["sender_role"] == "owner"

    # Every row must carry a sender_role key (even if None for system messages).
    for row in rows:
        assert "sender_name" in row
        assert "sender_role" in row


@pytest.mark.asyncio
async def test_send_message_returns_sender_attribution(client, db_session, factory, world):
    """POST /messages response carries sender_name + sender_role from the JWT user."""
    _, owner, _, site = world

    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "cement aa gaya",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    msg = resp.json()
    assert msg["sender_name"] == "Saurabh"
    assert msg["sender_role"] == "owner"
