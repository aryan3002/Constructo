"""Permit alert sweep: pure classifier + persistent, idempotent run_permit_sweep."""
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from sqlalchemy import select

from app.models import Decision, DecisionState, Permit, PermitStatus
from app.permits.alerts import (
    EXPIRY_SOON_DAYS,
    STALE_REVIEW_DAYS,
    PermitAlertReason,
    classify_permit,
    run_permit_sweep,
)

TODAY = date(2026, 6, 1)


def _permit(**over) -> Permit:
    base = dict(
        id=uuid4(),
        company_id=uuid4(),
        site_id=uuid4(),
        permit_type="commencement",
        authority="Municipal Corp",
        status=PermitStatus.approved,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    base.update(over)
    return Permit(**base)


# ---- pure classifier (no DB) ----------------------------------------------


def test_expired_permit_flagged():
    p = _permit(status=PermitStatus.approved, expiry_on=TODAY - timedelta(days=5))
    reasons = {a.reason for a in classify_permit(p, TODAY)}
    assert PermitAlertReason.expired in reasons


def test_expiring_soon_within_window():
    expiry = TODAY + timedelta(days=EXPIRY_SOON_DAYS - 1)
    p = _permit(status=PermitStatus.approved, expiry_on=expiry)
    alerts = classify_permit(p, TODAY)
    assert [a.reason for a in alerts] == [PermitAlertReason.expiring_soon]


def test_far_future_expiry_is_quiet():
    p = _permit(status=PermitStatus.approved, expiry_on=TODAY + timedelta(days=365))
    assert classify_permit(p, TODAY) == []


def test_stale_under_review_flagged():
    p = _permit(
        status=PermitStatus.under_review,
        applied_on=TODAY - timedelta(days=STALE_REVIEW_DAYS + 1),
    )
    reasons = {a.reason for a in classify_permit(p, TODAY)}
    assert PermitAlertReason.stale_review in reasons


def test_overdue_expected_decision_flagged():
    p = _permit(
        status=PermitStatus.applied,
        applied_on=TODAY - timedelta(days=2),
        expected_on=TODAY - timedelta(days=1),
        decided_on=None,
    )
    reasons = {a.reason for a in classify_permit(p, TODAY)}
    assert PermitAlertReason.overdue_expected in reasons


def test_rejected_and_not_started_are_quiet():
    for status in (PermitStatus.rejected, PermitStatus.not_started, PermitStatus.expired):
        p = _permit(status=status, expiry_on=TODAY - timedelta(days=1))
        assert classify_permit(p, TODAY) == []


# ---- persistent sweep ------------------------------------------------------


async def test_run_permit_sweep_raises_and_is_idempotent(db_session, factory):
    company = await factory.company()
    site = await factory.site(company=company)
    db_session.add(
        Permit(
            company_id=company.id,
            site_id=site.id,
            permit_type="fire-noc",
            authority="Fire Dept",
            status=PermitStatus.approved,
            expiry_on=TODAY - timedelta(days=3),
        )
    )
    await db_session.commit()

    @asynccontextmanager
    async def session_factory():
        yield db_session

    first = await run_permit_sweep(session_factory=session_factory, today=TODAY)
    assert len(first) == 1

    rows = (await db_session.execute(select(Decision))).scalars().all()
    assert len(rows) == 1
    assert rows[0].state == DecisionState.pending
    assert rows[0].site_id == site.id

    # Second run on the same day raises nothing new (dedup).
    second = await run_permit_sweep(session_factory=session_factory, today=TODAY)
    assert second == []
    rows2 = (await db_session.execute(select(Decision))).scalars().all()
    assert len(rows2) == 1


async def test_run_permit_sweep_no_permits_empty(db_session, factory):
    await factory.company()

    @asynccontextmanager
    async def session_factory():
        yield db_session

    assert await run_permit_sweep(session_factory=session_factory, today=TODAY) == []
