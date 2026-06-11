"""Nivaan in-thread: the sender_kind=nivaan substrate + invocation."""
from uuid import uuid4

from sqlalchemy import func, select

from app.chat.router import post_agent_message
from app.models import ChatMessage, Conversation, ConversationKind, SenderKind, UserRole
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


async def test_at_nivaan_in_crew_thread_yields_a_nivaan_reply_row(client, db_session, factory):
    from datetime import date

    from app.models import SiteEventModel

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    db_session.add(
        SiteEventModel(
            site_id=site.id, event_type="material_delivery", occurred_on=date.today(),
            summary="md", fields={"material": "cement", "quantity": 90, "unit": "bori"},
            confidence=1.0, needs_clarification=False, source_message_ids=[],
        )
    )
    await db_session.flush()

    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id), "client_msg_id": str(uuid4()),
            "body": "@nivaan how much cement",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    nivaan_rows = (
        await db_session.execute(
            select(ChatMessage).where(ChatMessage.sender_kind == SenderKind.nivaan)
        )
    ).scalars().all()
    assert len(nivaan_rows) == 1
    assert "90" in (nivaan_rows[0].body or "")


async def test_plain_message_does_not_summon_nivaan(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "morning all"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    n = await db_session.scalar(
        select(func.count())
        .select_from(ChatMessage)
        .where(ChatMessage.sender_kind == SenderKind.nivaan)
    )
    assert n == 0


async def test_at_nivaan_in_homeowner_room_is_ignored(client, db_session, factory):
    """The crew agent never reaches the homeowner room (structural membrane)."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.homeowner)
    db_session.add(conv)
    await db_session.flush()
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "conversation_id": str(conv.id), "client_msg_id": str(uuid4()),
            "body": "@nivaan how much cement",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    n = await db_session.scalar(
        select(func.count())
        .select_from(ChatMessage)
        .where(ChatMessage.sender_kind == SenderKind.nivaan)
    )
    assert n == 0


async def test_nivaan_propose_returns_a_proposal_card(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id), "client_msg_id": str(uuid4()),
            "nivaan_propose": True, "capture_type": "material_delivery",
            "fields": {"material": "cement", "quantity": 50, "unit": "bori"},
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()
    assert out["sender_kind"] == "nivaan"
    assert out["meta"]["proposal"]["capture_type"] == "material_delivery"
    from app.models import SiteEventModel

    n = await db_session.scalar(
        select(func.count()).select_from(SiteEventModel).where(SiteEventModel.site_id == site.id)
    )
    assert n == 0
