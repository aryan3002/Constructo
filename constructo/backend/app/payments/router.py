"""Payment TRACKING endpoints (Phase B).

Constructo records money movements (homeowner->contractor, contractor->supplier)
for visibility and reconciliation ONLY — it never moves money. ``method`` is
informational free text.

Visibility: owner / pm / accountant see every payment in their company (the
finance roles); other roles see only payments on sites they are assigned to.
Reads and writes are always company-scoped. A ledger endpoint exposes running
in/out/net totals per site or across all visible sites, and any payment can be
linked to the SiteEvent (e.g. a payment_request) it settles.
"""
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.db import get_session
from app.models import (
    Payment,
    PaymentDirection,
    PaymentStatus,
    Site,
    SiteEventModel,
    SiteFinancials,
    User,
    UserRole,
)
from app.payments.schemas import (
    FinancialsOut,
    FinancialsUpdate,
    LedgerTotals,
    PaymentCreate,
    PaymentLedger,
    PaymentOut,
    PaymentUpdate,
)
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])

# Finance roles see every company payment, even ones with no site or on a site
# they aren't individually assigned to. Mirrors the owner/accountant "sees all
# payments" rule in the founder spec.
_ALL_PAYMENTS_ROLES = {UserRole.owner, UserRole.pm, UserRole.accountant}


def _parse_limit(limit: int) -> int:
    if limit <= 0:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _decode(cursor: str | None) -> str | None:
    try:
        return decode_cursor(cursor)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc


def _sees_all_payments(user: User) -> bool:
    return user.role in _ALL_PAYMENTS_ROLES


async def _assert_site_in_company(
    session: AsyncSession, user: User, site_id: UUID | None
) -> None:
    if site_id is None:
        return
    site = await session.get(Site, site_id)
    if site is None or site.company_id != user.company_id:
        raise AppError(404, "not_found", "Site not found")


async def _assert_event_in_company(
    session: AsyncSession, user: User, event_id: UUID | None
) -> None:
    if event_id is None:
        return
    event = await session.get(SiteEventModel, event_id)
    if event is None:
        raise AppError(404, "not_found", "Source event not found")
    site = await session.get(Site, event.site_id)
    if site is None or site.company_id != user.company_id:
        raise AppError(404, "not_found", "Source event not found")


async def _scoped_payment_or_error(
    session: AsyncSession, user: User, payment_id: UUID
) -> Payment:
    payment = await session.get(Payment, payment_id)
    if payment is None or payment.company_id != user.company_id:
        raise AppError(404, "not_found", "Payment not found")
    if not _sees_all_payments(user):
        visible = await effective_visible_site_ids(session, user)
        if payment.site_id is None or payment.site_id not in visible:
            raise AppError(403, "forbidden", "Payment not in scope")
    return payment


def _payment_out(p: Payment) -> PaymentOut:
    return PaymentOut(
        id=p.id,
        company_id=p.company_id,
        site_id=p.site_id,
        direction=p.direction,
        counterparty_name=p.counterparty_name,
        amount=p.amount,
        currency=p.currency,
        paid_on=p.paid_on,
        method=p.method,
        reference_no=p.reference_no,
        status=p.status,
        notes=p.notes,
        source_event_id=p.source_event_id,
        created_by=p.created_by,
        created_at=p.created_at,
    )


async def _base_scoped_stmt(session: AsyncSession, user: User):
    """A SELECT over Payment limited to what `user` may see, before extra filters."""
    stmt = select(Payment).where(Payment.company_id == user.company_id)
    if not _sees_all_payments(user):
        visible = await effective_visible_site_ids(session, user)
        if not visible:
            return None  # caller returns an empty result
        stmt = stmt.where(Payment.site_id.in_(visible))
    return stmt


# ---- CRUD ------------------------------------------------------------------


