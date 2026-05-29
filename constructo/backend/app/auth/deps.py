"""Auth dependencies: current-user resolution and role gating."""
from collections.abc import Callable
from uuid import UUID

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_token
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
