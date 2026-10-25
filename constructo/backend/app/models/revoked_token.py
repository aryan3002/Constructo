"""Access tokens ended early by sign-out.

``POST /auth/logout`` records the presented token's ``jti`` here until the
token would have expired anyway; ``get_current_user`` refuses any jti on the
list. Rows past ``expires_at`` are dead weight and are purged on the next
logout. Tokens minted before access tokens carried a jti cannot be revoked and
simply run out.
"""
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String, primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
