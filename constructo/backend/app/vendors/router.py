"""Vendor master endpoints (W4.5).

Per-company supplier reference data for the Setup & Administration Vendors
section. Reading is open to any member of the company; create/edit is owner/PM
(procurement-adjacent), mirroring the user/site authority. Vendors are archived
(``is_active=false``) rather than hard-deleted so historical references resolve.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.common.errors import AppError
from app.db import get_session
from app.models import User, UserRole, Vendor
from app.reconcile.entities import Candidate, resolve_vendor
from app.vendors.schemas import VendorCreate, VendorOut, VendorUpdate

router = APIRouter(prefix="/api/v1/vendors", tags=["vendors"])


class VendorResolveIn(BaseModel):
    name: str | None = None
    phone: str | None = None
    gstin: str | None = None


class VendorResolveOut(BaseModel):
    decision: str  # "link" | "confirm" | "create"
    vendor_id: UUID | None = None
    score: float
    reason: str
    candidates: list[dict] = []


@router.post("/resolve", response_model=VendorResolveOut)
async def resolve_counterparty(
    body: VendorResolveIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> VendorResolveOut:
    """Entity resolver (2.5 prerequisite): match a free-text counterparty (from a
    captured invoice/delivery) to a registered Vendor — exact GSTIN/phone links,
    a partial name proposes a one-tap merge, no match suggests create. Nothing is
    silently merged on a weak match. Company-scoped."""
    vendors = (
        await session.execute(
            select(Vendor).where(Vendor.company_id == user.company_id, Vendor.is_active.is_(True))
        )
    ).scalars().all()
    candidates = [
        Candidate(id=str(v.id), name=v.name, phone=v.phone, gstin=v.gstin) for v in vendors
    ]
    m = resolve_vendor(body.name, candidates, phone=body.phone, gstin=body.gstin)
    return VendorResolveOut(
        decision=m.decision,
        vendor_id=UUID(m.vendor_id) if m.vendor_id else None,
        score=m.score,
        reason=m.reason,
        candidates=m.candidates,
    )


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