@router.post("", response_model=PaymentOut, status_code=201)
async def create_payment(
    body: PaymentCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PaymentOut:
    await _assert_site_in_company(session, user, body.site_id)
    await _assert_event_in_company(session, user, body.source_event_id)

    payment = Payment(
        company_id=user.company_id,
        site_id=body.site_id,
        direction=body.direction,
        counterparty_name=body.counterparty_name,
        amount=body.amount,
        currency=body.currency or "INR",
        paid_on=body.paid_on,
        method=body.method,
        reference_no=body.reference_no,
        status=body.status or PaymentStatus.recorded,
        notes=body.notes,
        source_event_id=body.source_event_id,
        created_by=user.id,
    )
    session.add(payment)
    await session.commit()
    return _payment_out(payment)


@router.get("", response_model=Page[PaymentOut])
async def list_payments(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
    status: PaymentStatus | None = Query(None),
    direction: PaymentDirection | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[PaymentOut]:
    stmt = await _base_scoped_stmt(session, user)
    if stmt is None:
        return Page[PaymentOut](items=[], next_cursor=None)

    if site_id is not None:
        stmt = stmt.where(Payment.site_id == site_id)
    if status is not None:
        stmt = stmt.where(Payment.status == status)
    if direction is not None:
        stmt = stmt.where(Payment.direction == direction)

    page_size = _parse_limit(limit)
    after = _decode(cursor)
    stmt = stmt.order_by(Payment.id)
    if after is not None:
        stmt = stmt.where(Payment.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))
    return Page[PaymentOut](items=[_payment_out(p) for p in rows], next_cursor=next_cursor)


@router.get("/ledger", response_model=PaymentLedger)
async def payment_ledger(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> PaymentLedger:
    """Ledger view: per-site (``site_id``) or cross-site running totals + rows.

    Totals cover the entire scoped/filtered set (not just the current page) so
    the Cash pulse always reflects the true in/out/net. Disputed payments are
    excluded from totals but still listed.
    """
    stmt = await _base_scoped_stmt(session, user)
    if stmt is None:
        return PaymentLedger(
            site_id=site_id,
            totals=LedgerTotals(
                inflow=Decimal("0"), outflow=Decimal("0"), net=Decimal("0"), count=0
            ),
            items=[],
            next_cursor=None,
        )
    if site_id is not None:
        stmt = stmt.where(Payment.site_id == site_id)

    ordered = stmt.order_by(Payment.paid_on, Payment.id)
    all_rows = list((await session.execute(ordered)).scalars().all())
    totals = _compute_totals(all_rows)

    page_size = _parse_limit(limit)
    after = _decode(cursor)
    page_rows = all_rows
    if after is not None:
        after_id = UUID(after)
        seen = False
        sliced: list[Payment] = []
        for r in all_rows:
            if seen:
                sliced.append(r)
            if r.id == after_id:
                seen = True
        page_rows = sliced
    next_cursor = None
    if len(page_rows) > page_size:
        next_cursor = encode_cursor(str(page_rows[page_size - 1].id))
        page_rows = page_rows[:page_size]

    return PaymentLedger(
        site_id=site_id,
        totals=totals,
        items=[_payment_out(p) for p in page_rows],
        next_cursor=next_cursor,
    )


# --- financial tracking (W2.6 — display-only, no rail) ----------------------

_FINANCIALS_EDIT_ROLES = {UserRole.owner, UserRole.accountant}


async def _site_received(session: AsyncSession, company_id: UUID, site_id: UUID) -> Decimal:
    """Money received for a site = inflow (homeowner->contractor), disputed
    excluded. Computed from the ledger so it's always consistent with payments."""
    rows = list(
        (
            await session.execute(
                select(Payment).where(
                    Payment.company_id == company_id, Payment.site_id == site_id
                )
            )
        ).scalars().all()
    )
    return _compute_totals(rows).inflow


def _financials_out(site_id: UUID, fin: SiteFinancials | None, received: Decimal) -> FinancialsOut:
    billed = fin.billed_amount if fin else None
    outstanding = (billed if billed is not None else Decimal("0")) - received
    return FinancialsOut(
        site_id=site_id,
        quotation=fin.quotation_amount if fin else None,
        billed=billed,
        received=received,
        outstanding=outstanding,
        currency=(fin.currency if fin else "INR"),
    )


@router.get("/financials/{site_id}", response_model=FinancialsOut)
async def get_financials(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FinancialsOut:
    """A site's financial-tracking position (Quotation/Billed stored;
    Received = ledger inflow; Outstanding = Billed - Received). Display only."""
    await _assert_site_in_company(session, user, site_id)
    fin = (
        await session.execute(
            select(SiteFinancials).where(SiteFinancials.site_id == site_id)
        )
    ).scalar_one_or_none()
    received = await _site_received(session, user.company_id, site_id)
    return _financials_out(site_id, fin, received)


@router.put("/financials/{site_id}", response_model=FinancialsOut)
async def set_financials(
    site_id: UUID,
    body: FinancialsUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FinancialsOut:
    """Set a site's contract figures (owner/accountant). Tracking only — never
    moves money. Only fields present in the request are applied."""
    if user.role not in _FINANCIALS_EDIT_ROLES:
        raise AppError(403, "forbidden", "Only the owner or accountant can set financials")
    await _assert_site_in_company(session, user, site_id)

    fin = (
        await session.execute(
            select(SiteFinancials).where(SiteFinancials.site_id == site_id)
        )
    ).scalar_one_or_none()
    if fin is None:
        fin = SiteFinancials(site_id=site_id)
        session.add(fin)

    patch = body.model_dump(exclude_unset=True)
    if "quotation_amount" in patch:
        fin.quotation_amount = patch["quotation_amount"]
    if "billed_amount" in patch:
        fin.billed_amount = patch["billed_amount"]
    if patch.get("currency"):
        fin.currency = patch["currency"]
    fin.updated_by = user.id

    await session.commit()
    await session.refresh(fin)

    received = await _site_received(session, user.company_id, site_id)
    return _financials_out(site_id, fin, received)


@router.get("/{payment_id}", response_model=PaymentOut)
async def get_payment(
    payment_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PaymentOut:
    payment = await _scoped_payment_or_error(session, user, payment_id)
    return _payment_out(payment)


@router.patch("/{payment_id}", response_model=PaymentOut)
async def update_payment(
    payment_id: UUID,
    body: PaymentUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PaymentOut:
    payment = await _scoped_payment_or_error(session, user, payment_id)
    data = body.model_dump(exclude_unset=True)
    if "site_id" in data:
        await _assert_site_in_company(session, user, data["site_id"])
    if "source_event_id" in data:
        await _assert_event_in_company(session, user, data["source_event_id"])
    for field, value in data.items():
        setattr(payment, field, value)
    await session.commit()
    return _payment_out(payment)


@router.delete("/{payment_id}", status_code=204)
async def delete_payment(
    payment_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    payment = await _scoped_payment_or_error(session, user, payment_id)
    await session.delete(payment)
    await session.commit()


# ---- pure ledger math (unit-testable, no I/O) ------------------------------


def _compute_totals(payments: list[Payment]) -> LedgerTotals:
    """Sum inflow/outflow/net over payments. Disputed rows are excluded from
    totals (a disputed amount is not trustworthy money) but counted in ``count``
    is the number of payments in the set including disputed."""
    inflow = Decimal("0")
    outflow = Decimal("0")
    for p in payments:
        if p.status == PaymentStatus.disputed:
            continue
        if p.direction == PaymentDirection.homeowner_to_contractor:
            inflow += p.amount
        elif p.direction == PaymentDirection.contractor_to_supplier:
            outflow += p.amount
    return LedgerTotals(
        inflow=inflow,
        outflow=outflow,
        net=inflow - outflow,
        count=len(payments),
    )
