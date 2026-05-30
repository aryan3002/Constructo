"""ORM for team invites.

An owner/PM creates an Invite (phone + role, scoped to their company). It carries
a random URL-safe token used to build a WhatsApp/SMS join link. The invited user
opens the link, logs in (phone+OTP), and accepts — which materialises their User
row (or re-roles an existing one) inside the inviting company.

Registered on the shared Base.metadata like `app/sites/models.SiteAssignment`;
the test suite builds it via create_all (no new Alembic migration — per spec
B0 already created every core table + `user.language`).
"""
from datetime import datetime
from enum import StrEnum
from secrets import token_urlsafe
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models import UserRole


class InviteStatus(StrEnum):
    pending = "pending"
    accepted = "accepted"
    revoked = "revoked"


def _new_token() -> str:
    # 32 random bytes -> ~43 url-safe chars. Unguessable join token.
    return token_urlsafe(32)


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    invited_by: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    phone: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="user_role"), nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    token: Mapped[str] = mapped_column(
        String, nullable=False, unique=True, default=_new_token
    )
    status: Mapped[InviteStatus] = mapped_column(
        SAEnum(InviteStatus, name="invite_status"),
        nullable=False,
        default=InviteStatus.pending,
    )
    accepted_user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
