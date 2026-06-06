"""Action Items — Phase 1.6 (chat → tracked to-do dashboard).

Manual creation (long-press a message → Make Action Item, or standalone) with an
owner, status, and due date; every lifecycle change writes an append-only
ActionItemEvent so the trail is auditable (and Standing Sentinel can chase
overdue items later). DELETE is a soft-cancel — a construction task's history is
never silently lost. AI-created items (``created_by_ai`` / the Phase-2
``propose_action_item`` tool) use the same lifecycle; any user may edit them.

Scope: the caller must be assigned to the site (owner/PM see all company sites).
"""
from __future__ import annotations

from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.models import (
    ActionItem,
    ActionItemEvent,
    ActionItemEventKind,
    ActionItemStatus,
    User,
    UserRole,
)
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/action-items", tags=["action-items"])


class ActionItemCreateIn(BaseModel):
    site_id: UUID
    title: str = Field(min_length=1, max_length=500)
    detail: str | None = None
    assignee_id: UUID | None = None
    due_on: date | None = None
    source_message_id: UUID | None = None


class ActionItemUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    detail: str | None = None
    assignee_id: UUID | None = None
    due_on: date | None = None
    status: ActionItemStatus | None = None


class ActionItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    site_id: UUID
    title: str
    detail: str | None
    status: ActionItemStatus
    created_by: UUID | None
    created_by_ai: bool
    assignee_id: UUID | None
    due_on: date | None
    source_message_id: UUID | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class ActionItemEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: ActionItemEventKind
    actor_id: UUID | None
    actor_is_ai: bool
    note: str | None
    created_at: datetime


class ActionItemDetailOut(ActionItemOut):
    log: list[ActionItemEventOut] = Field(default_factory=list)


async def _require_site(session: AsyncSession, user: User, site_id: UUID) -> None:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Homeowner action items are not available yet")
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "You are not assigned to this site")


def _log(
    session: AsyncSession,
    item: ActionItem,
    kind: ActionItemEventKind,
    actor: User,
    note: str | None = None,
) -> None:
    session.add(
        ActionItemEvent(
            action_item_id=item.id, kind=kind, actor_id=actor.id, note=note
        )
    )


async def _load_owned(session: AsyncSession, user: User, item_id: UUID) -> ActionItem:
    item = await session.get(ActionItem, item_id)
    if item is None:
        raise AppError(404, "not_found", "Action item not found")
    await _require_site(session, user, item.site_id)
    return item


@router.post("", response_model=ActionItemOut, status_code=201)
async def create_action_item(
    body: ActionItemCreateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ActionItemOut:
    await _require_site(session, user, body.site_id)
    item = ActionItem(
        company_id=user.company_id,
        site_id=body.site_id,
        title=body.title.strip(),
        detail=body.detail,
        created_by=user.id,
        assignee_id=body.assignee_id,
        due_on=body.due_on,
        source_message_id=body.source_message_id,
        status=ActionItemStatus.open,
    )
    session.add(item)
    await session.flush()
    _log(session, item, ActionItemEventKind.created, user)
    if body.assignee_id is not None:
        _log(session, item, ActionItemEventKind.assigned, user)
    await session.commit()
    await session.refresh(item)
    return ActionItemOut.model_validate(item)


@router.get("", response_model=list[ActionItemOut])
async def list_action_items(
    site_id: UUID = Query(...),
    status: ActionItemStatus | None = Query(None),
    mine: bool = Query(False, description="Only items assigned to me"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ActionItemOut]:
    await _require_site(session, user, site_id)
    stmt = select(ActionItem).where(ActionItem.site_id == site_id)
    if status is not None:
        stmt = stmt.where(ActionItem.status == status)
    if mine:
        stmt = stmt.where(ActionItem.assignee_id == user.id)
    # Open first, then by due date (nulls last), newest created last.
    stmt = stmt.order_by(ActionItem.status, ActionItem.due_on.nulls_last(), ActionItem.created_at)
    rows = (await session.execute(stmt)).scalars().all()
    return [ActionItemOut.model_validate(r) for r in rows]


@router.get("/{item_id}", response_model=ActionItemDetailOut)
async def get_action_item(
    item_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ActionItemDetailOut:
    item = await _load_owned(session, user, item_id)
    log = (
        await session.execute(
            select(ActionItemEvent)
            .where(ActionItemEvent.action_item_id == item.id)
            .order_by(ActionItemEvent.created_at)
        )
    ).scalars().all()
    out = ActionItemDetailOut.model_validate(item)
    out.log = [ActionItemEventOut.model_validate(e) for e in log]
    return out


@router.patch("/{item_id}", response_model=ActionItemOut)
async def update_action_item(
    item_id: UUID,
    body: ActionItemUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ActionItemOut:
    item = await _load_owned(session, user, item_id)
    data = body.model_dump(exclude_unset=True)

    if "assignee_id" in data and data["assignee_id"] != item.assignee_id:
        item.assignee_id = data["assignee_id"]
        _log(session, item, ActionItemEventKind.assigned, user)

    if "status" in data and data["status"] is not None and data["status"] != item.status:
        new_status = data["status"]
        item.status = new_status
        if new_status is ActionItemStatus.done:
            item.completed_at = datetime.now(UTC)
            _log(session, item, ActionItemEventKind.completed, user)
        elif new_status is ActionItemStatus.cancelled:
            _log(session, item, ActionItemEventKind.cancelled, user)
        else:  # back to open
            item.completed_at = None
            _log(session, item, ActionItemEventKind.reopened, user)

    edited = False
    for field in ("title", "detail", "due_on"):
        if field in data and getattr(item, field) != data[field]:
            value = data[field].strip() if field == "title" and data[field] else data[field]
            setattr(item, field, value)
            edited = True
    if edited:
        _log(session, item, ActionItemEventKind.edited, user)

    await session.commit()
    await session.refresh(item)
    return ActionItemOut.model_validate(item)


@router.delete("/{item_id}", response_model=ActionItemOut)
async def delete_action_item(
    item_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ActionItemOut:
    """Soft-delete: cancels the item (its audit trail is preserved — a task's
    history is never silently lost)."""
    item = await _load_owned(session, user, item_id)
    if item.status is not ActionItemStatus.cancelled:
        item.status = ActionItemStatus.cancelled
        _log(session, item, ActionItemEventKind.deleted, user)
    await session.commit()
    await session.refresh(item)
    return ActionItemOut.model_validate(item)
