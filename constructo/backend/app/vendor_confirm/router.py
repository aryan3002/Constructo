"""Vendor Confirm-Loop API (Phase 3.8) — no-install two-party-verified GRN.

  POST /api/v1/vendor-confirm            (crew)   create a confirm link for a vendor
  GET  /api/v1/vendor-confirm            (crew)   list a site's confirmations
  GET  /api/v1/vendor-confirm/{token}    (PUBLIC) the vendor's minimal claim view
  POST /api/v1/vendor-confirm/{token}/respond (PUBLIC) vendor confirms / disputes

The token IS the capability (no vendor install). The public view exposes only the
quantity claim — never prices, rates, or other site data. A confirmation the
vendor agrees to is a two-party-verified GRN. Cross-contractor reputation is
deliberately NOT built (gated — plan §7).
"""
from __future__ import annotations

import secrets
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.models import Site, User, UserRole, VendorConfirmation, VendorConfirmStatus
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/vendor-confirm", tags=["vendor-confirm"])


class CreateIn(BaseModel):
    site_id: UUID
    vendor_name: str = Field(min_length=1, max_length=200)
    event_id: UUID | None = None
    material: str | None = None
    claimed_qty: Decimal | None = None
    claimed_unit: str | None = None
    delivered_on: date | None = None


class ConfirmationOut(BaseModel):
    id: UUID
    site_id: UUID
    token: str
    vendor_name: str
    material: str | None
    claimed_qty: float | None
    claimed_unit: str | None
    status: VendorConfirmStatus
    response_qty: float | None
    response_note: str | None
    verified: bool
    confirm_path: str


class PublicView(BaseModel):
    """What the vendor sees — quantity claim only, no money."""
    vendor_name: str
    site_name: str
    material: str | None
    claimed_qty: float | None
    claimed_unit: str | None
    delivered_on: date | None
    status: VendorConfirmStatus
    already_responded: bool


class RespondIn(BaseModel):
    confirmed: bool
    qty: Decimal | None = None
    note: str | None = Field(default=None, max_length=2000)


def _verified(c: VendorConfirmation) -> bool:
    """Two-party-verified: vendor confirmed AND (no counter-qty, or it matches)."""
    if c.status is not VendorConfirmStatus.confirmed:
        return False
    if c.response_qty is None or c.claimed_qty is None:
        return True
    return c.response_qty == c.claimed_qty


def _out(c: VendorConfirmation) -> ConfirmationOut:
    return ConfirmationOut(
        id=c.id,
        site_id=c.site_id,
        token=c.token,
        vendor_name=c.vendor_name,
        material=c.material,
        claimed_qty=float(c.claimed_qty) if c.claimed_qty is not None else None,
        claimed_unit=c.claimed_unit,
        status=c.status,
        response_qty=float(c.response_qty) if c.response_qty is not None else None,
        response_note=c.response_note,
        verified=_verified(c),
        confirm_path=f"/vendor-confirm/{c.token}",
    )


@router.post("", response_model=ConfirmationOut, status_code=201)
async def create_confirmation(
    body: CreateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ConfirmationOut:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Not a crew surface")
    visible = await effective_visible_site_ids(session, user)
    if body.site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")

    c = VendorConfirmation(
        company_id=user.company_id,
        site_id=body.site_id,
        event_id=body.event_id,
        token=secrets.token_urlsafe(24),
        vendor_name=body.vendor_name.strip(),
        material=body.material,
        claimed_qty=body.claimed_qty,
        claimed_unit=body.claimed_unit,
        delivered_on=body.delivered_on,
        status=VendorConfirmStatus.pending,
        created_by=user.id,
    )
    session.add(c)
    await session.commit()
    await session.refresh(c)
    return _out(c)


@router.get("", response_model=list[ConfirmationOut])
async def list_confirmations(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConfirmationOut]:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Not a crew surface")
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")
    rows = (
        await session.execute(
            select(VendorConfirmation)
            .where(VendorConfirmation.site_id == site_id)
            .order_by(VendorConfirmation.created_at.desc())
        )
    ).scalars().all()
    return [_out(c) for c in rows]


# --- PUBLIC (token is the capability — no auth) ---------------------------


async def _by_token(session: AsyncSession, token: str) -> VendorConfirmation:
    c = (
        await session.execute(
            select(VendorConfirmation).where(VendorConfirmation.token == token)
        )
    ).scalar_one_or_none()
    if c is None:
        raise AppError(404, "not_found", "Link not found or expired")
    return c


@router.get("/{token}", response_model=PublicView)
async def public_view(
    token: str, session: AsyncSession = Depends(get_session)
) -> PublicView:
    c = await _by_token(session, token)
    site = await session.get(Site, c.site_id)
    return PublicView(
        vendor_name=c.vendor_name,
        site_name=site.name if site else "—",
        material=c.material,
        claimed_qty=float(c.claimed_qty) if c.claimed_qty is not None else None,
        claimed_unit=c.claimed_unit,
        delivered_on=c.delivered_on,
        status=c.status,
        already_responded=c.status is not VendorConfirmStatus.pending,
    )


@router.post("/{token}/respond", response_model=PublicView)
async def respond(
    token: str, body: RespondIn, session: AsyncSession = Depends(get_session)
) -> PublicView:
    c = await _by_token(session, token)
    if c.status is not VendorConfirmStatus.pending:
        raise AppError(409, "already_responded", "This link was already answered")
    c.status = VendorConfirmStatus.confirmed if body.confirmed else VendorConfirmStatus.disputed
    c.response_qty = body.qty
    c.response_note = (body.note or "").strip() or None
    c.responded_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(c)
    site = await session.get(Site, c.site_id)
    return PublicView(
        vendor_name=c.vendor_name,
        site_name=site.name if site else "—",
        material=c.material,
        claimed_qty=float(c.claimed_qty) if c.claimed_qty is not None else None,
        claimed_unit=c.claimed_unit,
        delivered_on=c.delivered_on,
        status=c.status,
        already_responded=True,
    )
