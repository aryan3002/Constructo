"""Thin bot router endpoints (auth'd) — drive the same brain paths as W3."""
from __future__ import annotations

from datetime import date

import pytest

from app.auth.jwt import create_access_token
from app.bot import sender as sender_mod
from app.config import settings


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


def svc() -> dict[str, str]:
    """The bridge's server-to-server credential for the /bot/* seams."""
    return {"X-Ingest-Key": settings.ingest_api_key}


@pytest.fixture
def fake_send(monkeypatch):
    calls = []

    async def _send(to, *, text=None, react_to=None, reply_to=None, dm=False, idempotency_key=None):
        kind = "reaction" if react_to else "text"
        calls.append({"to": to, "text": text, "kind": kind, "dm": dm})
        return sender_mod.SendResult(
            ok=True, message_id="r1", transport="fake", kind=kind, to=to, dm=dm
        )

    monkeypatch.setattr(sender_mod, "send", _send)
    return calls


@pytest.mark.asyncio
async def test_handle_endpoint(client, world, fake_send):
    msg = await world.inbound("aaj cement aa gaya")
    resp = await client.post(
        "/api/v1/bot/handle", json={"raw_message_id": str(msg.id)}, headers=svc()
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["action"] == "reaction"


@pytest.mark.asyncio
async def test_handle_requires_auth(client, world, fake_send):
    msg = await world.inbound("hi")
    resp = await client.post("/api/v1/bot/handle", json={"raw_message_id": str(msg.id)})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_deliver_and_reply_endpoints(client, world, fake_send):
    d1 = await world.decision(title="Approve cement advance")

    resp = await client.post(
        "/api/v1/bot/deliver-brief",
        json={"company_id": str(world.company.id), "date": date.today().isoformat()},
        headers=svc(),
    )
    assert resp.status_code == 200
    deliver = resp.json()
    assert deliver["reply_map"] == {"1": str(d1.id)}

    resp = await client.post(
        "/api/v1/bot/reply",
        json={"chat_jid": world.chat_jid, "text": "1"},
        headers=svc(),
    )
    assert resp.status_code == 200
    reply = resp.json()
    assert reply["handled"] is True
    assert reply["state"] == "resolved"
    assert reply["decision_id"] == str(d1.id)


# ---- service-key boundary (Vulns 1 & 2: no cross-tenant access via user JWT) ----


@pytest.mark.asyncio
async def test_deliver_brief_rejects_bare_user_jwt(client, world, fake_send):
    """A logged-in user (even the owner) cannot reach deliver-brief without the
    service key — it is a bridge-only seam, not a client endpoint. This closes the
    cross-tenant company_id leak (Vuln 2)."""
    await world.decision(title="Approve cement advance")
    resp = await client.post(
        "/api/v1/bot/deliver-brief",
        json={"company_id": str(world.company.id), "date": date.today().isoformat()},
        headers=auth(world.owner),
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reply_rejects_bare_user_jwt(client, world, fake_send):
    """A logged-in user cannot drive a brief reply (decision approve/reject) without
    the service key. This closes the cross-tenant decision-mutation hole (Vuln 1)."""
    await world.decision(title="Approve cement advance")
    resp = await client.post(
        "/api/v1/bot/reply",
        json={"chat_jid": world.chat_jid, "text": "1"},
        headers=auth(world.owner),
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_handle_rejects_bare_user_jwt(client, world, fake_send):
    msg = await world.inbound("aaj cement aa gaya")
    resp = await client.post(
        "/api/v1/bot/handle", json={"raw_message_id": str(msg.id)}, headers=auth(world.owner)
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_reply_rejects_wrong_service_key(client, world, fake_send):
    await world.decision(title="Approve cement advance")
    resp = await client.post(
        "/api/v1/bot/reply",
        json={"chat_jid": world.chat_jid, "text": "1"},
        headers={"X-Ingest-Key": "not-the-key"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_bot_endpoints_accept_service_key(client, world, fake_send):
    """With the bridge service key the seams work end-to-end (deliver then reply)."""
    d1 = await world.decision(title="Approve cement advance")
    deliver = await client.post(
        "/api/v1/bot/deliver-brief",
        json={"company_id": str(world.company.id), "date": date.today().isoformat()},
        headers=svc(),
    )
    assert deliver.status_code == 200, deliver.text
    assert deliver.json()["reply_map"] == {"1": str(d1.id)}

    reply = await client.post(
        "/api/v1/bot/reply",
        json={"chat_jid": world.chat_jid, "text": "1"},
        headers=svc(),
    )
    assert reply.status_code == 200, reply.text
    assert reply.json()["state"] == "resolved"
    assert reply.json()["decision_id"] == str(d1.id)
