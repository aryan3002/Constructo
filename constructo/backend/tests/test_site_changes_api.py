"""Site-changes API — the field → designer feedback loop.

The site engineer reports an as-built condition; the designer reviews, links it
to a revision, and resolves it. Company-scoped + site-visibility-scoped.
"""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import PublishedDrawing, SiteChange, UserRole


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


async def test_link_to_drawing_must_be_same_site(client, factory, world, db_session):
    company, arch, site = world
    change = (await _report(client, arch, site)).json()

    other_site = await factory.site(company, name="Other Site")
    foreign = PublishedDrawing(site_id=other_site.id, title="Foreign", version="A", file_url="x")
    same = PublishedDrawing(site_id=site.id, title="Kitchen", version="C", file_url="x")
    db_session.add_all([foreign, same])
    await db_session.flush()

    bad = await client.patch(
        f"/api/v1/site-changes/{change['id']}",
        json={"linked_drawing_id": str(foreign.id)},
        headers=auth(arch),
    )
    assert bad.status_code == 404

    ok = await client.patch(
        f"/api/v1/site-changes/{change['id']}",
        json={"linked_drawing_id": str(same.id)},
        headers=auth(arch),
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "linked"
    assert ok.json()["linked_drawing_id"] == str(same.id)


# ---------------------------------------------------------------------------
# reported_by_name resolution tests
# ---------------------------------------------------------------------------


async def test_reported_by_name_on_create(client, world):
    """POST /site-changes response includes reported_by_name matching the reporter's name."""
    _, arch, site = world
    resp = await _report(client, arch, site)
    assert resp.status_code == 201
    data = resp.json()
    assert data["reported_by"] == str(arch.id)
    assert data["reported_by_name"] == "Anamika"


async def test_reported_by_name_on_get(client, world):
    """GET /site-changes/{id} includes reported_by_name."""
    _, arch, site = world
    change = (await _report(client, arch, site)).json()

    got = await client.get(f"/api/v1/site-changes/{change['id']}", headers=auth(arch))
    assert got.status_code == 200
    data = got.json()
    assert data["reported_by_name"] == "Anamika"


async def test_reported_by_name_on_list_batch(client, factory, world):
    """GET /site-changes list includes reported_by_name for all changes (batched lookup, no N+1).

    Two different architect reporters → both names resolved correctly in a single list query.
    Architects see all company sites without a site-assignment constraint.
    """
    company, arch, site = world
    arch2 = await factory.user(company=company, role=UserRole.architect, name="Priya Mehta")

    await _report(client, arch, site)   # reported_by=arch.id → "Anamika"
    await _report(client, arch2, site)  # reported_by=arch2.id → "Priya Mehta"

    listed = await client.get("/api/v1/site-changes", headers=auth(arch))
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 2

    names = {item["reported_by_name"] for item in items}
    assert "Anamika" in names
    assert "Priya Mehta" in names
    # None of the raw UUIDs must appear as reported_by_name
    for item in items:
        assert item["reported_by_name"] is not None


async def test_reported_by_name_null_for_unknown_reporter(client, world, db_session):
    """A change with no reporter (reported_by = NULL) → reported_by_name is null."""
    company, arch, site = world
    from app.models import SiteChangeStatus

    # Insert a change directly with reported_by=NULL
    orphan = SiteChange(
        company_id=company.id,
        site_id=site.id,
        title="Orphan change",
        note="Reporter unknown",
        status=SiteChangeStatus.new,
        reported_by=None,
    )
    db_session.add(orphan)
    await db_session.flush()

    got = await client.get(f"/api/v1/site-changes/{orphan.id}", headers=auth(arch))
    assert got.status_code == 200
    data = got.json()
    assert data["reported_by"] is None
    assert data["reported_by_name"] is None

    # Also appears correctly in list
    listed = await client.get("/api/v1/site-changes", headers=auth(arch))
    orphan_item = next(i for i in listed.json() if i["id"] == str(orphan.id))
    assert orphan_item["reported_by_name"] is None
