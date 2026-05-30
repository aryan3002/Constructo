"""SLA escalation sweep — deterministic via an injected clock (no wall-time)."""
from datetime import UTC, datetime, timedelta

import pytest_asyncio

from app.approvals.sla import run_sla_sweep
from app.models import Decision, DecisionKind, DecisionState, UserRole
from app.notifications import store


@pytest_asyncio.fixture(autouse=True)
async def _clean_store():
    store.reset()
    yield
    store.reset()


async def _question(session, company, site, owner, *, due: datetime, state=DecisionState.pending):
    d = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.homeowner_question,
        title="When will the slab be poured?",
        assigned_to=owner.id,
        state=state,
        sla_due_at=due,
    )
    session.add(d)
    await session.flush()
    return d


async def test_past_due_question_escalates(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    now = datetime(2026, 5, 29, 12, 0, tzinfo=UTC)
    d = await _question(db_session, company, site, owner, due=now - timedelta(hours=1))

    escalated = await run_sla_sweep(db_session, now=now, company_id=company.id)

    assert escalated == [d.id]
    await db_session.refresh(d)
    assert d.state == DecisionState.escalated


async def test_not_yet_due_is_left_alone(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    now = datetime(2026, 5, 29, 12, 0, tzinfo=UTC)
    d = await _question(db_session, company, site, owner, due=now + timedelta(hours=2))

    escalated = await run_sla_sweep(db_session, now=now, company_id=company.id)

    assert escalated == []
    await db_session.refresh(d)
    assert d.state == DecisionState.pending


async def test_resolved_question_never_escalates(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    now = datetime(2026, 5, 29, 12, 0, tzinfo=UTC)
    await _question(
        db_session, company, site, owner,
        due=now - timedelta(days=1), state=DecisionState.resolved,
    )

    escalated = await run_sla_sweep(db_session, now=now, company_id=company.id)
    assert escalated == []


async def test_sweep_is_idempotent_and_nudges_once(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    now = datetime(2026, 5, 29, 12, 0, tzinfo=UTC)
    d = await _question(db_session, company, site, owner, due=now - timedelta(hours=1))

    first = await run_sla_sweep(db_session, now=now, company_id=company.id)
    assert first == [d.id]
    # First nudge consumed by the sweep; a manual check now returns False.
    assert store.should_nudge(owner.id, d.id) is False

    # Re-running the sweep does not re-escalate (already escalated).
    second = await run_sla_sweep(db_session, now=now, company_id=company.id)
    assert second == []
