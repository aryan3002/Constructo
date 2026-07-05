"""Spec-Decision bridge.

When a designer routes a selection for owner approval a Decision row is
created in the approval inbox (or an existing one reopened). When the owner
approves or rejects the spec the linked Decision is synced via the shared
state-machine so the two ledgers stay consistent.

Reuses the same idempotency pattern as ``app/dashboard/router.py``
``create_decision``: find-by-client_decision_id first, fall through to
INSERT, catch IntegrityError on concurrent race.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.approvals.service import apply_action
from app.approvals.state_machine import DecisionAction
from app.models import Decision, DecisionKind, DecisionState, Spec, SpecApprovalStatus, User


def _client_decision_id(spec_id: UUID) -> str:
    """Stable idempotency key scoped to a spec's route event."""
    return f"spec:{spec_id}:route"


async def _find_by_client_id(
    session: AsyncSession, company_id: UUID, client_decision_id: str
) -> Decision | None:
    return (
        await session.execute(
            select(Decision).where(
                Decision.company_id == company_id,
                Decision.client_decision_id == client_decision_id,
            )
        )
    ).scalar_one_or_none()


async def sync_spec_routed_decision(
    session: AsyncSession,
    spec: Spec,
    actor: User,
) -> Decision:
    """Create (or reopen) the owner-inbox Decision that tracks this spec routing.

    - First call on a spec: creates a ``Decision(kind=approval, state=pending)``
      linked to the spec via ``spec_id`` and the idempotency key
      ``spec:<id>:route``.
    - Re-routing a returned/rejected spec: reopens the existing Decision back
      to ``pending`` so the owner sees it again (one row, not many).
    - Race-safe: catches IntegrityError on the unique (company_id,
      client_decision_id) constraint and re-fetches, exactly as the dashboard
      router does.
    """
    cid = _client_decision_id(spec.id)

    existing = await _find_by_client_id(session, spec.company_id, cid)
    if existing is not None:
        # Re-routing: reopen to pending so the owner sees it again.
        if existing.state != DecisionState.pending:
            existing.state = DecisionState.pending
            existing.resolved_at = None
            existing.resolution_note = None
            await session.commit()
            await session.refresh(existing)
        return existing

    title = f"Selection sign-off: {spec.label}"
    decision = Decision(
        company_id=spec.company_id,
        site_id=spec.site_id,
        spec_id=spec.id,
        kind=DecisionKind.approval,
        title=title,
        raised_by=actor.id,
        client_decision_id=cid,
        state=DecisionState.pending,
    )
    session.add(decision)
    try:
        await session.commit()
    except IntegrityError:
        # Concurrent race on the same (company_id, client_decision_id) —
        # the other request committed first; re-fetch and return that row.
        await session.rollback()
        existing = await _find_by_client_id(session, spec.company_id, cid)
        if existing is not None:
            return existing
        raise
    await session.refresh(decision)
    return decision


async def sync_spec_approved_decision(
    session: AsyncSession,
    spec: Spec,
) -> None:
    """After the spec approval status is set, sync the linked Decision state.

    - approved → resolve the Decision (idempotent via state-machine).
    - rejected → reject the Decision.
    - If no linked Decision exists (spec never routed) → no-op.
    """
    if spec.approval_status not in (
        SpecApprovalStatus.approved,
        SpecApprovalStatus.rejected,
    ):
        return

    cid = _client_decision_id(spec.id)
    decision = await _find_by_client_id(session, spec.company_id, cid)
    if decision is None:
        # Spec was approved without ever being routed — no decision to sync.
        return

    action = (
        DecisionAction.resolve
        if spec.approval_status == SpecApprovalStatus.approved
        else DecisionAction.reject
    )
    # apply_action is idempotent: already-resolved/rejected states are no-ops.
    await apply_action(session, decision, action)
