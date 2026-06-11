"""Nivaan in-thread: the sender_kind=nivaan substrate + invocation."""
from uuid import uuid4

from app.chat.router import post_agent_message
from app.models import Conversation, ConversationKind, SenderKind, UserRole
from tests.test_chat_api import auth


async def _site_conv(db_session, factory, company, site):
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site
    )
    db_session.add(conv)
    await db_session.flush()
    return conv


async def test_post_agent_message_mints_a_nivaan_row(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    conv = await _site_conv(db_session, factory, company, site)

    msg = await post_agent_message(
        db_session,
        conv,
        sender_kind=SenderKind.nivaan,
        body="90 bori cement.",
        meta={"nivaan": {"kind": "answer", "tool": "aggregate"}},
    )

    assert msg.sender_kind is SenderKind.nivaan
    assert msg.sender_id is None
    assert msg.seq == 1  # first row in the conversation
    assert msg.body == "90 bori cement."
    assert msg.meta == {"nivaan": {"kind": "answer", "tool": "aggregate"}}
    # The conversation's last_seq advanced.
    refreshed = await db_session.get(Conversation, conv.id)
    assert refreshed.last_seq == 1


async def test_chat_message_out_serializes_sender_kind(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["sender_kind"] == "user"  # default human row
