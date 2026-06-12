"""Auth dependencies: current-user resolution and role gating."""
from collections.abc import Callable
from uuid import UUID

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import STEP_UP_SCOPE, decode_token
from app.common.errors import AppError
from app.db import get_session
from app.models import User, UserRole

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if creds is None:
        raise AppError(401, "not_authenticated", "Missing bearer token")
    try:
        payload = decode_token(creds.credentials)
        user_id = UUID(payload["sub"])
    except Exception as exc:
        raise AppError(401, "invalid_token", "Invalid or expired token") from exc

    user = await session.get(User, user_id)
    if user is None:
        raise AppError(401, "invalid_token", "User no longer exists")
    if not user.is_active:
        # Deactivated members keep their history but lose access immediately,
        # even with an unexpired token (W4.3).
        raise AppError(403, "deactivated", "This account has been deactivated")
    return user


def require_role(*roles: UserRole) -> Callable:
    async def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AppError(403, "forbidden", "Insufficient role")
        return user

    return _checker


def assert_valid_step_up(token: str | None, user: User) -> None:
    """Validate a step-up token for *user* and raise 403 ``step_up_required`` if invalid.

    Separates the token-validation logic from the FastAPI dependency so callers
    that only *conditionally* need step-up (e.g. ``update_user``) can call this
    directly instead of wiring a full ``Depends(require_step_up)``.

    Raises:
        AppError(403, "step_up_required", …) on missing / expired / wrong-scope /
        wrong-subject token. Returns ``None`` when the token is valid.
    """
    if not token:
        raise AppError(403, "step_up_required", "This action requires re-verification")
    try:
        payload = decode_token(token)
    except Exception as exc:  # expired or tampered
        raise AppError(403, "step_up_required", "Step-up expired — verify again") from exc
    if payload.get("scope") != STEP_UP_SCOPE or payload.get("sub") != str(user.id):
        raise AppError(403, "step_up_required", "Invalid step-up token")


async def require_step_up(
    user: User = Depends(get_current_user),
    x_step_up_token: str | None = Header(default=None),
) -> User:
    """Gate a sensitive/irreversible action on a FRESH OTP re-verification.

    The client obtains a short-lived step-up token from ``POST /auth/step-up/
    verify`` and sends it in the ``X-Step-Up-Token`` header. Missing/expired/
    wrong-scope/other-user tokens raise ``403 step_up_required`` so the web can
    detect the code and prompt for the OTP, then retry.
    """
    assert_valid_step_up(x_step_up_token, user)
    return user
