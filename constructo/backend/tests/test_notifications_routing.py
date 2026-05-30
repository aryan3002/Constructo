"""Pure routing/severity unit tests + the bell-feed derivation & API."""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    SiteBaseline,
    UserRole,
)
from app.notifications import routing, store
from app.notifications.feed import build_feed, unread_count


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture(autouse=True)
async def _clean_store():
    store.reset()
    yield
    store.reset()


def test_kind_routes_to_correct_role():
    assert routing.role_for_kind(DecisionKind.homeowner_question) == UserRole.owner
    assert routing.role_for_kind(DecisionKind.approval) == UserRole.pm
    assert routing.role_for_kind(DecisionKind.hold_payment) == UserRole.labor_contractor


def test_severity_escalated_is_risk():
    assert routing.severity_for(DecisionKind.approval, DecisionState.escalated) == "risk"
    assert routing.severity_for(DecisionKind.hold_payment, DecisionState.pending) == "risk"
    assert routing.severity_for(DecisionKind.approval, DecisionState.pending) == "warn"


def test_only_open_states_are_exceptions():
    assert routing.is_exception(DecisionState.pending)
    assert routing.is_exception(DecisionState.escalated)
    assert not routing.is_exception(DecisionState.resolved)
    assert not routing.is_exception(DecisionState.acknowledged)


async def test_feed_routes_homeowner_question_to_assigned_owner(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    pm = await factory.user(company=company, role=UserRole.pm)
    site = await factory.site(company)
    d = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.homeowner_question,
        title="Paint colour?",
        assigned_to=owner.id,
        state=DecisionState.pending,
    )
    db_session.add(d)
    await db_session.flush()

    owner_feed = await build_feed(db_session, company_id=company.id, recipient=owner)
    pm_feed = await build_feed(db_session, company_id=company.id, recipient=pm)

    assert [it.decision_id for it in owner_feed] == [d.id]
    assert pm_feed == []  # PM does not get the homeowner question


async def test_resolved_decision_drops_off_feed(db_session, factory):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    d = Decision(
        company_id=company.id,
        kind=DecisionKind.approval,
        title="PO",
        state=DecisionState.resolved,
    )
    db_session.add(d)
    await db_session.flush()
    assert await build_feed(db_session, company_id=company.id, recipient=pm) == []


async def test_threshold_aware_severity_bump(db_session, factory):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    site = await factory.site(company)
    db_session.add(SiteBaseline(site_id=site.id, expected_daily_headcount=20))
    d = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.approval,
        title="Approve on a watched site",
        state=DecisionState.pending,
    )
    db_session.add(d)
    await db_session.flush()

    feed = await build_feed(db_session, company_id=company.id, recipient=pm)
    assert feed[0].severity == "risk"  # warn bumped to risk by the baseline


async def test_unread_count_and_mark_read(client, db_session, factory):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    d = Decision(
        company_id=company.id,
        kind=DecisionKind.approval,
        title="Approve me",
        state=DecisionState.pending,
    )
    db_session.add(d)
    await db_session.flush()

    assert await unread_count(db_session, company_id=company.id, recipient=pm) == 1

    feed_resp = await client.get("/api/v1/notifications", headers=auth(pm))
    assert feed_resp.status_code == 200
    items = feed_resp.json()
    assert len(items) == 1
    assert items[0]["kind"] == "approval"

    read = await client.post(
        f"/api/v1/notifications/{d.id}/read", headers=auth(pm)
    )
    assert read.status_code == 204

    count = await client.get("/api/v1/notifications/unread-count", headers=auth(pm))
    assert count.json()["unread"] == 0
