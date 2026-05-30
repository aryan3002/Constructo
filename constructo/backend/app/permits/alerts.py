"""Permit expiry / renewal / staleness alert logic.

The classification is a PURE function (:func:`classify_permit`) that takes an
explicit ``today`` so tests are fully deterministic and network-free. The sweep
runner (:func:`run_permit_sweep`) wraps it with persistence: for each company's
permits it raises a :class:`Decision` (kind ``generic``) per actionable alert,
de-duplicating against alerts already raised for the same permit + reason.

This module is intentionally NOT wired into the scheduler — it only exposes the
callable, matching ``app/brief/schedule.py``'s shape so a scheduler agent can
register it later.
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models import Company, Decision, DecisionKind, DecisionState, Permit, PermitStatus

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]

# Windows (days). Tunable; chosen for India SMB permitting cadence.
EXPIRY_SOON_DAYS = 30  # warn when a valid permit expires within this window
STALE_REVIEW_DAYS = 21  # an under_review permit untouched this long is stale
STALE_APPLIED_DAYS = 14  # an applied permit with no movement this long is stale


class PermitAlertReason(StrEnum):
    expired = "expired"  # expiry_on is in the past (but status not yet expired)
    expiring_soon = "expiring_soon"  # expiry_on within EXPIRY_SOON_DAYS
    stale_review = "stale_review"  # under_review with no decision past window
    stale_applied = "stale_applied"  # applied with no movement past window
    overdue_expected = "overdue_expected"  # expected_on passed, still undecided


# Stable prefix so the sweep can recognise (and not duplicate) its own alerts.
ALERT_TAG = "[permit-alert]"


@dataclass(frozen=True)
class PermitAlert:
    permit_id: UUID
    site_id: UUID
    reason: PermitAlertReason
    title: str
    detail: str
    severity: str  # "risk" | "warn" — informational for the UI


def _ref(permit: Permit) -> str:
    return f"{permit.permit_type} ({permit.authority})"


def classify_permit(permit: Permit, today: date) -> list[PermitAlert]:
    """Return the actionable alerts for one permit as of ``today`` (pure).

    Terminal states (approved-with-no-expiry, rejected, already-expired) raise
    nothing except the live expiry warnings on an approved permit that still has
    a future/near expiry.
    """
    alerts: list[PermitAlert] = []
    status = permit.status

    # Rejected / not-started permits have no time-based obligations to chase.
    if status in (PermitStatus.rejected, PermitStatus.not_started, PermitStatus.expired):
        return alerts

    # Expiry: applies to approved permits that carry an expiry date.
    if permit.expiry_on is not None and status == PermitStatus.approved:
        days = (permit.expiry_on - today).days
        if days < 0:
            alerts.append(
                PermitAlert(
                    permit_id=permit.id,
                    site_id=permit.site_id,
                    reason=PermitAlertReason.expired,
                    title=f"Permit expired: {_ref(permit)}",
                    detail=(
                        f"{_ref(permit)} expired on {permit.expiry_on.isoformat()} "
                        f"({-days} day(s) ago). Renew immediately."
                    ),
                    severity="risk",
                )
            )
        elif days <= EXPIRY_SOON_DAYS:
            alerts.append(
                PermitAlert(
                    permit_id=permit.id,
                    site_id=permit.site_id,
                    reason=PermitAlertReason.expiring_soon,
                    title=f"Permit expiring soon: {_ref(permit)}",
                    detail=(
                        f"{_ref(permit)} expires on {permit.expiry_on.isoformat()} "
                        f"(in {days} day(s)). Start renewal."
                    ),
                    severity="warn",
                )
            )

    # Staleness: an application that has stopped moving.
    if status == PermitStatus.under_review:
        anchor = permit.applied_on or permit.created_at.date()
        if (today - anchor).days >= STALE_REVIEW_DAYS:
            alerts.append(
                PermitAlert(
                    permit_id=permit.id,
                    site_id=permit.site_id,
                    reason=PermitAlertReason.stale_review,
                    title=f"Permit stuck in review: {_ref(permit)}",
                    detail=(
                        f"{_ref(permit)} has been under review since "
                        f"{anchor.isoformat()}. Follow up with {permit.authority}."
                    ),
                    severity="warn",
                )
            )
    elif status == PermitStatus.applied:
        anchor = permit.applied_on or permit.created_at.date()
        if (today - anchor).days >= STALE_APPLIED_DAYS:
            alerts.append(
                PermitAlert(
                    permit_id=permit.id,
                    site_id=permit.site_id,
                    reason=PermitAlertReason.stale_applied,
                    title=f"Permit application stale: {_ref(permit)}",
                    detail=(
                        f"{_ref(permit)} was applied on {anchor.isoformat()} with no "
                        f"movement. Confirm it was received by {permit.authority}."
                    ),
                    severity="warn",
                )
            )

    # Overdue expected decision (for any still-undecided, in-flight permit).
    if (
        permit.expected_on is not None
        and permit.decided_on is None
        and status in (PermitStatus.applied, PermitStatus.under_review)
        and permit.expected_on < today
    ):
        overdue = (today - permit.expected_on).days
        alerts.append(
            PermitAlert(
                permit_id=permit.id,
                site_id=permit.site_id,
                reason=PermitAlertReason.overdue_expected,
                title=f"Permit decision overdue: {_ref(permit)}",
                detail=(
                    f"{_ref(permit)} was expected by {permit.expected_on.isoformat()} "
                    f"({overdue} day(s) overdue) and is still undecided."
                ),
                severity="warn",
            )
        )

    return alerts


def _decision_title(alert: PermitAlert) -> str:
    # Tag embedded so the de-dup query can find prior alerts for this permit+reason.
    return f"{ALERT_TAG}[{alert.permit_id}][{alert.reason.value}] {alert.title}"


async def _existing_alert_titles(session: AsyncSession, company_id: UUID) -> set[str]:
    rows = await session.execute(
        select(Decision.title).where(
            Decision.company_id == company_id,
            Decision.kind == DecisionKind.generic,
            Decision.state == DecisionState.pending,
            Decision.title.like(f"{ALERT_TAG}%"),
        )
    )
    return set(rows.scalars().all())


async def run_permit_sweep(
    session_factory: SessionFactory = SessionLocal,
    *,
    today: date | None = None,
) -> list[UUID]:
    """Sweep every company's permits and raise a Decision per new alert.

    Args:
        session_factory: callable returning an ``AsyncSession`` context manager
            (defaults to :data:`app.db.SessionLocal`); tests pass a factory bound
            to the transactional test session.
        today: the reference date for expiry/staleness math (defaults to the
            local calendar date). Passed explicitly so tests are deterministic.

    Returns the ids of the newly-created :class:`Decision` rows. Idempotent: a
    second run on the same day for the same permit+reason raises nothing new.
    """
    ref_day = today or datetime.now(tz=UTC).date()
    created: list[UUID] = []

    async with session_factory() as session:
        company_ids = list((await session.execute(select(Company.id))).scalars().all())

    for company_id in company_ids:
        async with session_factory() as session:
            try:
                created.extend(await _sweep_company(session, company_id, ref_day))
            except Exception:  # never let one company abort the whole run
                logger.exception("run_permit_sweep: failed for company %s", company_id)

    logger.info("run_permit_sweep: raised %d alert(s) for %s", len(created), ref_day)
    return created


async def _sweep_company(
    session: AsyncSession, company_id: UUID, today: date
) -> list[UUID]:
    permits = list(
        (
            await session.execute(select(Permit).where(Permit.company_id == company_id))
        )
        .scalars()
        .all()
    )
    existing = await _existing_alert_titles(session, company_id)

    created: list[UUID] = []
    for permit in permits:
        for alert in classify_permit(permit, today):
            title = _decision_title(alert)
            if title in existing:
                continue
            decision = Decision(
                company_id=company_id,
                site_id=alert.site_id,
                kind=DecisionKind.generic,
                title=title,
                detail=alert.detail,
                state=DecisionState.pending,
                sla_due_at=datetime.combine(
                    today + timedelta(days=3), datetime.min.time(), tzinfo=UTC
                ),
            )
            session.add(decision)
            await session.flush()
            created.append(decision.id)
            existing.add(title)
    if created:
        await session.commit()
    return created
