"""JWT encode/decode helpers."""
from datetime import UTC, datetime, timedelta

import jwt

from app.config import settings

#: JWT ``scope`` marking a short-lived step-up (sensitive-action) token.
STEP_UP_SCOPE = "step_up"


def create_access_token(subject: str, role: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_step_up_token(subject: str) -> str:
    """A short-lived token proving a fresh OTP re-verification for ``subject``.

    Carries ``scope: step_up`` and a tight expiry so it gates one sensitive
    action window (e.g. a Tally export) and cannot be used as a login token.
    """
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "scope": STEP_UP_SCOPE,
        "iat": now,
        "exp": now + timedelta(minutes=settings.step_up_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
