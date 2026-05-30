"""Decision-ledger operations: create, fetch, and apply state transitions.

Thin layer over the pure :mod:`app.approvals.state_machine`. Applying an action
is idempotent — a no-op transition (e.g. resolving an already-resolved row)
commits nothing new and returns the row unchanged, so the same ledger record can
be settled from the dashboard or a WhatsApp reply without conflict.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.approvals.state_machine import (
    DecisionAction,
    InvalidTransition,
    next_state,
)
from app.common.errors import AppError
from app.models import Decision, DecisionState


async def apply_action(
    session: AsyncSession,
    decision: Decision,
    action: DecisionAction,
    *,
    note: str | None = None,
    now: datetime | None = None,
) -> Decision:
    """Apply ``action`` to ``decision`` and persist. Idempotent + validated."""
    moment = now or datetime.now(UTC)
    current = decision.state
    try:
        target = next_state(current, action)
    except InvalidTransition as exc:
        raise AppError(409, "invalid_transition", str(exc)) from exc

    if target == current:
        # Idempotent no-op (e.g. re-resolving). Still record a late note.
        if note and not decision.resolution_note:
            decision.resolution_note = note
            await session.commit()
        return decision

    decision.state = target
    if note:
        decision.resolution_note = note
    if target in (DecisionState.resolved, DecisionState.rejected):
        decision.resolved_at = moment
    await session.commit()
    await session.refresh(decision)
    return decision


async def assign(
    session: AsyncSession, decision: Decision, assigned_to: UUID
) -> Decision:
    decision.assigned_to = assigned_to
    await session.commit()
    await session.refresh(decision)
    return decision
