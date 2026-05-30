"""Pydantic request/response schemas for the reconciliation module."""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.reconcile.matching import ReconcileStatus


class EventSideOut(BaseModel):
    """One side of a reconciliation row (a delivery or an invoice event)."""

    event_id: UUID
    occurred_on: date
    vendor: str | None
    material: str | None
    quantity: float | None
    unit: str | None = None
    amount: float | None = None
    currency: str | None = None
    invoice_number: str | None = None
    summary: str
    confidence: float
    source_message_ids: list[UUID] = Field(default_factory=list)


class ReconcileItemOut(BaseModel):
    """A derived reconciliation row for the accountant/owner to review."""

    key: str
    status: ReconcileStatus
    vendor: str | None
    item: str | None
    site_id: UUID
    amount_at_risk: float
    reasons: list[str]
    delivery: EventSideOut | None
    invoice: EventSideOut | None


class ReconcileSummaryOut(BaseModel):
    """Counts + total exposure for a reconciliation run (exceptions-first)."""

    matched: int = 0
    mismatch: int = 0
    missing_proof: int = 0
    needs_approval: int = 0
    total_amount_at_risk: float = 0.0


class ReconcileListOut(BaseModel):
    site_id: UUID
    summary: ReconcileSummaryOut
    items: list[ReconcileItemOut]


class GrnDraftOut(BaseModel):
    """A draft Goods Received Note pre-filled from a delivery event."""

    delivery_event_id: UUID
    site_id: UUID
    received_on: date
    vendor: str | None
    material: str | None
    quantity: float | None
    unit: str | None
    reference: str
    note: str


class HoldPaymentIn(BaseModel):
    """Request to hold payment on a flagged reconciliation row.

    At least one of the two event ids must be supplied so the resulting decision
    carries the evidence. ``note`` is an optional reason from the accountant.
    """

    invoice_event_id: UUID | None = None
    delivery_event_id: UUID | None = None
    amount_at_risk: float = 0.0
    note: str | None = None


class HoldPaymentOut(BaseModel):
    """The created B0 decision routed to the owner."""

    decision_id: UUID
    state: str
    title: str
    assigned_to: UUID | None
    site_id: UUID | None
    amount_at_risk: float
    created_at: datetime
