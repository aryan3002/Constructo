"""In-app bell feed API — exceptions-only, per-role routed notifications."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.approvals.schemas import NotificationOut, UnreadCountOut
from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.models import CompanyNotificationSettings, User, UserRole
from app.notifications import feed, store

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[NotificationOut]:
    """The caller's bell feed: open decisions routed to them, newest first."""
    items = await feed.build_feed(
        session, company_id=user.company_id, recipient=user
    )
    return [
        NotificationOut(
            id=it.id,
            company_id=user.company_id,
            recipient_id=it.recipient_id,
            role=it.role.value,
            decision_id=it.decision_id,
            site_id=it.site_id,
            kind=it.kind,
            title=it.title,
            body=it.body,
            severity=it.severity,
            read_at=it.read_at,
            created_at=it.created_at,
        )
        for it in items
    ]


@router.get("/unread-count", response_model=UnreadCountOut)
async def get_unread_count(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UnreadCountOut:
    count = await feed.unread_count(
        session, company_id=user.company_id, recipient=user
    )
    return UnreadCountOut(unread=count)


@router.post("/{item_id}/read", status_code=204)
async def mark_notification_read(
    item_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Mark one feed item read for the caller (idempotent).

    Validates the item is actually in the caller's feed so a user can't mark
    arbitrary ids.
    """
    items = await feed.build_feed(
        session, company_id=user.company_id, recipient=user
    )
    if item_id not in {it.id for it in items}:
        raise AppError(404, "not_found", "Notification not found")
    store.mark_read(user.id, item_id)


# ---- notification & SLA settings (W4.7) ------------------------------------

DEFAULT_SLA_HOURS = 24


class NotificationSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sla_hours: int
    escalate_overdue: bool
    daily_digest: bool


class NotificationSettingsIn(BaseModel):
    """Partial update; only provided fields change."""

    sla_hours: int | None = Field(default=None, ge=1, le=168)
    escalate_overdue: bool | None = None
    daily_digest: bool | None = None


@router.get("/settings", response_model=NotificationSettingsOut)
async def get_notification_settings(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> NotificationSettingsOut:
    """The company's notification & SLA preferences (defaults if never set)."""
    row = (
        await session.execute(
            select(CompanyNotificationSettings).where(
                CompanyNotificationSettings.company_id == user.company_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return NotificationSettingsOut(
            sla_hours=DEFAULT_SLA_HOURS, escalate_overdue=True, daily_digest=True
        )
    return NotificationSettingsOut.model_validate(row)


@router.put("/settings", response_model=NotificationSettingsOut)
async def set_notification_settings(
    body: NotificationSettingsIn,
    owner: User = Depends(require_role(UserRole.owner)),
    session: AsyncSession = Depends(get_session),
) -> NotificationSettingsOut:
    """Owner-only: upsert the company's notification & SLA preferences. The SLA
    sweep honours ``escalate_overdue`` immediately."""
    row = (
        await session.execute(
            select(CompanyNotificationSettings).where(
                CompanyNotificationSettings.company_id == owner.company_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        row = CompanyNotificationSettings(company_id=owner.company_id)
        session.add(row)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await session.commit()
    await session.refresh(row)
    return NotificationSettingsOut.model_validate(row)
