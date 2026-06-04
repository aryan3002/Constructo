"""Company billing-tracking endpoints (W4.8).

TRACKING-ONLY — no payment rail, no charges. Stores what the company records
about its plan and invoice contact. Read is open to any member; write is
owner-only. One row per company (created lazily on first PUT).
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.billing.schemas import BillingIn, BillingOut
from app.db import get_session
from app.models import CompanyBilling, User, UserRole

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])


async def _load(session: AsyncSession, company_id) -> CompanyBilling | None:
    return (
        await session.execute(
            select(CompanyBilling).where(CompanyBilling.company_id == company_id)
        )
    ).scalar_one_or_none()


@router.get("", response_model=BillingOut)
async def get_billing(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> BillingOut:
    """The company's billing-tracking record (empty defaults if never set)."""
    row = await _load(session, user.company_id)
    if row is None:
        return BillingOut(plan=None, billing_email=None, billing_contact=None, notes=None)
    return BillingOut.model_validate(row)


@router.put("", response_model=BillingOut)
async def set_billing(
    body: BillingIn,
    owner: User = Depends(require_role(UserRole.owner)),
    session: AsyncSession = Depends(get_session),
) -> BillingOut:
    """Owner-only: upsert the company's billing-tracking record (no payments)."""
    row = await _load(session, owner.company_id)
    if row is None:
        row = CompanyBilling(company_id=owner.company_id)
        session.add(row)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await session.commit()
    await session.refresh(row)
    return BillingOut.model_validate(row)
