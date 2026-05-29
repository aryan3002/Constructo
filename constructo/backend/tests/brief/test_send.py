"""send_brief tests: dry-run when unset, POST when configured (no real network)."""
import logging

from app.brief.send import send_brief


async def test_send_brief_dry_run_returns_false_and_logs(monkeypatch, caplog):
    monkeypatch.delenv("WHATSAPP_SEND_URL", raising=False)
    with caplog.at_level(logging.INFO, logger="app.brief.send"):
        result = await send_brief("+15551234567", "hello brief")
    assert result is False
    assert any("dry-run" in r.message.lower() or "dry run" in r.message.lower()
               for r in caplog.records)


async def test_send_brief_posts_when_url_set(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SEND_URL", "http://wa.test/send")

    captured = {}

    class _FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json=None):
            captured["url"] = url
            captured["json"] = json
            return _FakeResponse()

    monkeypatch.setattr("app.brief.send.httpx.AsyncClient", _FakeClient)

    result = await send_brief("+15551234567", "hello brief")
    assert result is True
    assert captured["url"] == "http://wa.test/send"
    assert captured["json"] == {"to_phone": "+15551234567", "text": "hello brief"}


async def test_send_brief_returns_false_on_http_error(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SEND_URL", "http://wa.test/send")

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json=None):
            raise RuntimeError("boom")

    monkeypatch.setattr("app.brief.send.httpx.AsyncClient", _FakeClient)
    result = await send_brief("+15551234567", "hi")
    assert result is False
