"""Device push-token storage (C-F).

The homeowner app stashes its Expo push token in ``homeowner_members.notif_prefs``
(it always has a member row). A *contractor* is a plain ``users`` row with no
homeowner_member, so it has nowhere to store a token. This table gives every
authenticated user a place to register one or more device tokens.

One row per ``(user_id, token)`` (a user may have several devices; the same
token may move between users on a shared device, so registration upserts on the
unique pair). ``push/sender.py`` resolves a recipient user's tokens from here in
addition to the existing homeowner ``notif_prefs`` path — the homeowner behaviour
is left untouched.
"""
from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PushToken(Base):
    __tablename__ = "push_tokens"
    __table_args__ = (
        UniqueConstraint("user_id", "token", name="uq_push_tokens_user_token"),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token: Mapped[str] = mapped_column(String, nullable=False)
    # 'ios' | 'android' | 'web' (informational; Expo tokens are platform-agnostic).
    platform: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
