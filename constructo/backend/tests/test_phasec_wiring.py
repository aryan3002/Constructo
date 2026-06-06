"""Phase C wiring tests — scheduler jobs, indexing hook, admin triggers.

All network-free: the embeddings client falls back to FakeEmbeddings (no creds),
and the sweeps take explicit ``now``/``today`` for determinism.

Covers:
  (a) run_sla_sweep escalates an overdue decision,
  (b) run_permit_sweep flags a near-expiry permit,
  (c) an extracted event (sync mode) gets indexed and is searchable,
plus the admin manual-trigger endpoints (owner-guarded) and that the scheduler
registers the new jobs when enabled.
"""
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta

import pytest_asyncio
from sqlalchemy import func, select

from app.approvals.sla import run_sla_sweep
from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.extraction.worker import handle_ingested
from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    EventEmbedding,
    Permit,
    PermitStatus,
    RawMessageModel,
    SiteEventModel,
    UserRole,
    WhatsappGroup,
)
from app.notifications import store
from app.permits.alerts import PermitAlertReason, run_permit_sweep


@pytest_asyncio.fixture(autouse=True)
async def _clean_store():
    store.reset()
    yield
    store.reset()


def _session_factory(db_session):
    """Wrap the rolled-back test session so a callable reuses it.

    ``commit()`` becomes a SAVEPOINT release (conftest join mode) and the session
    stays open, so assertions afterwards still read the rows.
    """

    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


def _auth(user):
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# (a) SLA escalation sweep
# --------------------------------------------------------------------------- #
async def test_sla_sweep_escalates_overdue_decision(db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    now = datetime(2026, 5, 29, 12, 0, tzinfo=UTC)
    decision = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.homeowner_question,
        title="When is the slab poured?",
        assigned_to=owner.id,
        state=DecisionState.pending,
        sla_due_at=now - timedelta(hours=2),
    )
    db_session.add(decision)
    await db_session.flush()

    escalated = await run_sla_sweep(db_session, now=now, company_id=company.id)

    assert escalated == [decision.id]
    await db_session.refresh(decision)
    assert decision.state == DecisionState.escalated


# --------------------------------------------------------------------------- #
# (b) Permit near-expiry sweep
# --------------------------------------------------------------------------- #
async def test_permit_sweep_flags_near_expiry(db_session, factory):
    company = await factory.company()
    site = await factory.site(company)
    today = date(2026, 5, 29)
    permit = Permit(
        company_id=company.id,
        site_id=site.id,
        permit_type="Building Plan Approval",
        authority="BBMP",
        status=PermitStatus.approved,
        expiry_on=today + timedelta(days=10),  # within EXPIRY_SOON_DAYS (30)
    )
    db_session.add(permit)
    await db_session.flush()

    created = await run_permit_sweep(_session_factory(db_session), today=today)

    assert len(created) == 1
    raised = (
        await db_session.execute(
            select(Decision).where(Decision.id == created[0])
        )
    ).scalar_one()
    assert raised.kind == DecisionKind.generic
    assert PermitAlertReason.expiring_soon.value in raised.title
    assert raised.state == DecisionState.pending

    # Idempotent: a second sweep the same day raises nothing new.
    again = await run_permit_sweep(_session_factory(db_session), today=today)
    assert again == []


