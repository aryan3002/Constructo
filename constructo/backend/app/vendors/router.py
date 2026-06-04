"""Vendor master endpoints (W4.5).

Per-company supplier reference data for the Setup & Administration Vendors
section. Reading is open to any member of the company; create/edit is owner/PM
(procurement-adjacent), mirroring the user/site authority. Vendors are archived
(``is_active=false``) rather than hard-deleted so historical references resolve.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.models import User, UserRole, Vendor
from app.vendors.schemas import VendorCreate, VendorOut, VendorUpdate

router = APIRouter(prefix="/api/v1/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorOut])
async def list_vendors(
    include_archived: bool = Query(False),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[VendorOut]:
    stmt = select(Vendor).where(Vendor.company_id == user.company_id)
    if not include_archived:
        stmt = stmt.where(Vendor.is_active.is_(True))
    stmt = stmt.order_by(Vendor.name)
    rows = (await session.execute(stmt)).scalars().all()
    return [VendorOut.model_validate(v) for v in rows]


@router.post("", response_model=VendorOut, status_code=201)
async def create_vendor(
    body: VendorCreate,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> VendorOut:
    vendor = Vendor(company_id=user.company_id, **body.model_dump())
    session.add(vendor)
    await session.commit()
    await session.refresh(vendor)
    return VendorOut.model_validate(vendor)


@router.patch("/{vendor_id}", response_model=VendorOut)
async def update_vendor(
    vendor_id: UUID,
    body: VendorUpdate,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> VendorOut:
    vendor = await session.get(Vendor, vendor_id)
    if vendor is None or vendor.company_id != user.company_id:
        raise AppError(404, "not_found", "Vendor not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(vendor, field, value)
    await session.commit()
    await session.refresh(vendor)
    return VendorOut.model_validate(vendor)
