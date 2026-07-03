"""One-nudge SLA sweep for homeowner requests.

A homeowner request carries an optional ``sla_due_at``. When it passes and the
request is still open, the sweep raises EXACTLY ONE nudge — a contractor-facing
:class:`Decision` (kind ``generic``) — and stamps ``nudged_at`` so a later sweep
never nudges the same request twice (the "one-nudge" rule, anti-spam).

Like :mod:`app.approvals.sla` and :mod:`app.permits.alerts`, this only exposes
the callable; wiring it onto the scheduler is H3's job. The clock is injected
(``now``) so tests are deterministic and never depend on wall-time.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    HomeownerRequest,
    HomeownerRequestStatus,
    Site,
)

# Stable prefix so a nudge Decision is recognisable (and never duplicated).
NUDGE_TAG = "[homeowner-request-nudge]"

_OPEN = (
    HomeownerRequestStatus.sent,
    HomeownerRequestStatus.seen,
    HomeownerRequestStatus.in_progress,
)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _request_decision(req: HomeownerRequest, company_id: UUID, *, overdue: bool) -> Decision:
    """The single contractor-facing Decision for a homeowner request. Tagged so
    it is recognisable and de-duplicated; surfaces in the owner Brief / approval
    inbox. ``overdue`` only changes the wording — immediate surfacing at creation
    vs SLA escalation — the row is otherwise identical either way."""
    lead = (
        "A homeowner request is overdue and still open. "
        if overdue
        else "A homeowner request is open and waiting for the team. "
    )
    return Decision(
        company_id=company_id,
        site_id=req.site_id,
        kind=DecisionKind.generic,
        title=f"{NUDGE_TAG}[{req.id}] {req.title}",
        detail=f"{lead}Original: {req.detail or req.title}",
        state=DecisionState.pending,
    )


async def surface_request_now(
    session: AsyncSession, req: HomeownerRequest, *, now: datetime | None = None
) -> bool:
    """Mark a freshly-created request as already surfaced so the overdue sweep
    never re-nudges it. The team-facing signal is the push fired by the router's
    ``_alert_site_leads`` at creation — we deliberately create NO shadow Decision
    (Option (a) de-pollution). Stamps ``nudged_at`` and returns ``False`` (never
    raises) if the site is missing. The caller owns the commit."""
    moment = _aware(now) if now is not None else datetime.now(UTC)
    site = await session.get(Site, req.site_id)
    if site is None:
        return False
    req.nudged_at = moment
    return True


async def run_request_nudge_sweep(
    session: AsyncSession, *, now: datetime | None = None
) -> list[UUID]:
    """Nudge overdue, still-open homeowner requests exactly once.

    Returns the ids of the requests nudged this run. Idempotent: a request with
    ``nudged_at`` already set is skipped.
    """
    moment = _aware(now) if now is not None else datetime.now(UTC)

    stmt = select(HomeownerRequest).where(
        HomeownerRequest.sla_due_at.is_not(None),
        HomeownerRequest.nudged_at.is_(None),
        HomeownerRequest.status.in_(_OPEN),
    )
    nudged: list[UUID] = []
    for req in (await session.execute(stmt)).scalars().all():
        due = _aware(req.sla_due_at) if req.sla_due_at else None
        if due is None or due > moment:
            continue
        site = await session.get(Site, req.site_id)
        if site is None:
            continue  # orphaned request; nothing to escalate to
        req.nudged_at = moment
        session.add(_request_decision(req, site.company_id, overdue=True))
        nudged.append(req.id)

    if nudged:
        await session.commit()
    return nudged
