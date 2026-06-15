"""Spec↔Decision wiring (Elev-A Part A).

Routing a spec must create a Decision that appears in /approvals (owner inbox).
Re-routing the same spec must reuse the same Decision (idempotent).
Approving/rejecting the spec must keep the linked Decision in sync.
Approving a spec that was never routed (no linked Decision) must not error.
"""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import (
    Component,
    ComponentStatus,
    Decision,
    Space,
    SpaceKind,
    Spec,
    UserRole,
)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def spec_world(factory, db_session):
    company = await factory.company()
    arch = await factory.user(company=company, role=UserRole.architect, name="Anamika Sharma")
    owner = await factory.user(company=company, role=UserRole.owner, name="Rajesh Owner")
    site = await factory.site(company, name="Kutumb Nivaas")
    space = Space(site_id=site.id, name="Living Room", kind=SpaceKind.room, order=0)
    db_session.add(space)
    await db_session.flush()
    comp = Component(
        space_id=space.id,
        name="Feature Wall",
        kind="finish",
        status=ComponentStatus.in_progress,
    )
    db_session.add(comp)
    await db_session.flush()
    spec = Spec(
        company_id=company.id,
        site_id=site.id,
        component_id=comp.id,
        label="Italian Marble 24×24",
    )
    db_session.add(spec)
    await db_session.flush()
    return company, arch, owner, site, spec


async def test_routing_creates_decision_in_approvals_inbox(client, spec_world):
    """POST /specs/{id}/route → a Decision appears in GET /approvals."""
    company, arch, owner, site, spec = spec_world

    # Route the spec
    r = await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    assert r.status_code == 200, r.text
    assert r.json()["routing_status"] == "out_for_approval"

    # Decision must appear in the owner's approvals inbox
    inbox = await client.get("/api/v1/approvals", headers=auth(owner))
    assert inbox.status_code == 200, inbox.text
    items = inbox.json()["items"]
    spec_decisions = [d for d in items if d.get("spec_id") == str(spec.id)]
    assert len(spec_decisions) == 1
    d = spec_decisions[0]
    assert d["state"] == "pending"
    assert d["kind"] == "approval"
    assert "Italian Marble" in d["title"]


async def test_re_routing_same_spec_is_idempotent(client, db_session, spec_world):
    """POST /specs/{id}/route twice → only ONE Decision row in the DB."""
    company, arch, owner, site, spec = spec_world

    await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))

    # Count Decision rows for this spec
    from sqlalchemy import select
    rows = (
        await db_session.execute(
            select(Decision).where(
                Decision.company_id == company.id,
                Decision.spec_id == spec.id,
            )
        )
    ).scalars().all()
    assert len(rows) == 1, f"Expected 1 Decision, got {len(rows)}"


async def test_re_routing_reopens_rejected_decision(client, spec_world):
    """If the owner rejects the spec, re-routing reopens the Decision to pending."""
    company, arch, owner, site, spec = spec_world

    # Route → reject
    await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    await client.post(
        f"/api/v1/specs/{spec.id}/approve",
        json={"status": "rejected"},
        headers=auth(arch),
    )

    # Get the Decision — should be rejected now
    inbox = await client.get("/api/v1/approvals", headers=auth(owner))
    items = inbox.json()["items"]
    d = next(i for i in items if i.get("spec_id") == str(spec.id))
    assert d["state"] == "rejected"

    # Re-route
    r = await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    assert r.status_code == 200

    # Decision should be back to pending
    inbox2 = await client.get("/api/v1/approvals", headers=auth(owner))
    items2 = inbox2.json()["items"]
    d2 = next(i for i in items2 if i.get("spec_id") == str(spec.id))
    assert d2["state"] == "pending"


async def test_approving_spec_resolves_linked_decision(client, spec_world):
    """POST /specs/{id}/approve status=approved → linked Decision becomes resolved."""
    company, arch, owner, site, spec = spec_world

    await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    await client.post(
        f"/api/v1/specs/{spec.id}/approve",
        json={"status": "approved"},
        headers=auth(arch),
    )

    inbox = await client.get("/api/v1/approvals", headers=auth(owner))
    items = inbox.json()["items"]
    d = next(i for i in items if i.get("spec_id") == str(spec.id))
    assert d["state"] == "resolved"
    assert d["resolved_at"] is not None


async def test_rejecting_spec_rejects_linked_decision(client, spec_world):
    """POST /specs/{id}/approve status=rejected → linked Decision becomes rejected."""
    company, arch, owner, site, spec = spec_world

    await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    await client.post(
        f"/api/v1/specs/{spec.id}/approve",
        json={"status": "rejected"},
        headers=auth(arch),
    )

    inbox = await client.get("/api/v1/approvals", headers=auth(owner))
    items = inbox.json()["items"]
    d = next(i for i in items if i.get("spec_id") == str(spec.id))
    assert d["state"] == "rejected"


async def test_approving_unrouted_spec_does_not_error(client, spec_world):
    """Approving a spec that was never routed (no Decision) must return 200, not error."""
    company, arch, owner, site, spec = spec_world

    # Approve without ever routing
    r = await client.post(
        f"/api/v1/specs/{spec.id}/approve",
        json={"status": "approved"},
        headers=auth(arch),
    )
    assert r.status_code == 200, r.text
    assert r.json()["approval_status"] == "approved"
