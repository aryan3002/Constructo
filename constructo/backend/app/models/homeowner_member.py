"""Homeowner membership + requests: HomeownerMember, HomeownerRequest (H0).

A *homeowner member* binds a person (eventually a ``users`` row) to a site with
a sub-role and per-member notification preferences. The contractor mints a member
(with a random ``join_code``); the person redeems the code via ``/homeowner/join``
to materialise their user and activate the membership (multi-member households).

A *homeowner request* is a homeowner-raised ask/issue tracked through
sent → seen → in_progress → done, with a single-nudge SLA clock.
"""
from datetime import datetime
from enum import StrEnum
from secrets import token_urlsafe
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class HomeownerSubRole(StrEnum):
    primary_owner = "primary_owner"
    co_owner = "co_owner"
    family = "family"
    advisor = "advisor"


class MemberStatus(StrEnum):
    invited = "invited"  # join code minted, not yet redeemed
    active = "active"  # redeemed → bound to a user


class HomeownerRequestStatus(StrEnum):
    sent = "sent"
    seen = "seen"
    in_progress = "in_progress"
    done = "done"


def _new_join_code() -> str:
    # Short, human-shareable join code (~11 chars). Unique per member.
    return token_urlsafe(8)


class HomeownerMember(Base):
    __tablename__ = "homeowner_members"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    # Null until the join code is redeemed and the user materialises.
    user_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    sub_role: Mapped[HomeownerSubRole] = mapped_column(
        SAEnum(HomeownerSubRole, name="homeowner_sub_role"),
        nullable=False,
        server_default=HomeownerSubRole.primary_owner.value,
    )
    notif_prefs: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    # The invited phone (informational; matching is by join_code).
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    join_code: Mapped[str] = mapped_column(
        String, nullable=False, unique=True, default=_new_join_code
    )
    status: Mapped[MemberStatus] = mapped_column(
        SAEnum(MemberStatus, name="homeowner_member_status"),
        nullable=False,
        server_default=MemberStatus.invited.value,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class HomeownerRequest(Base):
    __tablename__ = "homeowner_requests"

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    site_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False
    )
    # Bare UUID (the homeowner user id); FK-free to mirror the decisions table.
    raised_by: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[HomeownerRequestStatus] = mapped_column(
        SAEnum(HomeownerRequestStatus, name="homeowner_request_status"),
        nullable=False,
        server_default=HomeownerRequestStatus.sent.value,
    )
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set once the single nudge has fired, so the sweep never double-nudges.
    nudged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
