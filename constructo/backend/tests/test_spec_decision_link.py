"""Spec-Decision bridge tests.

Verifies the "designer proposes → owner commits" flow end-to-end at the API
layer using the real test DB and the shared factory/client fixtures.

Coverage:
  (a) routing a spec creates a Decision(kind=approval, spec_id=...) that
      appears in GET /api/v1/approvals.
  (b) re-routing the SAME spec does NOT create a 2nd Decision (idempotent)
      and reopens it to pending if it was already resolved/rejected.
  (c) approving the spec → linked Decision resolved.
  (d) rejecting the spec → linked Decision rejected.
  (e) approving a never-routed spec doesn't error.
"""
import pytest_asyncio
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.models import (
    Component,
    ComponentStatus,
    Decision,
    DecisionKind,
    DecisionState,
    Space,
    SpaceKind,
    Spec,
    UserRole,
)
from app.specs.service import _client_decision_id, sync_spec_routed_decision


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


# ---------------------------------------------------------------------------
# Shared fixture: company, architect (router), owner (approver), site, spec
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def world(factory, db_session):
    """A minimal world: company, architect, owner, site, space, component, spec."""
    company = await factory.company()
    arch = await factory.user(company=company, role=UserRole.architect, name="Anamika")
    owner = await factory.user(company=company, role=UserRole.owner, name="Ramesh")
    site = await factory.site(company, name="Kutumb Nivaas")

    space = Space(site_id=site.id, name="Living Room", kind=SpaceKind.room)
    db_session.add(space)
    await db_session.flush()

    comp = Component(
        space_id=space.id,
        name="Feature Wall",
        location="North wall",
        status=ComponentStatus.in_progress,
    )
    db_session.add(comp)
    await db_session.flush()

    spec = Spec(
        company_id=company.id,
        site_id=site.id,
        component_id=comp.id,
        label="Fluted Marble Panel",
    )
    db_session.add(spec)
    await db_session.flush()

    return company, arch, owner, site, spec


# ---------------------------------------------------------------------------
# (a) routing creates a Decision that appears in /approvals
# ---------------------------------------------------------------------------


async def test_route_creates_approval_decision(client, world):
    _company, arch, owner, _site, spec = world

    # Route the spec as the architect.
    route_resp = await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    assert route_resp.status_code == 200, route_resp.text
    assert route_resp.json()["routing_status"] == "out_for_approval"

    # The owner should see exactly one approval decision in their inbox.
    inbox = await client.get("/api/v1/approvals", headers=auth(owner))
    assert inbox.status_code == 200, inbox.text
    items = inbox.json()["items"]
    spec_decisions = [d for d in items if d.get("spec_id") == str(spec.id)]
    assert len(spec_decisions) == 1, f"expected 1 spec decision, got {spec_decisions}"

    d = spec_decisions[0]
    assert d["kind"] == "approval"
    assert d["state"] == "pending"
    assert "Fluted Marble Panel" in d["title"]
    assert d["spec_id"] == str(spec.id)


# ---------------------------------------------------------------------------
# (b) re-routing is idempotent — one Decision, reopened to pending
# ---------------------------------------------------------------------------


async def test_reroute_is_idempotent_and_reopens(client, world):
    _company, arch, owner, _site, spec = world

    # Route once.
    r1 = await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    assert r1.status_code == 200, r1.text

    # Owner rejects the spec (simulates returned selection).
    await client.post(
        f"/api/v1/specs/{spec.id}/approve",
        json={"status": "rejected"},
        headers=auth(owner),
    )

    # The decision should now be rejected.
    inbox_after_reject = await client.get("/api/v1/approvals", headers=auth(owner))
    spec_decisions = [
        d for d in inbox_after_reject.json()["items"] if d.get("spec_id") == str(spec.id)
    ]
    # Rejected decisions are still returned in the inbox (no state filter set).
    assert len(spec_decisions) == 1
    assert spec_decisions[0]["state"] == "rejected"

    # Architect re-routes (revised proposal).
    r2 = await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    assert r2.status_code == 200, r2.text
    assert r2.json()["routing_status"] == "out_for_approval"

    # Still only ONE decision row.
    inbox_after_reroute = await client.get("/api/v1/approvals", headers=auth(owner))
    spec_decisions_after = [
        d for d in inbox_after_reroute.json()["items"] if d.get("spec_id") == str(spec.id)
    ]
    assert len(spec_decisions_after) == 1, "must not create a 2nd decision on re-route"
    # Reopened to pending.
    assert spec_decisions_after[0]["state"] == "pending"


