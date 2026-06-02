"""Material reconciliation endpoints (Phase B).

Reconciliation derives delivery-vs-invoice matches from the existing
``site_events`` (no new tables, no migrations) and lets an accountant flag a
problem by creating a B0 ``Decision`` of kind ``hold_payment`` routed to the
company owner. All routes are auth'd and site-scoped exactly like ``app/sites``.
"""
import re
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    Site,
    SiteEventModel,
    User,
    UserRole,
)
from app.reconcile.matching import (
    DeliveryEvent,
    InvoiceEvent,
    ReconcileItem,
    draft_grn,
    reconcile,
)
from app.reconcile.schemas import (
    AccountantOverviewOut,
    EventSideOut,
    GrnDraftOut,
    HoldPaymentIn,
    HoldPaymentOut,
    MoneyExceptionOut,
    ReconcileItemOut,
    ReconcileListOut,
    ReconcileSiteSummaryOut,
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


# --- accountant overview (C4 — read-only) -----------------------------------


# Finance roles see EVERY company site's money slice (mirrors the payments
# "owner/pm/accountant see all payments" rule). Others see assigned sites only.
_FINANCE_ALL_SITES_ROLES = {UserRole.owner, UserRole.pm, UserRole.accountant}


def _summary_severity(s: ReconcileSummaryOut) -> int:
    """Worst-first sort key for a site summary: more bad rows = sorts first."""
    return s.mismatch * 3 + s.missing_proof * 2 + s.needs_approval


async def _overview_visible_site_ids(session: AsyncSession, user: User) -> list[UUID]:
    """Sites the caller may see money for: all company sites for finance roles,
    otherwise just the caller's assigned sites."""
    if user.role in _FINANCE_ALL_SITES_ROLES:
        rows = await session.execute(
            select(Site.id).where(Site.company_id == user.company_id)
        )
        return list(rows.scalars().all())
    return await effective_visible_site_ids(session, user)


@router.get("/overview", response_model=AccountantOverviewOut)
async def accountant_overview(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    window_days: int = Query(7, ge=0, le=60),
) -> AccountantOverviewOut:
    """The accountant's money cockpit across every visible site (read-only).

    Aggregates per-site reconciliation status (worst-first) and the open money
    exceptions (``hold_payment`` decisions already flagged). Tracking-only:
    nothing here moves money or resolves a flag — the accountant *sees* the
    worst money risks; the owner resolves them from the approvals inbox.
    """
    visible = await _overview_visible_site_ids(session, user)
    if not visible:
        return AccountantOverviewOut(sites=[], exceptions=[])
    visible_set = set(visible)

    sites = list(
        (
            await session.execute(
                select(Site).where(
                    Site.company_id == user.company_id,
                    Site.id.in_(visible),
                )
            )
        ).scalars().all()
    )
    site_name = {s.id: s.name for s in sites}

    # Pull all delivery/invoice events for the visible sites in one query.
    rows = (
        await session.execute(
            select(SiteEventModel).where(
                SiteEventModel.site_id.in_(visible),
                SiteEventModel.event_type.in_([_DELIVERY, _INVOICE]),
            )
        )
    ).scalars().all()

    per_site_events: dict[UUID, list[SiteEventModel]] = {sid: [] for sid in visible}
    for e in rows:
        per_site_events.setdefault(e.site_id, []).append(e)

    site_summaries: list[ReconcileSiteSummaryOut] = []
    total_at_risk = 0.0
    for sid in visible:
        events = per_site_events.get(sid, [])
        deliveries = [_to_delivery(e) for e in events if e.event_type == _DELIVERY]
        invoices = [_to_invoice(e) for e in events if e.event_type == _INVOICE]
        items = reconcile(deliveries, invoices, window_days=window_days)
        summary = ReconcileSummaryOut()
        for it in items:
            setattr(summary, it.status.value, getattr(summary, it.status.value) + 1)
            summary.total_amount_at_risk += it.amount_at_risk
        summary.total_amount_at_risk = round(summary.total_amount_at_risk, 2)
        total_at_risk += summary.total_amount_at_risk
        site_summaries.append(
            ReconcileSiteSummaryOut(
                site_id=sid,
                site_name=site_name.get(sid, ""),
                summary=summary,
            )
        )

    # Worst-first: most problem rows, then biggest money-at-risk.
    site_summaries.sort(
        key=lambda s: (_summary_severity(s.summary), s.summary.total_amount_at_risk),
        reverse=True,
    )

    # Open money exceptions = unresolved hold_payment decisions on visible sites.
    exc_rows = (
        await session.execute(
            select(Decision).where(
                Decision.company_id == user.company_id,
                Decision.kind == DecisionKind.hold_payment,
                Decision.state.in_([DecisionState.pending, DecisionState.escalated]),
            )
        )
    ).scalars().all()
    exceptions: list[MoneyExceptionOut] = []
    for d in exc_rows:
        if d.site_id is not None and d.site_id not in visible_set:
            continue
        exceptions.append(
            MoneyExceptionOut(
                decision_id=d.id,
                site_id=d.site_id,
                title=d.title,
                detail=d.detail,
                state=d.state.value,
                amount_at_risk=_risk_from_detail(d.detail),
                created_at=d.created_at,
            )
        )
    exceptions.sort(key=lambda e: e.created_at, reverse=True)

    return AccountantOverviewOut(
        total_amount_at_risk=round(total_at_risk, 2),
        open_exception_count=len(exceptions),
        sites=site_summaries,
        exceptions=exceptions,
    )


def _risk_from_detail(detail: str | None) -> float:
    """Best-effort recover the ₹-at-risk encoded in a hold_payment detail.

    ``hold_payment`` decisions encode the at-risk amount in their detail text
    ("…(₹8,400 at risk).") rather than a column; parse it back out for display.
    Returns 0.0 when no amount can be read (never raises — display-only).
    """
    if not detail:
        return 0.0
    m = re.search(r"₹\s*([\d,]+(?:\.\d+)?)", detail)
    if not m:
        return 0.0
    try:
        return float(m.group(1).replace(",", ""))
    except ValueError:
        return 0.0


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
