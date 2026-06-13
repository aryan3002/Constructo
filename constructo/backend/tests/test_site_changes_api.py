"""Site-changes API — the field → designer feedback loop.

The site engineer reports an as-built condition; the designer reviews, links it
to a revision, and resolves it. Company-scoped + site-visibility-scoped.
"""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect, name="Anamika")
    site = await factory.site(company, name="Kutumb Nivaas")
    return company, architect, site


async def _report(client, user, site, **kw):
    payload = {"site_id": str(site.id), "title": "Slab cover blocks missing", "note": "Bays 3 & 4"}
    payload.update(kw)
    return await client.post("/api/v1/site-changes", json=payload, headers=auth(user))


async def test_report_list_get(client, world):
    _, arch, site = world
    resp = await _report(client, arch, site, room="2nd-floor slab")
    assert resp.status_code == 201, resp.text
    change = resp.json()
    assert change["status"] == "new"
    assert change["reported_by"] == str(arch.id)
    assert change["room"] == "2nd-floor slab"

    listed = await client.get("/api/v1/site-changes", headers=auth(arch))
    assert listed.status_code == 200
    assert [c["id"] for c in listed.json()] == [change["id"]]

    got = await client.get(f"/api/v1/site-changes/{change['id']}", headers=auth(arch))
    assert got.json()["title"] == "Slab cover blocks missing"


async def test_link_then_resolve(client, world):
    _, arch, site = world
    change = (await _report(client, arch, site)).json()

    linked = await client.patch(
        f"/api/v1/site-changes/{change['id']}", json={"status": "linked"}, headers=auth(arch)
    )
    assert linked.json()["status"] == "linked"
    assert linked.json()["resolved_at"] is None

    resolved = await client.patch(
        f"/api/v1/site-changes/{change['id']}", json={"status": "resolved"}, headers=auth(arch)
    )
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"] is not None


async def test_status_filter(client, world):
    _, arch, site = world
    await _report(client, arch, site)
    only_new = await client.get("/api/v1/site-changes?status=new", headers=auth(arch))
    assert only_new.json() and all(c["status"] == "new" for c in only_new.json())
    none_resolved = await client.get("/api/v1/site-changes?status=resolved", headers=auth(arch))
    assert none_resolved.json() == []


async def test_company_scoping_isolation(client, factory, world):
    _, arch, site = world
    change = (await _report(client, arch, site)).json()
    other = await factory.company(name="Rival Builders")
    other_arch = await factory.user(company=other, role=UserRole.architect)
    resp = await client.get(f"/api/v1/site-changes/{change['id']}", headers=auth(other_arch))
    assert resp.status_code == 404


async def test_unassigned_supervisor_cannot_report(client, factory, world):
    company, _, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)  # not assigned to `site`
    resp = await _report(client, sup, site)
    assert resp.status_code == 403