# ---------------------------------------------------------------------------
# (c) approving the spec resolves the linked Decision
# ---------------------------------------------------------------------------


async def test_approve_spec_resolves_decision(client, world):
    _company, arch, owner, _site, spec = world

    # Route then approve.
    await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    approve_resp = await client.post(
        f"/api/v1/specs/{spec.id}/approve",
        json={"status": "approved", "client_final_code": "FM-001"},
        headers=auth(owner),
    )
    assert approve_resp.status_code == 200, approve_resp.text
    assert approve_resp.json()["approval_status"] == "approved"

    # Linked Decision should be resolved.
    inbox = await client.get("/api/v1/approvals", headers=auth(owner))
    spec_decisions = [d for d in inbox.json()["items"] if d.get("spec_id") == str(spec.id)]
    assert len(spec_decisions) == 1
    assert spec_decisions[0]["state"] == "resolved"
    assert spec_decisions[0]["resolved_at"] is not None


# ---------------------------------------------------------------------------
# (d) rejecting the spec rejects the linked Decision
# ---------------------------------------------------------------------------


async def test_reject_spec_rejects_decision(client, world):
    _company, arch, owner, _site, spec = world

    await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    reject_resp = await client.post(
        f"/api/v1/specs/{spec.id}/approve",
        json={"status": "rejected"},
        headers=auth(owner),
    )
    assert reject_resp.status_code == 200, reject_resp.text
    assert reject_resp.json()["routing_status"] == "returned"

    inbox = await client.get("/api/v1/approvals", headers=auth(owner))
    spec_decisions = [d for d in inbox.json()["items"] if d.get("spec_id") == str(spec.id)]
    assert len(spec_decisions) == 1
    assert spec_decisions[0]["state"] == "rejected"


# ---------------------------------------------------------------------------
# (e) approving a never-routed spec does NOT error
# ---------------------------------------------------------------------------


async def test_approve_never_routed_spec_does_not_error(client, world):
    _company, arch, owner, _site, spec = world

    # Approve directly without routing first.
    resp = await client.post(
        f"/api/v1/specs/{spec.id}/approve",
        json={"status": "approved"},
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["approval_status"] == "approved"

    # No Decision should have been created (spec was never routed).
    inbox = await client.get("/api/v1/approvals", headers=auth(owner))
    spec_decisions = [d for d in inbox.json()["items"] if d.get("spec_id") == str(spec.id)]
    assert len(spec_decisions) == 0, "should not create a decision for an unrouted spec"


# ---------------------------------------------------------------------------
# (f) re-routing heals a legacy Decision's NULL site_id
# ---------------------------------------------------------------------------


async def test_reroute_heals_legacy_null_site_id(client, world, db_session):
    """A Decision created before site_id was stamped on every row (legacy
    shape) sits outside every site-scoped query — including the homeowner's.
    Re-routing the spec must heal it in place, not just leave it invisible."""
    _company, arch, owner, site, spec = world

    # Simulate a legacy row: linked to the spec via the idempotency key, but
    # with site_id NULL (predates the column being populated on creation).
    legacy = Decision(
        company_id=spec.company_id,
        site_id=None,
        spec_id=spec.id,
        kind=DecisionKind.approval,
        title=f"Selection sign-off: {spec.label}",
        raised_by=arch.id,
        client_decision_id=_client_decision_id(spec.id),
        state=DecisionState.pending,
    )
    db_session.add(legacy)
    await db_session.flush()

    # Re-route via the service directly (exercises the existing-row branch).
    healed = await sync_spec_routed_decision(db_session, spec, arch)
    assert healed.id == legacy.id
    assert healed.site_id == site.id

    # Persisted, not just mutated in-memory.
    refetched = (
        await db_session.execute(select(Decision).where(Decision.id == legacy.id))
    ).scalar_one()
    assert refetched.site_id == site.id
