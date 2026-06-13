"""The single OTP gate — used by every phone+OTP entry point (login, step-up,
homeowner join), so the auth posture is defined in ONE place.

STATE-AND-ROADMAP Phase 0: close the wide-open ``000000`` hole without breaking
dev. Behaviour:

- **Allowlist** (``settings.auth_phone_allowlist``): when set, only those phone
  numbers may proceed — a private-pilot lock, independent of the OTP mode and
  matched across equivalent phone formats. Empty = no allowlist (dev).
- **Dev OTP** (``settings.dev_otp_enabled`` / ``settings.dev_otp``): while enabled
  the configurable dev code is accepted. Set ``DEV_OTP_ENABLED=false`` in the
  pilot/prod deploy to close it.
- With the dev OTP disabled and no SMS provider wired, OTP entry is **refused**
  outright — never a silent open door.

A real SMS provider would slot in here (verify against the sent code) without any
caller changing.
"""
from app.auth.phone import phone_candidates
from app.common.errors import AppError
from app.config import settings


def phone_allowed(phone: str) -> bool:
    """True when ``phone`` is permitted by the allowlist (or no allowlist set)."""
    allow = settings.auth_phone_allowlist
    if not allow:
        return True
    wanted = set(phone_candidates(phone))
    allowed = {c for entry in allow for c in phone_candidates(entry)}
    return bool(wanted & allowed)


def assert_otp_valid(phone: str, otp: str) -> None:
    """Raise ``AppError`` unless this phone+OTP may authenticate.

    403 ``not_allowed`` if the phone is outside the pilot allowlist; 401
    ``invalid_otp`` if the code is wrong or OTP login is not available.
    """
    if not phone_allowed(phone):
        raise AppError(403, "not_allowed", "This number is not enabled for the pilot")
    if settings.dev_otp_enabled:
        if otp == settings.dev_otp:
            return
        raise AppError(401, "invalid_otp", "Invalid OTP")
    # Dev OTP disabled and no SMS provider wired yet — refuse, don't open.
    raise AppError(401, "invalid_otp", "OTP verification is not available")


def dev_otp_hint() -> str | None:
    """The dev OTP to surface in request-otp responses — only while enabled, so
    the stub is never leaked once the bypass is closed in prod."""
    return settings.dev_otp if settings.dev_otp_enabled else None
