"""send_brief tests: dry-run, url mode, and cloud_api mode (no real network)."""
import logging

from app.brief.send import send_brief


class _FakeResponse:
    status_code = 200

    def raise_for_status(self):
        return None


def _fake_client_capturing(captured: dict):
    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json=None, headers=None):
            captured["url"] = url
            captured["json"] = json
            captured["headers"] = headers
            return _FakeResponse()

    return _FakeClient


async def test_send_brief_dry_run_returns_false_and_logs(monkeypatch, caplog):
    monkeypatch.setenv("WHATSAPP_SEND_MODE", "dry_run")
    monkeypatch.delenv("WHATSAPP_SEND_URL", raising=False)
    with caplog.at_level(logging.INFO, logger="app.brief.send"):
        result = await send_brief("+15551234567", "hello brief")
    assert result is False
    assert any(
        "dry-run" in r.message.lower() or "dry run" in r.message.lower() for r in caplog.records
    )


async def test_send_brief_dry_run_is_default_when_mode_unset(monkeypatch):
    monkeypatch.delenv("WHATSAPP_SEND_MODE", raising=False)
    monkeypatch.delenv("WHATSAPP_SEND_URL", raising=False)
    assert await send_brief("+15551234567", "hi") is False


async def test_send_brief_posts_when_url_set(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SEND_MODE", "url")
    monkeypatch.setenv("WHATSAPP_SEND_URL", "http://wa.test/send")

    captured: dict = {}
    monkeypatch.setattr("app.brief.send.httpx.AsyncClient", _fake_client_capturing(captured))

    result = await send_brief("+15551234567", "hello brief")
    assert result is True
    assert captured["url"] == "http://wa.test/send"
    assert captured["json"] == {"to_phone": "+15551234567", "text": "hello brief"}


async def test_send_brief_url_mode_without_url_is_dry_run(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SEND_MODE", "url")
    monkeypatch.delenv("WHATSAPP_SEND_URL", raising=False)
    assert await send_brief("+15551234567", "hi") is False


async def test_send_brief_returns_false_on_http_error(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SEND_MODE", "url")
    monkeypatch.setenv("WHATSAPP_SEND_URL", "http://wa.test/send")

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, json=None, headers=None):
            raise RuntimeError("boom")

    monkeypatch.setattr("app.brief.send.httpx.AsyncClient", _FakeClient)
    result = await send_brief("+15551234567", "hi")
    assert result is False


async def test_send_brief_cloud_api_builds_correct_request(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SEND_MODE", "cloud_api")
    monkeypatch.setenv("WHATSAPP_TOKEN", "test-token-abc")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "1094260843779305")

    captured: dict = {}
    monkeypatch.setattr("app.brief.send.httpx.AsyncClient", _fake_client_capturing(captured))

    result = await send_brief("+919999999999", "Subah ka brief")
    assert result is True
    assert captured["url"] == (
        "https://graph.facebook.com/v21.0/1094260843779305/messages"
    )
    assert captured["headers"] == {"Authorization": "Bearer test-token-abc"}
    assert captured["json"] == {
        "messaging_product": "whatsapp",
        "to": "+919999999999",
        "type": "text",
        "text": {"body": "Subah ka brief"},
    }


async def test_send_brief_cloud_api_missing_creds_returns_false(monkeypatch):
    monkeypatch.setenv("WHATSAPP_SEND_MODE", "cloud_api")
    monkeypatch.delenv("WHATSAPP_TOKEN", raising=False)
    monkeypatch.delenv("WHATSAPP_PHONE_NUMBER_ID", raising=False)
    assert await send_brief("+919999999999", "hi") is False
