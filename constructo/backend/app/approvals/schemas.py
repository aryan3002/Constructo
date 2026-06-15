"""Pydantic request/response schemas for the approvals & notifications API."""
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models import DecisionKind, DecisionState

# ---- decisions -------------------------------------------------------------


class DecisionCreate(BaseModel):
    title: str = Field(min_length=1)
    kind: DecisionKind = DecisionKind.approval
    detail: str | None = None
    site_id: UUID | None = None
    assigned_to: UUID | None = None
    raised_by: UUID | None = None
    sla_due_at: datetime | None = None
    evidence_event_ids: list[UUID] = Field(default_factory=list)


class DecisionResolveIn(BaseModel):
    """Body for resolve/reject/acknowledge. ``note`` is the resolution reason."""

    note: str | None = None


class DecisionRespondIn(BaseModel):
    """Body for the contractor/assignee respond endpoint (C3).

    Mirrors the homeowner ``respond`` shape but for the supervisor/PM side. The
    field client confirms an ask with ``confirm`` (== resolve); ``acknowledge``
    and ``reject`` are also accepted. ``client_response_id`` is an optional
    idempotency key the offline outbox attaches so a replay never conflicts (the
    underlying ``apply_action`` is already idempotent, so it is accepted and
    ignored server-side rather than persisted).
    """

    action: Literal["confirm", "acknowledge", "reject"] = "confirm"
    note: str | None = None
    client_response_id: str | None = None


class DecisionAssignIn(BaseModel):
    assigned_to: UUID


class BatchActionIn(BaseModel):
    """Apply one action to many decisions (inbox batch approve/reject)."""

    ids: list[UUID] = Field(min_length=1)
    note: str | None = None


class DecisionOut(BaseModel):
    id: UUID
    company_id: UUID
    site_id: UUID | None
    spec_id: UUID | None = None
    kind: DecisionKind
    title: str
    detail: str | None
    raised_by: UUID | None
    assigned_to: UUID | None
    state: DecisionState
    sla_due_at: datetime | None
    resolved_at: datetime | None
    resolution_note: str | None
    evidence_event_ids: list[UUID]
    created_at: datetime
    updated_at: datetime


class BatchResultOut(BaseModel):
    updated: list[UUID]
    skipped: list[UUID]


# ---- notifications ---------------------------------------------------------


class NotificationOut(BaseModel):
    id: UUID
    company_id: UUID
    recipient_id: UUID
    role: str | None
    decision_id: UUID | None
    site_id: UUID | None
    kind: str
    title: str
    body: str | None
    severity: str
    read_at: datetime | None
    created_at: datetime


class UnreadCountOut(BaseModel):
    unread: int


class SlaSweepOut(BaseModel):
    escalated: list[UUID]
