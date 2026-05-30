"""In-app bell feed API — exceptions-only, per-role routed notifications."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.approvals.schemas import NotificationOut, UnreadCountOut
from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.models import User
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
