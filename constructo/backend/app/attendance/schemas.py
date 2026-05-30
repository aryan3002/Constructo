"""Pydantic request/response schemas for the Attendance module.

Shapes mirror the field-capture flow: the app posts a headcount (optionally
per-trade) plus optional proof references; the API persists an ``attendance``
SiteEvent and answers with planned-vs-actual against the site baseline.
"""
from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

# ---- write: capture attendance ---------------------------------------------


class AttendanceCaptureIn(BaseModel):
    """Capture today's (or a given day's) attendance for a site.

    ``headcount`` is the total workers present. ``by_trade`` is an optional
    breakdown (e.g. ``{"mason": 6, "helper": 10}``). The app may attach a
    ``client_capture_id`` (its offline sync-queue id) so retries are idempotent,
    and ``proof_media_urls`` referencing photos/voice it already uploaded.
    """

    headcount: int = Field(ge=0, le=100_000)
    occurred_on: date | None = None
    by_trade: dict[str, int] | None = None
    note: str | None = Field(default=None, max_length=2000)
    source: str = Field(default="app", max_length=32)
    proof_media_urls: list[str] = Field(default_factory=list)
    # Offline-tolerant: the client's local queue id, echoed back so the app can
    # reconcile its optimistic row with the server's persisted event.
    client_capture_id: str | None = Field(default=None, max_length=128)


class AttendanceEventOut(BaseModel):
    """A persisted attendance event (read-shape)."""

    id: UUID
    site_id: UUID
    occurred_on: date
    headcount: int | None
    by_trade: dict[str, int] | None
    summary: str
    confidence: float
    needs_clarification: bool
    source: str
    proof_media_urls: list[str]
    client_capture_id: str | None
    version: int
    created_at: datetime


# ---- read: planned vs actual -----------------------------------------------


class PlannedVsActualOut(BaseModel):
    """Today's headcount versus the site's expected daily headcount baseline.

    ``status`` is on the shared status spine: ``ok`` when actual >= expected,
    ``warn`` for a small shortfall (within tolerance), ``risk`` for a large
    shortfall, ``info`` when no baseline is set yet. ``variance`` is
    ``actual - expected`` (negative = short).
    """

    site_id: UUID
    occurred_on: date
    expected: int | None
    actual: int
    variance: int | None
    status: str
    capture_count: int


# ---- read: mukadam own payment status --------------------------------------


class MyPaymentOut(BaseModel):
    """A payment recorded against the caller (counterparty), read-only.

    The mukadam never moves money here — this surfaces "proof = faster payment":
    what the contractor has recorded as paid/owed to them.
    """

    id: UUID
    site_id: UUID | None
    amount: str  # serialized Decimal to avoid float drift on money
    currency: str
    paid_on: date
    method: str | None
    status: str
    notes: str | None
    created_at: datetime
