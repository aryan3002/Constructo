"""Phase B approvals/decisions with an SLA state machine.

Covers owner approvals AND homeowner questions routed to the owner. The SLA
clock (`sla_due_at`) and escalation transitions are driven by a feature agent;
this table stores the state.

`raised_by` is a nullable bare UUID (NOT an FK) because the raiser may be a
homeowner who is not a `users` row. `assigned_to` is likewise a bare UUID
(usually the owner's user id) to avoid coupling the SLA machine to the users
table. Both are intentionally FK-free.
"""
from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class DecisionKind(StrEnum):
    approval = "approval"
    homeowner_question = "homeowner_question"
    hold_payment = "hold_payment"
    generic = "generic"


class DecisionState(StrEnum):
    pending = "pending"
    acknowledged = "acknowledged"
    resolved = "resolved"
    rejected = "rejected"
    escalated = "escalated"


class Decision(Base):
    __tablename__ = "decisions"
    # Idempotency (CA8): a client-supplied key de-dupes the same logical action
    # (e.g. the owner's web chip + the mirrored WhatsApp action) into ONE row.
    # Scoped per company; NULLs are distinct in Postgres so keyless decisions
    # (the bulk of them) are unaffected.
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "client_decision_id",
            name="uq_decisions_company_client_decision_id",
        ),
    )

    id: Mapped[UUID] = mapped_column(PgUUID(as_uuid=True), primary_key=True, default=uuid4)
    company_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    # Client-generated idempotency key (nullable; only inline brief chips send it).
    client_decision_id: Mapped[str | None] = mapped_column(String, nullable=True)
    site_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="SET NULL"), nullable=True
    )
    # Link to the Spec that triggered this approval (nullable — most decisions are not
    # spec-linked). Used by route_spec to create an owner-visible approval and by
    # approve_spec to sync the decision state when the spec is committed or returned.
    spec_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("specs.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[DecisionKind] = mapped_column(
        SAEnum(DecisionKind, name="decision_kind"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Bare UUIDs (no FK): raiser may be a non-user homeowner; assignee is usually the owner.
    raised_by: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    assigned_to: Mapped[UUID | None] = mapped_column(PgUUID(as_uuid=True), nullable=True)
    state: Mapped[DecisionState] = mapped_column(
        SAEnum(DecisionState, name="decision_state"),
        nullable=False,
        server_default=DecisionState.pending.value,
    )
    sla_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_event_ids: Mapped[list[UUID]] = mapped_column(
        ARRAY(PgUUID(as_uuid=True)), nullable=False, server_default="{}"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
