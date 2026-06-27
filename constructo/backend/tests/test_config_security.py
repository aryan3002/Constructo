"""Phase-0 fail-closed guard: in a prod posture (APP_ENV=prod) the app must
refuse to boot with world-open auth (dev OTP + empty allowlist) or the public
dev JWT secret. Dev/test/CI (the default) keep the convenient defaults."""
import pytest

from app.config import _DEV_JWT_SECRET, Settings

_GOOD_SECRET = "x" * 40


def _settings(**kw):
    # _env_file=None so the developer's local .env can't perturb the assertion.
    base = dict(_env_file=None, app_env="prod", jwt_secret=_GOOD_SECRET)
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
