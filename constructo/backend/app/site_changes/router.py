"""Site-condition changes — the field → designer feedback loop.

A site engineer (supervisor) reports an as-built condition that diverges from the
design; the designer (architect) reviews it, optionally LINKS it to a drawing
revision, and RESOLVES it. Company-scoped; site visibility reuses
``effective_visible_site_ids`` (owner/pm/architect see all company sites, field
roles see assigned sites). No LLM, no scores — ``impact`` is a human note.
"""
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.models import SiteChange, SiteChangeStatus, User, UserRole
from app.site_changes.schemas import SiteChangeCreate, SiteChangeOut, SiteChangeUpdate
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/site-changes", tags=["site-changes"])

# The field engineer reports; the design authority reviews/links/resolves.
_REPORT_ROLES = (UserRole.supervisor, UserRole.owner, UserRole.pm, UserRole.architect)
_REVIEW_ROLES = (UserRole.architect, UserRole.owner, UserRole.pm)


async def _require_site(session: AsyncSession, user: User, site_id: UUID) -> None:
    if site_id not in await effective_visible_site_ids(session, user):
        raise AppError(403, "forbidden", "You are not assigned to this site")


async def _scoped_or_404(session: AsyncSession, user: User, change_id: UUID) -> SiteChange:
    change = await session.get(SiteChange, change_id)
    if change is None or change.company_id != user.company_id:
        raise AppError(404, "not_found", "Site change not found")
    if change.site_id not in await effective_visible_site_ids(session, user):
        raise AppError(403, "forbidden", "You are not assigned to this site")
    return change


@router.get("", response_model=list[SiteChangeOut])
async def list_site_changes(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(default=None),
    status: SiteChangeStatus | None = Query(default=None),
) -> list[SiteChangeOut]:
    """Site changes the caller can see, newest first. Optional site/status filter."""
    visible = await effective_visible_site_ids(session, user)
    if not visible:
        return []
    stmt = select(SiteChange).where(
        SiteChange.company_id == user.company_id, SiteChange.site_id.in_(visible)
    )
    if site_id is not None:
        stmt = stmt.where(SiteChange.site_id == site_id)
    if status is not None:
        stmt = stmt.where(SiteChange.status == status)
    stmt = stmt.order_by(SiteChange.created_at.desc())
    rows = (await session.execute(stmt)).scalars().all()
    return [SiteChangeOut.model_validate(c) for c in rows]


@router.post("", response_model=SiteChangeOut, status_code=201)
async def report_site_change(
    body: SiteChangeCreate,
    user: User = Depends(require_role(*_REPORT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SiteChangeOut:
    """Report a site-condition change (the field engineer)."""
    await _require_site(session, user, body.site_id)
    change = SiteChange(
        company_id=user.company_id,
        site_id=body.site_id,
        room=body.room,
        title=body.title,
        note=body.note,
        impact=body.impact,
        photo_url=body.photo_url,
        reported_by=user.id,
        status=SiteChangeStatus.new,
    )
    session.add(change)
    await session.commit()
    await session.refresh(change)
    return SiteChangeOut.model_validate(change)


@router.get("/{change_id}", response_model=SiteChangeOut)
async def get_site_change(
    change_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SiteChangeOut:
    return SiteChangeOut.model_validate(await _scoped_or_404(session, user, change_id))


@router.patch("/{change_id}", response_model=SiteChangeOut)
async def update_site_change(
    change_id: UUID,
    body: SiteChangeUpdate,
    user: User = Depends(require_role(*_REVIEW_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SiteChangeOut:
    """The designer reviews: link to a revision, edit the impact note, or resolve."""
    change = await _scoped_or_404(session, user, change_id)
    if body.impact is not None:
        change.impact = body.impact
    if body.linked_drawing_id is not None:
        change.linked_drawing_id = body.linked_drawing_id
        if change.status is SiteChangeStatus.new:
            change.status = SiteChangeStatus.linked
    if body.status is not None:
        change.status = body.status
        change.resolved_at = (
            datetime.now(UTC) if body.status is SiteChangeStatus.resolved else None
        )
    await session.commit()
    await session.refresh(change)
    return SiteChangeOut.model_validate(change)
