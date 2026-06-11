"""Delivered/read cursors → WhatsApp-grade ticks without per-message rows."""
from uuid import uuid4

from app.models import UserRole
from app.models.homeowner_member import HomeownerMember, MemberStatus
from app.sites.models import SiteAssignment
from tests.test_chat_api import auth


async def _send(client, user, site=None, body="msg", conversation_id=None):
    payload = {"client_msg_id": str(uuid4()), "body": body}
    if conversation_id is not None:
        payload["conversation_id"] = str(conversation_id)
    else:
        payload["site_id"] = str(site.id)
    resp = await client.post(
        "/api/v1/chat/messages",
        json=payload,
        headers=auth(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_delivered_endpoint_advances_cursor_monotonically(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    await _send(client, owner, site)
    msg2 = await _send(client, owner, site)
    body = {"site_id": str(site.id), "last_seq": msg2["seq"]}
    assert (await client.post("/api/v1/chat/delivered", json=body, headers=auth(owner))).status_code == 204
    # Regression must not move it backwards.
    body["last_seq"] = 1
    assert (await client.post("/api/v1/chat/delivered", json=body, headers=auth(owner))).status_code == 204
    cursors = (
        await client.get(
            "/api/v1/chat/cursors", params={"site_id": str(site.id)}, headers=auth(owner)
        )
    ).json()
    mine = next(c for c in cursors if c["user_id"] == str(owner.id))
    assert mine["last_delivered_seq"] == msg2["seq"]


async def test_read_implies_delivered(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    msg = await _send(client, owner, site)
    await client.post(
        "/api/v1/chat/read",
        json={"site_id": str(site.id), "last_seq": msg["seq"]},
        headers=auth(owner),
    )
    cursors = (
        await client.get(
            "/api/v1/chat/cursors", params={"site_id": str(site.id)}, headers=auth(owner)
        )
    ).json()
    mine = next(c for c in cursors if c["user_id"] == str(owner.id))
    assert mine["last_delivered_seq"] == msg["seq"]
    assert mine["last_read_seq"] == msg["seq"]


async def test_receipts_for_message_aggregates_recipients(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    await db_session.flush()
    msg = await _send(client, owner, site)
    r = (
        await client.get(f"/api/v1/chat/messages/{msg['id']}/receipts", headers=auth(owner))
    ).json()
    assert r["delivered_by"] == [] and r["read_by"] == []  # sender excluded
    await client.post(
        "/api/v1/chat/read",
        json={"site_id": str(site.id), "last_seq": msg["seq"]},
        headers=auth(supervisor),
    )
    r = (
        await client.get(f"/api/v1/chat/messages/{msg['id']}/receipts", headers=auth(owner))
    ).json()
    assert str(supervisor.id) in r["delivered_by"] and str(supervisor.id) in r["read_by"]


async def test_messages_windowing_before_seq_desc(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    for i in range(5):
        await _send(client, owner, site, body=f"m{i}")
    page = (
        await client.get(
            "/api/v1/chat/messages",
            params={"site_id": str(site.id), "before_seq": 4, "order": "desc", "limit": 2},
            headers=auth(owner),
        )
    ).json()
    assert [m["seq"] for m in page] == [3, 2]


async def test_homeowner_room_masks_read_receipts(client, factory, db_session):
    """In the homeowner room, read cursors never cross (delivered-only policy);
    each side still sees its OWN read cursor, but not the other party's."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    site = await factory.site(company)
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            status=MemberStatus.active,
            join_code=f"test-mask-{uuid4().hex[:8]}",
        )
    )
    await db_session.flush()

    # Open the homeowner channel (get-or-create).
    resp = await client.post(
        "/api/v1/chat/homeowner-channel",
        json={"site_id": str(site.id)},
        headers=auth(homeowner),
    )
    assert resp.status_code == 200, resp.text
    conv_id = resp.json()["id"]

    # Owner sends a message so the homeowner has something to read.
    msg = await _send(client, owner, conversation_id=conv_id)

    # Homeowner reads the message.
    await client.post(
        "/api/v1/chat/read",
        json={"conversation_id": conv_id, "last_seq": msg["seq"]},
        headers=auth(homeowner),
    )

    # Owner queries cursors for this homeowner conversation.
    cursors = (
        await client.get(
            "/api/v1/chat/cursors",
            params={"conversation_id": conv_id},
            headers=auth(owner),
        )
    ).json()

    # The homeowner's row as seen by the owner:
    # - last_delivered_seq should be msg["seq"] (read implies delivered, delivered is NOT masked)
    # - last_read_seq should be 0 (masked — owner cannot see the homeowner's read cursor)
    ho_cursor = next((c for c in cursors if c["user_id"] == str(homeowner.id)), None)
    assert ho_cursor is not None, "Homeowner cursor row missing"
    assert ho_cursor["last_delivered_seq"] == msg["seq"], (
        f"Expected delivered={msg['seq']}, got {ho_cursor['last_delivered_seq']}"
    )
    assert ho_cursor["last_read_seq"] == 0, (
        f"Expected read=0 (masked), got {ho_cursor['last_read_seq']}"
    )

    # The homeowner sees her OWN read cursor (not masked).
    ho_self_cursors = (
        await client.get(
            "/api/v1/chat/cursors",
            params={"conversation_id": conv_id},
            headers=auth(homeowner),
        )
    ).json()
    ho_self = next((c for c in ho_self_cursors if c["user_id"] == str(homeowner.id)), None)
    assert ho_self is not None, "Homeowner self cursor row missing"
    assert ho_self["last_read_seq"] == msg["seq"], (
        f"Homeowner should see her own read cursor unmasked, got {ho_self['last_read_seq']}"
    )
