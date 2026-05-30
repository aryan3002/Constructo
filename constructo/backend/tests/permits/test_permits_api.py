"""Permit endpoints: CRUD, lifecycle update, per-site checklist, scoping."""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import Company, UserRole
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


async def _company(db_session, company_id):
    return await db_session.get(Company, company_id)


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


def _payload(site_id, **over):
    base = {
        "site_id": str(site_id),
        "permit_type": "commencement",
        "authority": "Municipal Corporation",
    }
    base.update(over)
    return base


async def test_create_and_lifecycle_update(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    created = await client.post(
        "/api/v1/permits", json=_payload(site.id), headers=auth(owner)
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "not_started"

    patched = await client.patch(
        f"/api/v1/permits/{body['id']}",
        json={"status": "applied", "applied_on": "2026-05-01", "reference_no": "MC-2026-77"},
        headers=auth(owner),
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "applied"
    assert patched.json()["reference_no"] == "MC-2026-77"


async def test_create_on_foreign_site_404(client, factory, db_session, owner):
    other_company = await factory.company(name="Other")
    other_site = await factory.site(company=other_company)
    resp = await client.post(
        "/api/v1/permits", json=_payload(other_site.id), headers=auth(owner)
    )
    assert resp.status_code == 404


async def test_site_checklist_ordered_by_type(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    for ptype in ("water", "fire-noc", "commencement"):
        await client.post(
            "/api/v1/permits", json=_payload(site.id, permit_type=ptype), headers=auth(owner)
        )
    resp = await client.get(f"/api/v1/permits/checklist?site_id={site.id}", headers=auth(owner))
    assert resp.status_code == 200
    types = [p["permit_type"] for p in resp.json()["items"]]
    assert types == sorted(types)  # stable, alphabetical by type


async def test_supervisor_scoped_to_assigned_site(client, factory, db_session, owner):
    company = await _company(db_session, owner.company_id)
    site_a = await factory.site(company=company, name="A")
    site_b = await factory.site(company=company, name="B")
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site_a.id, user_id=supervisor.id))
    await db_session.flush()

    await client.post("/api/v1/permits", json=_payload(site_a.id), headers=auth(owner))
    await client.post("/api/v1/permits", json=_payload(site_b.id), headers=auth(owner))

    listed = await client.get("/api/v1/permits", headers=auth(supervisor))
    assert listed.status_code == 200
    sites = {p["site_id"] for p in listed.json()["items"]}
    assert sites == {str(site_a.id)}

    # And the checklist for the unassigned site is forbidden.
    forbidden = await client.get(
        f"/api/v1/permits/checklist?site_id={site_b.id}", headers=auth(supervisor)
    )
    assert forbidden.status_code == 403


async def test_delete_permit(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    created = (
        await client.post("/api/v1/permits", json=_payload(site.id), headers=auth(owner))
    ).json()
    deleted = await client.delete(f"/api/v1/permits/{created['id']}", headers=auth(owner))
    assert deleted.status_code == 204
    assert (
        await client.get(f"/api/v1/permits/{created['id']}", headers=auth(owner))
    ).status_code == 404


async def test_requires_auth(client):
    assert (await client.get("/api/v1/permits")).status_code == 401
