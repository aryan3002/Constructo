"""Slack-borrows light (2.6) — word-acks + resolve-thread closes the linked
Action Item."""
from uuid import uuid4

import pytest_asyncio
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.models import ActionItem, ActionItemStatus, MessageAck, UserRole


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def _send(client, user, site_id, body):
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site_id), "client_msg_id": str(uuid4()), "body": body},
        headers=auth(user),
    )
    return resp.json()["id"]


async def test_word_ack_upserts(client, db_session, world):
    _, owner, site = world
    mid = await _send(client, owner, site.id, "please check the slab")
    r = await client.post(
        f"/api/v1/chat/messages/{mid}/ack", json={"ack": "on_it"}, headers=auth(owner)
    )
    assert r.status_code == 204
    ack = await db_session.get(MessageAck, (mid, owner.id))
    assert ack.ack.value == "on_it"
    # Re-ack overwrites (no duplicate row).
    await client.post(f"/api/v1/chat/messages/{mid}/ack", json={"ack": "done"}, headers=auth(owner))
    await db_session.refresh(ack)
    assert ack.ack.value == "done"


async def test_resolve_thread_closes_linked_action_item(client, db_session, world):
    _, owner, site = world
    mid = await _send(client, owner, site.id, "Ramesh ko kal tak cement order karne bolo")
    # The AI-detector (2.7) created a linked Action Item from that message.
    item = (
        await db_session.execute(select(ActionItem).where(ActionItem.source_message_id == mid))
    ).scalar_one()
    assert item.status == ActionItemStatus.open

    resp = await client.post(f"/api/v1/chat/messages/{mid}/resolve", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    assert resp.json()["closed_action_items"] == 1

    await db_session.refresh(item)
    assert item.status == ActionItemStatus.done


async def test_ack_scoped(client, factory, world):
    company, owner, site = world  # noqa: F841 (company unused but unpacked)
    mid = await _send(client, owner, site.id, "hi")
    stranger = await factory.user(company=company, role=UserRole.supervisor)  # unassigned
    resp = await client.post(
        f"/api/v1/chat/messages/{mid}/ack", json={"ack": "seen"}, headers=auth(stranger)
    )
    assert resp.status_code == 403
