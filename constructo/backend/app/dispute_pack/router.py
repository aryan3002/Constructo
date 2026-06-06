"""Tamper-Evident Dispute Pack API (Phase 3.6).

``GET  /api/v1/dispute-pack``      — assemble the hash-chained advance-adjustment
                                      case file for a counterparty.
``POST /api/v1/dispute-pack/ask``  — Ask-the-pack: deterministic money Q&A grounded
                                      ONLY in the pack's records (abstains otherwise).

v1 scope = the advance-adjustment case (plan §7): contractor→supplier payments vs
that supplier's invoices, netted by the tested ``compute_settlement``. Scoped
(``effective_visible_site_ids``, homeowner blocked). The chain is computed on read;
persisting a daily published head-hash is a follow-up.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.common.site_events import latest_event_clause
from app.db import get_session
from app.dispute_pack.pack import WATERMARK, answer_pack, hash_chain
from app.models import (
    Payment,
    PaymentDirection,
    SiteEventModel,
    User,
    UserRole,
)
from app.payments.advance import (
    CounterpartyInvoice,
    CounterpartyPayment,
    compute_settlement,
)
from app.reconcile.matching import normalize_text
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["dispute-pack"])


class SettlementOut(BaseModel):
    counterparty: str
    paid_out: float
    invoiced: float
    unadjusted_advance: float
    warn: bool
    message: str


class DisputePackOut(BaseModel):
    site_id: UUID
    counterparty: str
    record_count: int
    records: list[dict] = []
    settlement: SettlementOut
    head_hash: str
    watermark: str
    narrative: str


class PackAskIn(BaseModel):
    site_id: UUID
    counterparty: str
    question: str


class PackAskOut(BaseModel):
    answerable: bool
    answer: str


async def _assemble(session: AsyncSession, site_id: UUID, counterparty: str):
    key = normalize_text(counterparty)

    pay_rows = (
        await session.execute(
            select(Payment).where(
                Payment.site_id == site_id,
                Payment.direction == PaymentDirection.contractor_to_supplier,
            )
        )
    ).scalars().all()
    payments = [p for p in pay_rows if normalize_text(p.counterparty_name) == key]

    ev_rows = (
        await session.execute(
            select(SiteEventModel)
            .where(
                SiteEventModel.site_id == site_id,
                SiteEventModel.event_type == "invoice_received",
            )
            .where(latest_event_clause())
        )
    ).scalars().all()
    invoices = [
        e for e in ev_rows if normalize_text(str(e.fields.get("vendor") or "")) == key
    ]

    # Ordered, typed records — by date, payments then invoices on a tie.
    records: list[dict] = []
    for p in payments:
        records.append({
            "type": "payment",
            "id": str(p.id),
            "date": p.paid_on.isoformat(),
            "amount": float(p.amount),
            "status": p.status.value,
            "counterparty": p.counterparty_name,
        })
    for e in invoices:
        amt = e.fields.get("amount")
        records.append({
            "type": "invoice",
            "id": str(e.id),
            "date": e.occurred_on.isoformat(),
            "amount": float(amt) if isinstance(amt, (int, float)) else None,
            "invoice_number": e.fields.get("invoice_number"),
            "vendor": e.fields.get("vendor"),
        })
    records.sort(key=lambda r: (r["date"], 0 if r["type"] == "payment" else 1))

    settlement = compute_settlement(
        counterparty,
        [CounterpartyPayment(counterparty=p.counterparty_name, amount=p.amount) for p in payments],
        [
            CounterpartyInvoice(
                vendor=str(e.fields.get("vendor") or ""),
                amount=Decimal(str(e.fields.get("amount") or 0)),
            )
            for e in invoices
        ],
    )
    return records, settlement


@router.get("/dispute-pack", response_model=DisputePackOut)
async def dispute_pack(
    site_id: UUID,
    counterparty: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DisputePackOut:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Dispute packs are a crew-side surface")
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")

    records, settlement = await _assemble(session, site_id, counterparty)
    chained, head = hash_chain(records)
    return DisputePackOut(
        site_id=site_id,
        counterparty=counterparty,
        record_count=len(chained),
        records=chained,
        settlement=SettlementOut(
            counterparty=settlement.counterparty,
            paid_out=float(settlement.paid_out),
            invoiced=float(settlement.invoiced),
            unadjusted_advance=float(settlement.unadjusted_advance),
            warn=settlement.warn,
            message=settlement.message,
        ),
        head_hash=head,
        watermark=WATERMARK,
        narrative=settlement.message,
    )


@router.post("/dispute-pack/ask", response_model=PackAskOut)
async def dispute_pack_ask(
    body: PackAskIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> PackAskOut:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Dispute packs are a crew-side surface")
    visible = await effective_visible_site_ids(session, user)
    if body.site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")

    _records, settlement = await _assemble(session, body.site_id, body.counterparty)
    ans = answer_pack(body.question, settlement)
    return PackAskOut(answerable=ans.answerable, answer=ans.answer)
