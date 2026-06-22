"""Thin bot router endpoints (auth'd) — drive the same brain paths as W3."""
from __future__ import annotations

from datetime import date

import pytest

from app.auth.jwt import create_access_token
from app.bot import sender as sender_mod


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


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
        "/api/v1/bot/handle", json={"raw_message_id": str(msg.id)}, headers=auth(world.owner)
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
        headers=auth(world.owner),
    )
    assert resp.status_code == 200
    deliver = resp.json()
    assert deliver["reply_map"] == {"1": str(d1.id)}

    resp = await client.post(
        "/api/v1/bot/reply",
        json={"chat_jid": world.chat_jid, "text": "1"},
        headers=auth(world.owner),
    )
    assert resp.status_code == 200
    reply = resp.json()
    assert reply["handled"] is True
    assert reply["state"] == "resolved"
    assert reply["decision_id"] == str(d1.id)
