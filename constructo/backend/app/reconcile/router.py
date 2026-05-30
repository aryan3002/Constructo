"""Material reconciliation endpoints (Phase B).

Reconciliation derives delivery-vs-invoice matches from the existing
``site_events`` (no new tables, no migrations) and lets an accountant flag a
problem by creating a B0 ``Decision`` of kind ``hold_payment`` routed to the
company owner. All routes are auth'd and site-scoped exactly like ``app/sites``.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.models import Decision, DecisionKind, Site, SiteEventModel, User, UserRole
from app.reconcile.matching import (
    DeliveryEvent,
    InvoiceEvent,
    ReconcileItem,
    draft_grn,
    reconcile,
)
from app.reconcile.schemas import (
    EventSideOut,
    GrnDraftOut,
    HoldPaymentIn,
    HoldPaymentOut,
    ReconcileItemOut,
    ReconcileListOut,
    ReconcileSummaryOut,
)
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/reconcile", tags=["reconcile"])

_DELIVERY = "material_delivery"
_INVOICE = "invoice_received"


# --- scoping helpers --------------------------------------------------------


async def _require_site_in_scope(session: AsyncSession, user: User, site_id: UUID) -> Site:
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        site = await session.get(Site, site_id)
        if site is None:
            raise AppError(404, "not_found", "Site not found")
        raise AppError(403, "forbidden", "Site not in scope")
    site = await session.get(Site, site_id)
    if site is None:
        raise AppError(404, "not_found", "Site not found")
    return site


def _to_delivery(e: SiteEventModel) -> DeliveryEvent:
    f = e.fields or {}
    return DeliveryEvent(
        id=e.id,
        site_id=e.site_id,
        occurred_on=e.occurred_on,
        vendor=f.get("vendor"),
        material=f.get("material"),
        quantity=_as_float(f.get("quantity")),
        unit=f.get("unit"),
        summary=e.summary,
    )


def _to_invoice(e: SiteEventModel) -> InvoiceEvent:
    f = e.fields or {}
    return InvoiceEvent(
        id=e.id,
        site_id=e.site_id,
        occurred_on=e.occurred_on,
        vendor=f.get("vendor"),
        material=f.get("material"),
        quantity=_as_float(f.get("quantity")),
        amount=_as_float(f.get("amount")),
        currency=f.get("currency"),
        invoice_number=f.get("invoice_number"),
        summary=e.summary,
    )


def _as_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


async def _load_event(session: AsyncSession, event_id: UUID) -> SiteEventModel:
    ev = await session.get(SiteEventModel, event_id)
    if ev is None:
        raise AppError(404, "not_found", "Event not found")
    return ev


# --- reconcile listing ------------------------------------------------------


@router.get("/sites/{site_id}", response_model=ReconcileListOut)
async def reconcile_site(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    window_days: int = Query(7, ge=0, le=60),
) -> ReconcileListOut:
    """Derive the delivery-vs-invoice reconciliation for one site.

    Pulls the site's ``material_delivery`` and ``invoice_received`` events and
    runs the pure matcher. Returns exceptions-first (worst status, then biggest
    money-at-risk) so the accountant sees what needs action immediately.
    """
    await _require_site_in_scope(session, user, site_id)

    rows = (
        await session.execute(
            select(SiteEventModel).where(
                SiteEventModel.site_id == site_id,
                SiteEventModel.event_type.in_([_DELIVERY, _INVOICE]),
            )
        )
    ).scalars().all()

    deliveries = [_to_delivery(e) for e in rows if e.event_type == _DELIVERY]
    invoices = [_to_invoice(e) for e in rows if e.event_type == _INVOICE]
    by_id = {e.id: e for e in rows}

    items = reconcile(deliveries, invoices, window_days=window_days)

    summary = ReconcileSummaryOut()
    for it in items:
        setattr(summary, it.status.value, getattr(summary, it.status.value) + 1)
        summary.total_amount_at_risk += it.amount_at_risk
    summary.total_amount_at_risk = round(summary.total_amount_at_risk, 2)

    return ReconcileListOut(
        site_id=site_id,
        summary=summary,
        items=[_item_out(it, by_id) for it in items],
    )


def _item_out(it: ReconcileItem, by_id: dict[UUID, SiteEventModel]) -> ReconcileItemOut:
    return ReconcileItemOut(
        key=it.key,
        status=it.status,
        vendor=it.vendor,
        item=it.item,
        site_id=it.site_id,
        amount_at_risk=round(it.amount_at_risk, 2),
        reasons=it.reasons,
        delivery=_side_out(by_id[it.delivery.id]) if it.delivery else None,
        invoice=_side_out(by_id[it.invoice.id]) if it.invoice else None,
    )


def _side_out(e: SiteEventModel) -> EventSideOut:
    f = e.fields or {}
    return EventSideOut(
        event_id=e.id,
        occurred_on=e.occurred_on,
        vendor=f.get("vendor"),
        material=f.get("material"),
        quantity=_as_float(f.get("quantity")),
        unit=f.get("unit"),
        amount=_as_float(f.get("amount")),
        currency=f.get("currency"),
        invoice_number=f.get("invoice_number"),
        summary=e.summary,
        confidence=e.confidence,
        source_message_ids=list(e.source_message_ids or []),
    )


# --- GRN draft --------------------------------------------------------------


@router.get("/grn/{delivery_event_id}", response_model=GrnDraftOut)
async def grn_draft(
    delivery_event_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GrnDraftOut:
    """Draft a Goods Received Note from a single delivery event."""
    ev = await _load_event(session, delivery_event_id)
    if ev.event_type != _DELIVERY:
        raise AppError(422, "invalid_event", "Event is not a material delivery")
    await _require_site_in_scope(session, user, ev.site_id)

    grn = draft_grn(_to_delivery(ev))
    return GrnDraftOut(
        delivery_event_id=grn.delivery_event_id,
        site_id=grn.site_id,
        received_on=grn.received_on,
        vendor=grn.vendor,
        material=grn.material,
        quantity=grn.quantity,
        unit=grn.unit,
        reference=grn.reference,
        note=grn.note,
    )


# --- hold payment -> decision (B0) ------------------------------------------


@router.post("/hold-payment", response_model=HoldPaymentOut, status_code=201)
async def hold_payment(
    body: HoldPaymentIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> HoldPaymentOut:
    """Hold payment on a flagged row by creating a B0 ``Decision`` for the owner.

    The decision is kind ``hold_payment``, assigned to the company owner, and
    carries the offending event ids as ``evidence_event_ids`` so the owner can
    open the proof. No payment row is mutated here — this raises the question;
    the owner resolves it via the decisions/approvals surface.
    """
    if body.invoice_event_id is None and body.delivery_event_id is None:
        raise AppError(422, "invalid_request", "Provide an invoice or delivery event id")

    evidence_ids: list[UUID] = []
    site_id: UUID | None = None
    vendor: str | None = None

    if body.invoice_event_id is not None:
        inv = await _load_event(session, body.invoice_event_id)
        if inv.event_type != _INVOICE:
            raise AppError(422, "invalid_event", "Event is not an invoice")
        site_id = inv.site_id
        vendor = (inv.fields or {}).get("vendor")
        evidence_ids.append(inv.id)

    if body.delivery_event_id is not None:
        dlv = await _load_event(session, body.delivery_event_id)
        if dlv.event_type != _DELIVERY:
            raise AppError(422, "invalid_event", "Event is not a material delivery")
        if site_id is not None and dlv.site_id != site_id:
            raise AppError(422, "site_mismatch", "Delivery and invoice are on different sites")
        site_id = dlv.site_id
        vendor = vendor or (dlv.fields or {}).get("vendor")
        evidence_ids.append(dlv.id)

    # site_id is guaranteed set at this point (at least one event loaded).
    assert site_id is not None
    await _require_site_in_scope(session, user, site_id)

    owner = await _company_owner(session, user.company_id)

    vendor_label = vendor or "vendor"
    title = f"Hold payment to {vendor_label}"
    detail_parts = [f"Payment held pending review (₹{body.amount_at_risk:,.0f} at risk)."]
    if body.note:
        detail_parts.append(body.note)

    decision = Decision(
        company_id=user.company_id,
        site_id=site_id,
        kind=DecisionKind.hold_payment,
        title=title,
        detail=" ".join(detail_parts),
        raised_by=user.id,
        assigned_to=owner.id if owner else None,
        evidence_event_ids=evidence_ids,
    )
    session.add(decision)
    await session.commit()
    await session.refresh(decision)

    return HoldPaymentOut(
        decision_id=decision.id,
        state=decision.state.value,
        title=decision.title,
        assigned_to=decision.assigned_to,
        site_id=decision.site_id,
        amount_at_risk=body.amount_at_risk,
        created_at=decision.created_at,
    )


async def _company_owner(session: AsyncSession, company_id: UUID) -> User | None:
    """The user a hold-payment decision is routed to: the company owner."""
    row = await session.execute(
        select(User)
        .where(User.company_id == company_id, User.role == UserRole.owner)
        .order_by(User.id)
        .limit(1)
    )
    return row.scalar_one_or_none()
