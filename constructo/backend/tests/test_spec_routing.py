"""Designer spec routing — derived routing_status + route/release actions.

The owner's plain approval flow (pending/approved/rejected) is untouched; the
designer's selection lifecycle is derived from approval_status + sent_at +
released_at: draft → out_for_approval → approved → released, with rejected
surfacing as "returned".
"""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import Component, ComponentStatus, Space, SpaceKind, Spec, UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def spec_world(factory, db_session):
    company = await factory.company()
    arch = await factory.user(company=company, role=UserRole.architect, name="Anamika")
    site = await factory.site(company, name="Kutumb Nivaas")
    space = Space(site_id=site.id, name="Interiors", kind=SpaceKind.zone, order=0)
    db_session.add(space)
    await db_session.flush()
    comp = Component(
        space_id=space.id, name="Finishes", kind="finish", status=ComponentStatus.in_progress
    )
    db_session.add(comp)
    await db_session.flush()
    spec = Spec(
        company_id=company.id, site_id=site.id, component_id=comp.id, label="Quartz counter"
    )
    db_session.add(spec)
    await db_session.flush()
    return company, arch, site, spec


async def test_full_routing_lifecycle(client, spec_world):
    _, arch, _, spec = spec_world

    got = await client.get(f"/api/v1/specs/{spec.id}", headers=auth(arch))
    assert got.json()["routing_status"] == "draft"

    routed = await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(arch))
    assert routed.status_code == 200, routed.text
    assert routed.json()["routing_status"] == "out_for_approval"
    assert routed.json()["sent_at"] is not None

    approved = await client.post(
        f"/api/v1/specs/{spec.id}/approve", json={"status": "approved"}, headers=auth(arch)
    )
    assert approved.json()["routing_status"] == "approved"

    released = await client.post(f"/api/v1/specs/{spec.id}/release", headers=auth(arch))
    assert released.status_code == 200, released.text
    assert released.json()["routing_status"] == "released"
    assert released.json()["released_at"] is not None


async def test_release_requires_approved(client, spec_world):
    _, arch, _, spec = spec_world
    resp = await client.post(f"/api/v1/specs/{spec.id}/release", headers=auth(arch))
    assert resp.status_code == 409


async def test_rejected_surfaces_as_returned(client, spec_world):
    _, arch, _, spec = spec_world
    rejected = await client.post(
        f"/api/v1/specs/{spec.id}/approve", json={"status": "rejected"}, headers=auth(arch)
    )
    assert rejected.json()["routing_status"] == "returned"
