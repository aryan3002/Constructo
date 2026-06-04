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
    return user


def require_role(*roles: UserRole) -> Callable:
    async def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise AppError(403, "forbidden", "Insufficient role")
        return user

    return _checker


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
    if not x_step_up_token:
        raise AppError(403, "step_up_required", "This action requires re-verification")
    try:
        payload = decode_token(x_step_up_token)
    except Exception as exc:  # expired or tampered
        raise AppError(403, "step_up_required", "Step-up expired — verify again") from exc
    if payload.get("scope") != STEP_UP_SCOPE or payload.get("sub") != str(user.id):
        raise AppError(403, "step_up_required", "Invalid step-up token")
    return user
