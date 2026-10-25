"""Phase-0 fail-closed guard: in a prod posture (APP_ENV=prod) the app must
refuse to boot with world-open auth (dev OTP + empty allowlist) or the public
dev JWT secret. Dev/test/CI (the default) keep the convenient defaults."""
import pytest

from app.config import _DEV_INGEST_KEY, _DEV_JWT_SECRET, Settings

_GOOD_SECRET = "x" * 40
_GOOD_KEY = "k" * 32


def _settings(**kw):
    # _env_file=None so the developer's local .env can't perturb the assertion.
    base = dict(
        _env_file=None, app_env="prod", jwt_secret=_GOOD_SECRET, ingest_api_key=_GOOD_KEY
    )
    base.update(kw)
    return Settings(**base)


def test_prod_refuses_world_open_otp():
    with pytest.raises(ValueError, match="world-open|AUTH_PHONE_ALLOWLIST"):
        _settings(dev_otp_enabled=True, auth_phone_allowlist=[])


def test_prod_refuses_dev_jwt_secret():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        _settings(dev_otp_enabled=False, jwt_secret=_DEV_JWT_SECRET)


def test_prod_refuses_short_jwt_secret():
    with pytest.raises(ValueError, match="JWT_SECRET"):
        _settings(dev_otp_enabled=False, jwt_secret="too-short")


def test_prod_ok_with_allowlist_closes_otp():
    s = _settings(dev_otp_enabled=True, auth_phone_allowlist=["+919810000001"])
    assert s.app_env == "prod"


def test_prod_ok_with_dev_otp_disabled():
    s = _settings(dev_otp_enabled=False, auth_phone_allowlist=[])
    assert s.dev_otp_enabled is False


def test_dev_default_keeps_world_open_convenience():
    # The default posture (dev) must NOT raise — tests/CI/local rely on it.
    s = Settings(_env_file=None, app_env="dev")
    assert s.dev_otp_enabled is True and s.auth_phone_allowlist == []


def test_prod_refuses_dev_ingest_key():
    with pytest.raises(ValueError, match="INGEST_API_KEY"):
        _settings(dev_otp_enabled=False, ingest_api_key=_DEV_INGEST_KEY)


def test_prod_refuses_short_ingest_key():
    with pytest.raises(ValueError, match="INGEST_API_KEY"):
        _settings(dev_otp_enabled=False, ingest_api_key="short-ingest-key")


def test_prod_refuses_weak_bridge_key_when_bot_sends_via_bridge():
    with pytest.raises(ValueError, match="BRIDGE_KEY"):
        _settings(dev_otp_enabled=False, bot_send_via="bridge", bridge_key="dev-bridge-key")
    # The legacy WHATSAPP_SEND_MODE=url also means "via the bridge".
    with pytest.raises(ValueError, match="BRIDGE_KEY"):
        _settings(dev_otp_enabled=False, whatsapp_send_mode="url", bridge_key="")
    ok = _settings(dev_otp_enabled=False, bot_send_via="bridge", bridge_key=_GOOD_KEY)
    assert ok.bridge_key == _GOOD_KEY


def test_prod_ignores_bridge_key_when_not_sending_via_bridge():
    s = _settings(dev_otp_enabled=False, bot_send_via="dry_run", bridge_key="")
    assert s.bot_sends_via_bridge is False


def test_dev_otp_hint_hidden_in_prod_even_when_enabled(monkeypatch):
    from app.auth.otp import dev_otp_hint
    from app.config import settings

    monkeypatch.setattr(settings, "dev_otp_enabled", True)
    assert dev_otp_hint() == settings.dev_otp
    for env in ("prod", "production", "PROD"):
        monkeypatch.setattr(settings, "app_env", env)
        assert dev_otp_hint() is None


def test_docs_and_schema_off_in_prod():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.main import api_docs_urls

    prod = _settings(dev_otp_enabled=False)
    dev = Settings(_env_file=None, app_env="dev")
    assert api_docs_urls(prod) == {"openapi_url": None, "docs_url": None, "redoc_url": None}
    with TestClient(FastAPI(**api_docs_urls(prod))) as c:
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert c.get(path).status_code == 404
    with TestClient(FastAPI(**api_docs_urls(dev))) as c:
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert c.get(path).status_code == 200


def test_cors_private_network_regex_only_outside_prod():
    import re

    from app.main import cors_origin_regex

    assert cors_origin_regex(_settings(dev_otp_enabled=False)) is None
    dev_regex = cors_origin_regex(Settings(_env_file=None, app_env="dev"))
    assert dev_regex and re.fullmatch(dev_regex, "http://192.168.1.20:8081")
