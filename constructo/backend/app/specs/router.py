"""Material Specification line items (the Spec engine).

A Spec is a material instance bound to a component/wall. Reads are open to any
company member; create/edit is owner/pm/supervisor; approval is owner/pm.
Company-scoped, mirroring app/materials/router.py.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.models import Spec, User, UserRole
from app.specs.schemas import SpecApprove, SpecCreate, SpecOut, SpecUpdate

router = APIRouter(prefix="/api/v1/specs", tags=["specs"])

_EDIT_ROLES = (UserRole.owner, UserRole.pm, UserRole.supervisor)
_APPROVE_ROLES = (UserRole.owner, UserRole.pm)


@router.get("", response_model=list[SpecOut])
async def list_specs(
    site_id: UUID = Query(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[SpecOut]:
    stmt = (
        select(Spec)
        .where(Spec.company_id == user.company_id, Spec.site_id == site_id)
        .order_by(Spec.created_at)
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [SpecOut.model_validate(s) for s in rows]


@router.post("", response_model=SpecOut, status_code=201)
async def create_spec(
    body: SpecCreate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = Spec(company_id=user.company_id, **body.model_dump())
    session.add(spec)
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)


@router.get("/{spec_id}", response_model=SpecOut)
async def get_spec(
    spec_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    return SpecOut.model_validate(spec)


@router.patch("/{spec_id}", response_model=SpecOut)
async def update_spec(
    spec_id: UUID,
    body: SpecUpdate,
    user: User = Depends(require_role(*_EDIT_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(spec, field, value)
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)


@router.post("/{spec_id}/approve", response_model=SpecOut)
async def approve_spec(
    spec_id: UUID,
    body: SpecApprove,
    user: User = Depends(require_role(*_APPROVE_ROLES)),
    session: AsyncSession = Depends(get_session),
) -> SpecOut:
    spec = await session.get(Spec, spec_id)
    if spec is None or spec.company_id != user.company_id:
        raise AppError(404, "not_found", "Spec not found")
    spec.approval_status = body.status
    if body.client_final_code is not None:
        spec.client_final_code = body.client_final_code
    await session.commit()
    await session.refresh(spec)
    return SpecOut.model_validate(spec)