# --------------------------------------------------------------------------- #
# (c) Extract (sync) -> index -> searchable
# --------------------------------------------------------------------------- #
async def test_extracted_event_is_indexed_and_searchable(db_session, factory, client):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    group = WhatsappGroup(
        company_id=company.id,
        site_id=site.id,
        external_group_id="grp-phasec",
        source="baileys",
        label="Site crew",
    )
    msg = RawMessageModel(
        source="baileys",
        external_group_id="grp-phasec",
        sender_id="s1",
        media_type="text",
        text="50 bags cement delivered from ACC",
        sent_at=datetime(2026, 5, 28, 9, 0),
        raw={},
    )
    db_session.add_all([group, msg])
    await db_session.flush()

    ids = await handle_ingested(
        msg.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )
    assert len(ids) == 1

    # The indexing hook embedded the new event (FakeEmbeddings) so it has a row.
    emb_count = await db_session.scalar(
        select(func.count())
        .select_from(EventEmbedding)
        .where(EventEmbedding.site_event_id == ids[0])
    )
    assert emb_count == 1

    # And it is now searchable via the public search endpoint (scoped to owner).
    resp = await client.post(
        "/api/v1/search", json={"q": "cement delivered"}, headers=_auth(owner)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["answerable"] is True
    assert any(h["event_id"] == str(ids[0]) for h in body["hits"])


async def test_indexing_failure_does_not_fail_ingestion(db_session, factory, monkeypatch):
    """A broken embeddings client must not lose the ingested events."""
    company = await factory.company()
    site = await factory.site(company)
    group = WhatsappGroup(
        company_id=company.id,
        site_id=site.id,
        external_group_id="grp-broken",
        source="baileys",
        label="Site crew",
    )
    msg = RawMessageModel(
        source="baileys",
        external_group_id="grp-broken",
        sender_id="s1",
        media_type="text",
        text="24 mazdoor aaye",
        sent_at=datetime(2026, 5, 28, 9, 0),
        raw={},
    )
    db_session.add_all([group, msg])
    await db_session.flush()

    def _boom():
        raise RuntimeError("embeddings unavailable")

    # Break the embeddings client the indexing hook resolves.
    monkeypatch.setattr("app.search.index.get_embeddings_client", _boom)

    ids = await handle_ingested(
        msg.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )

    # Ingestion still succeeded (event persisted) despite indexing blowing up.
    assert len(ids) == 1
    stored = await db_session.get(SiteEventModel, ids[0])
    assert stored is not None
    emb_count = await db_session.scalar(
        select(func.count())
        .select_from(EventEmbedding)
        .where(EventEmbedding.site_event_id == ids[0])
    )
    assert emb_count == 0


# --------------------------------------------------------------------------- #
# Admin manual-trigger endpoints (owner-guarded)
# --------------------------------------------------------------------------- #
async def test_admin_run_sla_sweep_endpoint_escalates(db_session, factory, client):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    decision = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.homeowner_question,
        title="Overdue question",
        assigned_to=owner.id,
        state=DecisionState.pending,
        sla_due_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add(decision)
    await db_session.flush()

    resp = await client.post("/api/v1/admin/run-sla-sweep", headers=_auth(owner))
    assert resp.status_code == 200
    assert resp.json()["count"] >= 1

    await db_session.refresh(decision)
    assert decision.state == DecisionState.escalated


async def test_admin_reindex_endpoint_backfills(db_session, factory, client):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    event = SiteEventModel(
        site_id=site.id,
        event_type="material_delivery",
        occurred_on=date(2026, 5, 28),
        summary="cement delivered",
        fields={"material": "cement", "quantity": 50},
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    db_session.add(event)
    await db_session.flush()

    resp = await client.post("/api/v1/admin/reindex", headers=_auth(owner))
    assert resp.status_code == 200
    assert resp.json()["events_indexed"] == 1

    emb_count = await db_session.scalar(
        select(func.count())
        .select_from(EventEmbedding)
        .where(EventEmbedding.site_event_id == event.id)
    )
    assert emb_count == 1


async def test_admin_endpoints_require_owner_role(db_session, factory, client):
    company = await factory.company()
    sup = await factory.user(company=company, role=UserRole.supervisor)

    for path in (
        "/api/v1/admin/run-sla-sweep",
        "/api/v1/admin/run-permit-sweep",
        "/api/v1/admin/run-nightly",
        "/api/v1/admin/reindex",
    ):
        resp = await client.post(path, headers=_auth(sup))
        assert resp.status_code == 403, path

    # Unauthenticated is rejected too.
    resp = await client.post("/api/v1/admin/run-sla-sweep")
    assert resp.status_code == 401


# --------------------------------------------------------------------------- #
# Scheduler registration (guarded by settings.enable_scheduler)
# --------------------------------------------------------------------------- #
def test_scheduler_disabled_by_default(monkeypatch):
    from app import scheduler as sched

    monkeypatch.setattr(sched.settings, "enable_scheduler", False)
    assert sched.start_scheduler() is None


async def test_scheduler_registers_sweep_jobs_when_enabled(monkeypatch):
    # Async so AsyncIOScheduler.start() finds a running event loop.
    from app import scheduler as sched

    # Ensure a clean module-level singleton.
    sched.shutdown_scheduler()
    monkeypatch.setattr(sched.settings, "enable_scheduler", True)
    scheduler = sched.start_scheduler()
    try:
        assert scheduler is not None
        job_ids = {job.id for job in scheduler.get_jobs()}
        assert {"nightly_brief", "sla_sweep", "permit_sweep"} <= job_ids
    finally:
        sched.shutdown_scheduler()
