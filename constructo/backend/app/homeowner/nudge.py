"""One-nudge SLA sweep for homeowner requests.

A homeowner request carries an optional ``sla_due_at``. When it passes and the
request is still open, the sweep raises EXACTLY ONE nudge and stamps
``nudged_at`` so a later sweep never nudges the same request twice (the
"one-nudge" rule, anti-spam). The nudge is a push notification to the site's
leads (company owner/PM), NOT a shadow Decision — see
:func:`app.homeowner.router._alert_site_leads` for the identical at-creation
path.

Like :mod:`app.approvals.sla` and :mod:`app.permits.alerts`, this only exposes
the callable; wiring it onto the scheduler is H3's job. The clock is injected
(``now``) so tests are deterministic and never depend on wall-time.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    HomeownerRequest,
    HomeownerRequestStatus,
    Site,
    User,
    UserRole,
)

# Legacy tag prefix from the retired shadow-Decision nudge. Kept only so the
# router's decision-surface filters and the one-off cleanup script can still
# recognise (and purge) any pre-existing tagged Decision rows from before this
# module switched to pushing site leads directly.
NUDGE_TAG = "[homeowner-request-nudge]"

_OPEN = (
    HomeownerRequestStatus.sent,
    HomeownerRequestStatus.seen,
    HomeownerRequestStatus.in_progress,
)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


async def _push_overdue_nudge(session: AsyncSession, req: HomeownerRequest, site: Site) -> None:
    """Push the site's leads (company owner/PM) that an open homeowner request is
    overdue — Option (a): a real notification, never a shadow Decision. Mirrors
    ``app.homeowner.router._alert_site_leads``; best-effort, never raises."""
    from app.push.sender import notify_user

    lead_ids = (
        await session.execute(
            select(User.id).where(
                User.company_id == site.company_id,
                User.role.in_([UserRole.owner, UserRole.pm]),
            )
        )
    ).scalars().all()
    for uid in lead_ids:
        await notify_user(
            session,
            uid,
            "Homeowner request overdue",
            f"Still open: {req.title}",
            data={
                "type": "homeowner_request",
                "request_id": str(req.id),
                "site_id": str(req.site_id),
                "overdue": True,
            },
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
        try:
            await _push_overdue_nudge(session, req, site)
        except Exception:  # pragma: no cover - defensive
            # Isolate one request's push failure from the rest of the batch —
            # mirrors app.homeowner.router._alert_site_leads (log-and-continue,
            # never let a notify hiccup fail the whole sweep). The nudged_at
            # stamp above is kept either way: this stays a best-effort,
            # one-nudge-per-request rule, not a retry-until-success one — a
            # request whose push failed is not re-nudged on the next sweep.
            logging.getLogger(__name__).exception(
                "push_overdue_nudge failed for request %s", req.id
            )
        nudged.append(req.id)

    if nudged:
        await session.commit()
    return nudged
