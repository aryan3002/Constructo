"""Homeowner 1:1 channel (doc 18 Phase 3, PR 1 — Tasks 1–3).

The per-site ``kind=homeowner`` channel is a live thread: the homeowner reaches
her own channel (get-or-create + send + inbox), and crew sees and replies to it.
Since Slice D it also feeds the capture pipeline — a message mints a RawMessage
tagged ``sender_side`` (her captures book SiteEvents flagged for crew confirm). A
homeowner still cannot send to the crew site thread, and a non-member homeowner
cannot open a channel.
"""
import pytest_asyncio
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.models import (
    Conversation,
    ConversationKind,
    RawMessageModel,
    UserRole,
)
from app.models.homeowner_member import HomeownerMember, MemberStatus


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory, db_session):
    """Company, owner (crew), site, and an active homeowner member bound to a
    homeowner user — the builder↔homeowner pair for one property."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise Heights")
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            status=MemberStatus.active,
            join_code="hoc-world-1",
        )
    )
    await db_session.flush()
    return company, owner, site, homeowner


async def _open_channel(client, user, site):
    resp = await client.post(
        "/api/v1/chat/homeowner-channel",
        json={"site_id": str(site.id)},
        headers=auth(user),
    )
    return resp


async def test_homeowner_get_or_create_and_send_captures(
    client, db_session, world
):
    _, _, site, homeowner = world
    # Get-or-create the channel.
    resp = await _open_channel(client, homeowner, site)
    assert resp.status_code == 200, resp.text
    row = resp.json()
    assert row["kind"] == "homeowner"
    assert row["site_id"] == str(site.id)
    assert row["site_name"] == "Sunrise Heights"
    assert row["has_homeowner"] is True
    assert row["unread_count"] == 0
    conv_id = row["id"]

    # She sends a message — stored, homeowner side, and (Slice D) it now mints a
    # RawMessage that feeds the capture pipeline.
    from uuid import uuid4

    send = await client.post(
        "/api/v1/chat/messages",
        json={
            "conversation_id": conv_id,
            "client_msg_id": str(uuid4()),
            "body": "Kitchen tiles kab lagenge?",
        },
        headers=auth(homeowner),
    )
    assert send.status_code == 201, send.text
    assert send.json()["sender_side"] == "homeowner"
    assert send.json()["seq"] == 1

    # A RawMessage is minted, tagged homeowner (Slice D — her captures book to the
    # ledger, flagged for crew confirm).
    raws = (await db_session.execute(select(RawMessageModel))).scalars().all()
    assert len(raws) == 1
    assert raws[0].raw["sender_side"] == "homeowner"

    # She lists her channel in the inbox.
    inbox = await client.get("/api/v1/chat/conversations", headers=auth(homeowner))
    assert inbox.status_code == 200, inbox.text
    kinds = {c["id"]: c for c in inbox.json()}
    assert conv_id in kinds
    assert kinds[conv_id]["kind"] == "homeowner"


async def test_crew_sees_and_replies_to_homeowner_channel(client, db_session, world):
    from uuid import uuid4

    _, owner, site, homeowner = world
    # Homeowner opens + posts.
    open_resp = await _open_channel(client, homeowner, site)
    conv_id = open_resp.json()["id"]
    await client.post(
        "/api/v1/chat/messages",
        json={"conversation_id": conv_id, "client_msg_id": str(uuid4()), "body": "Hi"},
        headers=auth(homeowner),
    )

    # Owner sees the homeowner channel in their inbox.
    inbox = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert inbox.status_code == 200, inbox.text
    ho_rows = [c for c in inbox.json() if c["kind"] == "homeowner"]
    assert any(c["id"] == conv_id for c in ho_rows)

    # Owner replies (crew side).
    reply = await client.post(
        "/api/v1/chat/messages",
        json={
            "conversation_id": conv_id,
            "client_msg_id": str(uuid4()),
            "body": "Agle hafte",
        },
        headers=auth(owner),
    )
    assert reply.status_code == 201, reply.text
    assert reply.json()["sender_side"] == "contractor"
    assert reply.json()["seq"] == 2

    # Both sides' messages mint raws now (Slice D — the channel is a capture
    # surface; crew captures are authoritative, the homeowner's are flagged).
    raw_count = await db_session.scalar(select(func.count()).select_from(RawMessageModel))
    assert raw_count == 2


async def test_homeowner_cannot_send_to_site_thread(client, db_session, world):
    from uuid import uuid4

    company, owner, site, homeowner = world
    # A crew site thread exists.
    conv = Conversation(
        company_id=company.id,
        site_id=site.id,
        kind=ConversationKind.site,
        created_by=owner.id,
    )
    db_session.add(conv)
    await db_session.flush()

    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "conversation_id": str(conv.id),
            "client_msg_id": str(uuid4()),
            "body": "let me in",
        },
        headers=auth(homeowner),
    )
    assert resp.status_code == 403, resp.text


async def test_non_member_homeowner_cannot_open_channel(client, factory, world):
    company, _, site, _ = world
    # A homeowner who holds no membership on this site.
    outsider = await factory.user(company=company, role=UserRole.homeowner)
    resp = await _open_channel(client, outsider, site)
    assert resp.status_code == 403, resp.text
