"""The OTP gate (STATE-AND-ROADMAP Phase 0).

Dev keeps working by default; the ``000000`` hole closes when DEV_OTP_ENABLED is
off; an allowlist locks login to known numbers for a private pilot.
"""
from app.config import settings


async def _login(client, phone: str, otp: str):
    return await client.post("/api/v1/auth/login", json={"phone": phone, "otp": otp})


async def test_dev_otp_default_allows_login(client):
    r = await _login(client, "+919800000001", "000000")
    assert r.status_code == 200, r.text
    assert r.json()["token"]


async def test_wrong_otp_rejected(client):
    r = await _login(client, "+919800000002", "999999")
    assert r.status_code == 401


async def test_disabling_dev_otp_closes_the_hole(client, monkeypatch):
    monkeypatch.setattr(settings, "dev_otp_enabled", False)
    r = await _login(client, "+919800000003", "000000")
    assert r.status_code == 401  # the wide-open 000000 door is shut


async def test_dev_otp_code_is_configurable(client, monkeypatch):
    monkeypatch.setattr(settings, "dev_otp", "135790")
    assert (await _login(client, "+919800000004", "000000")).status_code == 401
    assert (await _login(client, "+919800000004", "135790")).status_code == 200


async def test_allowlist_locks_login_to_known_numbers(client, monkeypatch):
    monkeypatch.setattr(settings, "auth_phone_allowlist", ["+919811111111"])
    # An unknown number is refused even with the right OTP.
    assert (await _login(client, "+919822222222", "000000")).status_code == 403
    # The allowlisted number gets in — matched across equivalent formats.
    assert (await _login(client, "9811111111", "000000")).status_code == 200


async def test_request_otp_hint_hidden_once_closed(client, monkeypatch):
    on = await client.post("/api/v1/auth/request-otp", json={"phone": "+919800000005"})
    assert on.json()["dev_otp"] == "000000"
    monkeypatch.setattr(settings, "dev_otp_enabled", False)
    off = await client.post("/api/v1/auth/request-otp", json={"phone": "+919800000005"})
    assert off.json()["dev_otp"] is None
