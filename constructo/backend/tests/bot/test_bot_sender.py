"""sender — transport selection, /send contract body, idempotency (no network)."""
from __future__ import annotations

import pytest

from app.bot import sender as sender_mod
from app.bot.sender import reset_idempotency, send


@pytest.fixture(autouse=True)
def _clean(monkeypatch):
    reset_idempotency()
    # Force dry-run regardless of ambient env.
    monkeypatch.setenv("BOT_SEND_VIA", "dry_run")
    yield
    reset_idempotency()


@pytest.mark.asyncio
async def test_dry_run_text_captures_without_network():
    res = await send("120363@g.us", text="hello")
    assert res.ok is True
    assert res.transport == "dry_run"
    assert res.kind == "text"
    assert res.payload == {"to": "120363@g.us", "type": "text", "text": "hello"}


@pytest.mark.asyncio
async def test_dry_run_reaction_body_matches_contract():
    res = await send("120363@g.us", react_to="msg-123")
    assert res.kind == "reaction"
    assert res.payload == {
        "to": "120363@g.us", "type": "reaction", "text": "✅",
        "react_to_message_id": "msg-123",
    }


@pytest.mark.asyncio
async def test_dry_run_reply_to_in_body():
    res = await send("120363@g.us", text="answer", reply_to="msg-9")
    assert res.payload["reply_to_message_id"] == "msg-9"


@pytest.mark.asyncio
async def test_idempotency_suppresses_second_send():
    first = await send("x@g.us", text="hi", idempotency_key="k1")
    assert first.deduped is False
    second = await send("x@g.us", text="hi", idempotency_key="k1")
    assert second.deduped is True
    assert second.message_id == first.message_id


@pytest.mark.asyncio
async def test_text_requires_body():
    with pytest.raises(ValueError):
        await send("x@g.us")


@pytest.mark.asyncio
async def test_bridge_mode_builds_contract_request(monkeypatch):
    """Bridge mode posts the exact /send contract with the X-Bridge-Key header."""
    monkeypatch.setenv("BOT_SEND_VIA", "bridge")
    monkeypatch.setenv("BRIDGE_URL", "http://bridge.local")
    monkeypatch.setenv("BRIDGE_KEY", "secret-key")

    captured = {}

    class FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return {"ok": True, "message_id": "wamid.123"}

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResp()

    monkeypatch.setattr(sender_mod.httpx, "AsyncClient", FakeClient)

    res = await send("120363@g.us", text="hi from nivaan", reply_to="m1")
    assert res.ok is True
    assert res.message_id == "wamid.123"
    assert res.transport == "bridge"
    assert captured["url"] == "http://bridge.local/send"
    assert captured["headers"]["X-Bridge-Key"] == "secret-key"
    assert captured["json"] == {
        "to": "120363@g.us", "type": "text", "text": "hi from nivaan",
        "reply_to_message_id": "m1",
    }


@pytest.mark.asyncio
async def test_bridge_failure_degrades_to_not_ok(monkeypatch):
    monkeypatch.setenv("BOT_SEND_VIA", "bridge")
    monkeypatch.setenv("BRIDGE_URL", "http://bridge.local")

    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, *a, **k):
            raise RuntimeError("boom")

    monkeypatch.setattr(sender_mod.httpx, "AsyncClient", FakeClient)
    res = await send("x@g.us", text="hi")
    assert res.ok is False
    assert res.transport == "bridge"
