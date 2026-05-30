"""Permit / government-approval endpoints (Phase B).

CRUD over the B0 ``permits`` table plus a per-site checklist view. A permit moves
through not_started -> applied -> under_review -> approved / rejected / expired.
Expiry/renewal/staleness alerting lives in :mod:`app.permits.alerts` (exposed as
the ``run_permit_sweep`` callable; not wired to the scheduler here).

Visibility mirrors sites: owner / pm see all company permits; other roles see
only permits on sites they are assigned to. All access is company-scoped.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.db import get_session
from app.models import Permit, PermitStatus, Site, User
from app.permits.schemas import PermitCreate, PermitOut, PermitUpdate
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/permits", tags=["permits"])


def _parse_limit(limit: int) -> int:
    if limit <= 0:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _decode(cursor: str | None) -> str | None:
    try:
        return decode_cursor(cursor)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc


async def _assert_site_visible(session: AsyncSession, user: User, site_id: UUID) -> None:
    visible = await effective_visible_site_ids(session, user)
    if site_id in visible:
        return
    site = await session.get(Site, site_id)
    if site is None or site.company_id != user.company_id:
        raise AppError(404, "not_found", "Site not found")
    raise AppError(403, "forbidden", "Site not in scope")


async def _scoped_permit_or_error(
    session: AsyncSession, user: User, permit_id: UUID
) -> Permit:
    permit = await session.get(Permit, permit_id)
    if permit is None or permit.company_id != user.company_id:
        raise AppError(404, "not_found", "Permit not found")
    visible = await effective_visible_site_ids(session, user)
    if permit.site_id not in visible:
        raise AppError(403, "forbidden", "Permit not in scope")
    return permit


def _permit_out(p: Permit) -> PermitOut:
    return PermitOut(
        id=p.id,
        company_id=p.company_id,
        site_id=p.site_id,
        permit_type=p.permit_type,
        authority=p.authority,
        status=p.status,
        applied_on=p.applied_on,
        expected_on=p.expected_on,
        decided_on=p.decided_on,
        expiry_on=p.expiry_on,
        reference_no=p.reference_no,
        notes=p.notes,
        created_by=p.created_by,
        created_at=p.created_at,
    )


# ---- CRUD ------------------------------------------------------------------


@router.post("", response_model=PermitOut, status_code=201)
async def create_permit(
    body: PermitCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PermitOut:
    await _assert_site_visible(session, user, body.site_id)
    permit = Permit(
        company_id=user.company_id,
        site_id=body.site_id,
        permit_type=body.permit_type,
        authority=body.authority,
        status=body.status or PermitStatus.not_started,
        applied_on=body.applied_on,
        expected_on=body.expected_on,
        decided_on=body.decided_on,
        expiry_on=body.expiry_on,
        reference_no=body.reference_no,
        notes=body.notes,
        created_by=user.id,
    )
    session.add(permit)
    await session.commit()
    return _permit_out(permit)


@router.get("", response_model=Page[PermitOut])
async def list_permits(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
    status: PermitStatus | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[PermitOut]:
    visible = await effective_visible_site_ids(session, user)
    if not visible:
        return Page[PermitOut](items=[], next_cursor=None)

    stmt = select(Permit).where(
        Permit.company_id == user.company_id, Permit.site_id.in_(visible)
    )
    if site_id is not None:
        stmt = stmt.where(Permit.site_id == site_id)
    if status is not None:
        stmt = stmt.where(Permit.status == status)

    page_size = _parse_limit(limit)
    after = _decode(cursor)
    stmt = stmt.order_by(Permit.id)
    if after is not None:
        stmt = stmt.where(Permit.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))
    return Page[PermitOut](items=[_permit_out(p) for p in rows], next_cursor=next_cursor)


@router.get("/checklist", response_model=Page[PermitOut])
async def site_permit_checklist(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID = Query(...),
    limit: int = Query(MAX_LIMIT),
    cursor: str | None = Query(None),
) -> Page[PermitOut]:
    """Per-site permits checklist: every permit for one site, ordered by type.

    The checklist is the operator's "are we legal to build?" view, so it returns
    permits in a stable, readable order rather than insertion order.
    """
    await _assert_site_visible(session, user, site_id)

    page_size = _parse_limit(limit)
    after = _decode(cursor)
    stmt = (
        select(Permit)
        .where(Permit.company_id == user.company_id, Permit.site_id == site_id)
        .order_by(Permit.permit_type, Permit.id)
    )
    if after is not None:
        stmt = stmt.where(Permit.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))
    return Page[PermitOut](items=[_permit_out(p) for p in rows], next_cursor=next_cursor)


@router.get("/{permit_id}", response_model=PermitOut)
async def get_permit(
    permit_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PermitOut:
    permit = await _scoped_permit_or_error(session, user, permit_id)
    return _permit_out(permit)


@router.patch("/{permit_id}", response_model=PermitOut)
async def update_permit(
    permit_id: UUID,
    body: PermitUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PermitOut:
    permit = await _scoped_permit_or_error(session, user, permit_id)
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(permit, field, value)
    await session.commit()
    return _permit_out(permit)


@router.delete("/{permit_id}", status_code=204)
async def delete_permit(
    permit_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    permit = await _scoped_permit_or_error(session, user, permit_id)
    await session.delete(permit)
    await session.commit()
