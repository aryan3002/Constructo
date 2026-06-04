"""Material/catalog master endpoints (W4.6).

Per-company material reference data for the Setup & Administration Materials
section. Reading is open to any member of the company; create/edit is owner/PM.
Materials are archived (``is_active=false``) rather than hard-deleted. Mirrors
``app/vendors/router.py``.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.materials.schemas import MaterialCreate, MaterialOut, MaterialUpdate
from app.models import Material, User, UserRole

router = APIRouter(prefix="/api/v1/materials", tags=["materials"])


@router.get("", response_model=list[MaterialOut])
async def list_materials(
    include_archived: bool = Query(False),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[MaterialOut]:
    stmt = select(Material).where(Material.company_id == user.company_id)
    if not include_archived:
        stmt = stmt.where(Material.is_active.is_(True))
    stmt = stmt.order_by(Material.name)
    rows = (await session.execute(stmt)).scalars().all()
    return [MaterialOut.model_validate(m) for m in rows]


@router.post("", response_model=MaterialOut, status_code=201)
async def create_material(
    body: MaterialCreate,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> MaterialOut:
    material = Material(company_id=user.company_id, **body.model_dump())
    session.add(material)
    await session.commit()
    await session.refresh(material)
    return MaterialOut.model_validate(material)


@router.patch("/{material_id}", response_model=MaterialOut)
async def update_material(
    material_id: UUID,
    body: MaterialUpdate,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> MaterialOut:
    material = await session.get(Material, material_id)
    if material is None or material.company_id != user.company_id:
        raise AppError(404, "not_found", "Material not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(material, field, value)
    await session.commit()
    await session.refresh(material)
    return MaterialOut.model_validate(material)
