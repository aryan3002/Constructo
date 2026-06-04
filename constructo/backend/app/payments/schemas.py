"""Pydantic request/response schemas for the Payments TRACKING module.

Constructo never moves money — these endpoints record money movements for
visibility and reconciliation only. ``method`` is informational free text
(upi/cash/cheque/bank). Endpoints never return ORM objects directly.
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import PaymentDirection, PaymentStatus


class PaymentCreate(BaseModel):
    direction: PaymentDirection
    counterparty_name: str = Field(min_length=1)
    amount: Decimal = Field(gt=0)
    paid_on: date
    site_id: UUID | None = None
    currency: str = "INR"
    method: str | None = None
    reference_no: str | None = None
    status: PaymentStatus | None = None
    notes: str | None = None
    source_event_id: UUID | None = None


class PaymentUpdate(BaseModel):
    direction: PaymentDirection | None = None
    counterparty_name: str | None = Field(default=None, min_length=1)
    amount: Decimal | None = Field(default=None, gt=0)
    paid_on: date | None = None
    site_id: UUID | None = None
    method: str | None = None
    reference_no: str | None = None
    status: PaymentStatus | None = None
    notes: str | None = None
    source_event_id: UUID | None = None


class PaymentOut(BaseModel):
    id: UUID
    company_id: UUID
    site_id: UUID | None
    direction: PaymentDirection
    counterparty_name: str
    amount: Decimal
    currency: str
    paid_on: date
    method: str | None
    reference_no: str | None
    status: PaymentStatus
    notes: str | None
    source_event_id: UUID | None
    created_by: UUID | None
    created_at: datetime


class LedgerTotals(BaseModel):
    """Running totals for a ledger view, in the canonical currency (INR)."""

    inflow: Decimal  # homeowner -> contractor (money coming in)
    outflow: Decimal  # contractor -> supplier (money going out)
    net: Decimal  # inflow - outflow
    count: int


class PaymentLedger(BaseModel):
    """A ledger view: scoped payments plus running in/out/net totals."""

    site_id: UUID | None
    totals: LedgerTotals
    items: list[PaymentOut]
    next_cursor: str | None = None


# --- financial tracking (W2.6 — display-only Quotation->Billed->Received->Outstanding)


class FinancialsOut(BaseModel):
    """A site's financial-tracking position. Quotation/billed are owner-stored;
    received = ledger inflow for the site; outstanding = billed - received."""

    site_id: UUID
    quotation: Decimal | None = None
    billed: Decimal | None = None
    received: Decimal
    outstanding: Decimal
    currency: str = "INR"


class FinancialsUpdate(BaseModel):
    """Set/clear a site's contract figures (owner/accountant). Only the fields
    present in the request are applied (PATCH semantics via exclude_unset)."""

    quotation_amount: Decimal | None = None
    billed_amount: Decimal | None = None
    currency: str | None = Field(default=None, max_length=8)
