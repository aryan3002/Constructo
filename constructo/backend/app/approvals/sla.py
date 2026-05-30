"""SLA escalation sweep for homeowner questions (and any SLA-bearing decision).

``run_sla_sweep`` finds open decisions whose ``sla_due_at`` has passed and
escalates them (state → ``escalated``), raising at most one nudge per recipient
per decision (anti-spam, via :mod:`app.notifications.store`).

The clock is injected (``now``) so tests are deterministic and never depend on
wall-time. The scheduler can call ``run_sla_sweep(session)`` on an interval —
this module only exposes the callable; wiring the scheduler is out of scope.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Decision, DecisionState
from app.notifications import feed, store


def _aware(dt: datetime) -> datetime:
    """Normalise to tz-aware UTC so comparisons never raise."""
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


async def run_sla_sweep(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    company_id: UUID | None = None,
) -> list[UUID]:
    """Escalate open, past-due decisions. Returns the escalated decision ids.

    Idempotent: an already-escalated decision is skipped, and the anti-spam
    store ensures repeated sweeps don't re-nudge. Pass ``now`` for deterministic
    tests; pass ``company_id`` to scope a single tenant (the scheduler can loop
    companies or omit it to sweep all).
    """
    moment = _aware(now) if now is not None else datetime.now(UTC)

    stmt = select(Decision).where(
        Decision.sla_due_at.is_not(None),
        Decision.state.in_([DecisionState.pending, DecisionState.acknowledged]),
    )
    if company_id is not None:
        stmt = stmt.where(Decision.company_id == company_id)

    escalated: list[UUID] = []
    for decision in (await session.execute(stmt)).scalars().all():
        due = _aware(decision.sla_due_at) if decision.sla_due_at else None
        if due is None or due > moment:
            continue
        decision.state = DecisionState.escalated
        escalated.append(decision.id)

        # Raise one nudge per recipient who owns this decision (anti-spam).
        recipients = await feed._recipients_for(
            session, decision.company_id, decision
        )
        for recipient in recipients:
            store.should_nudge(recipient.id, decision.id)

    if escalated:
        await session.commit()
    return escalated
