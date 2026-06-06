"""Contested-truth API (Safety rail 1.7) — raise / list / resolve / withdraw a
dispute against a ``SiteEvent``.

The invariant: **no silent overwrites**. Anyone on the site can *raise* a dispute
(mark an event contested); only a deciding authority (owner / PM) can *resolve*
it, and a resolution that changes the value writes a NEW superseding
``SiteEvent`` version — append-only and attributed — rather than mutating the
original. The dispute trail is the receipt. This lands before money-tier tools
(2.5), which must refuse to write against a contested event.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.models import (
    DisputeStatus,
    EventDispute,
    SiteEventModel,
    User,
    UserRole,
)
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["disputes"])

# Who may settle a contest (deciding authority). A resolution is always recorded
# and attributed — even an authority cannot silently overwrite a wage proof.
_RESOLVER_ROLES = {UserRole.owner, UserRole.pm}


class DisputeCreateIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)
    proposed_fields: dict | None = None


class DisputeResolveIn(BaseModel):
    resolution_note: str | None = Field(default=None, max_length=2000)
    # The agreed corrected fields. When present (and different), a superseding
    # SiteEvent version is written; when omitted, the original stands as-is.
    resolved_fields: dict | None = None


class DisputeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_id: UUID
    site_id: UUID
    raised_by: UUID | None
    raised_by_role: str | None
    reason: str
    proposed_fields: dict | None
    status: DisputeStatus
    resolved_by: UUID | None
    resolution_note: str | None
    resolved_fields: dict | None
    resolved_event_id: UUID | None
    created_at: datetime
    resolved_at: datetime | None


async def _require_site(session: AsyncSession, user: User, site_id: UUID) -> None:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Disputes are a crew-side surface")
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "You are not assigned to this site")


async def _load_event(session: AsyncSession, user: User, event_id: UUID) -> SiteEventModel:
    event = await session.get(SiteEventModel, event_id)
    if event is None:
        raise AppError(404, "not_found", "Event not found")
    await _require_site(session, user, event.site_id)
    return event


@router.post("/events/{event_id}/disputes", response_model=DisputeOut, status_code=201)
async def raise_dispute(
    event_id: UUID,
    body: DisputeCreateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DisputeOut:
    """Contest an event. Anyone assigned to the site may raise one; a user can't
    raise a second OPEN dispute on the same event (add to the existing one)."""
    event = await _load_event(session, user, event_id)

    dup = (
        await session.execute(
            select(EventDispute).where(
                EventDispute.event_id == event_id,
                EventDispute.raised_by == user.id,
                EventDispute.status == DisputeStatus.open,
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise AppError(409, "already_open", "You already have an open dispute on this event")

    dispute = EventDispute(
        company_id=user.company_id,
        site_id=event.site_id,
        event_id=event_id,
        raised_by=user.id,
        raised_by_role=user.role.value,
        reason=body.reason.strip(),
        proposed_fields=body.proposed_fields,
        status=DisputeStatus.open,
    )
    session.add(dispute)
    await session.commit()
    await session.refresh(dispute)
    return DisputeOut.model_validate(dispute)


@router.get("/events/{event_id}/disputes", response_model=list[DisputeOut])
async def list_disputes(
    event_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[DisputeOut]:
    await _load_event(session, user, event_id)
    rows = (
        await session.execute(
            select(EventDispute)
            .where(EventDispute.event_id == event_id)
            .order_by(EventDispute.created_at)
        )
    ).scalars().all()
    return [DisputeOut.model_validate(r) for r in rows]


@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeOut)
async def resolve_dispute(
    dispute_id: UUID,
    body: DisputeResolveIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DisputeOut:
    """Settle a contest (owner/PM only). A corrected value writes a NEW
    superseding ``SiteEvent`` version — never a silent overwrite."""
    dispute = await session.get(EventDispute, dispute_id)
    if dispute is None:
        raise AppError(404, "not_found", "Dispute not found")
    await _require_site(session, user, dispute.site_id)
    if user.role not in _RESOLVER_ROLES:
        raise AppError(403, "forbidden", "Only an owner or PM can resolve a dispute")
    if dispute.status is not DisputeStatus.open:
        raise AppError(409, "not_open", "Dispute is not open")

    event = await session.get(SiteEventModel, dispute.event_id)
    if event is None:
        raise AppError(404, "not_found", "Event not found")

    # A corrected value supersedes the original (append-only, attributed).
    if body.resolved_fields is not None and body.resolved_fields != event.fields:
        superseding = SiteEventModel(
            site_id=event.site_id,
            event_type=event.event_type,
            occurred_on=event.occurred_on,
            summary=event.summary,
            fields=body.resolved_fields,
            confidence=1.0,
            needs_clarification=False,
            source_message_ids=event.source_message_ids,
            version=event.version + 1,
            supersedes_event_id=event.id,
        )
        session.add(superseding)
        await session.flush()
        dispute.resolved_event_id = superseding.id
        dispute.resolved_fields = body.resolved_fields

    dispute.status = DisputeStatus.resolved
    dispute.resolved_by = user.id
    dispute.resolution_note = body.resolution_note
    dispute.resolved_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(dispute)
    return DisputeOut.model_validate(dispute)


@router.post("/disputes/{dispute_id}/withdraw", response_model=DisputeOut)
async def withdraw_dispute(
    dispute_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DisputeOut:
    """The raiser takes back an open dispute."""
    dispute = await session.get(EventDispute, dispute_id)
    if dispute is None:
        raise AppError(404, "not_found", "Dispute not found")
    await _require_site(session, user, dispute.site_id)
    if dispute.raised_by != user.id:
        raise AppError(403, "forbidden", "Only the person who raised it can withdraw it")
    if dispute.status is not DisputeStatus.open:
        raise AppError(409, "not_open", "Dispute is not open")
    dispute.status = DisputeStatus.withdrawn
    await session.commit()
    await session.refresh(dispute)
    return DisputeOut.model_validate(dispute)


async def event_is_contested(session: AsyncSession, event_id: UUID) -> bool:
    """True when an event has an OPEN dispute — money-tier tools (2.5) must check
    this and refuse to write against a contested event."""
    row = (
        await session.execute(
            select(EventDispute.id).where(
                EventDispute.event_id == event_id,
                EventDispute.status == DisputeStatus.open,
            )
        )
    ).first()
    return row is not None
