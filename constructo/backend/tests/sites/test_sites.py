"""Wave 1 Site & Project Management tests (TDD)."""
from uuid import uuid4

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    """Build an Authorization header for an existing User row."""
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    user = await factory.user(company=company, role=UserRole.owner)
    return user


# ---- companies -------------------------------------------------------------


async def test_owner_can_create_company(client, owner):
    resp = await client.post(
        "/api/v1/companies", json={"name": "New Co"}, headers=auth(owner)
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "New Co"
    assert "id" in body


async def test_non_owner_cannot_create_company(client, factory):
    pm = await factory.user(role=UserRole.pm)
    resp = await client.post(
        "/api/v1/companies", json={"name": "Nope Co"}, headers=auth(pm)
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


async def test_create_company_requires_auth(client):
    resp = await client.post("/api/v1/companies", json={"name": "X"})
    assert resp.status_code == 401


# ---- sites -----------------------------------------------------------------


async def test_owner_can_create_site_minimal(client, owner):
    resp = await client.post(
        "/api/v1/sites",
        json={"name": "Tower A", "type": "residential"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Tower A"
    assert body["type"] == "residential"
    assert body["status"] == "active"  # defaults
    assert body["location"] is None
    assert body["company_id"] == str(owner.company_id)


async def test_pm_can_create_site(client, factory):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    resp = await client.post(
        "/api/v1/sites", json={"name": "PM Site", "type": "commercial"}, headers=auth(pm)
    )
    assert resp.status_code == 201, resp.text


async def test_supervisor_cannot_create_site(client, factory):
    company = await factory.company()
    sup = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.post(
        "/api/v1/sites", json={"name": "Nope", "type": "residential"}, headers=auth(sup)
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


async def test_get_site_in_scope(client, factory, owner):
    company_id = owner.company_id
    create = await client.post(
        "/api/v1/sites", json={"name": "S", "type": "t"}, headers=auth(owner)
    )
    site_id = create.json()["id"]
    resp = await client.get(f"/api/v1/sites/{site_id}", headers=auth(owner))
    assert resp.status_code == 200
    assert resp.json()["id"] == site_id
    assert resp.json()["company_id"] == str(company_id)


async def test_get_site_out_of_scope_is_403(client, factory):
    # owner of company A creates a site
    company_a = await factory.company(name="A")
    owner_a = await factory.user(company=company_a, role=UserRole.owner)
    create = await client.post(
        "/api/v1/sites", json={"name": "SiteA", "type": "t"}, headers=auth(owner_a)
    )
    site_id = create.json()["id"]
    # owner of company B cannot see it
    company_b = await factory.company(name="B")
    owner_b = await factory.user(company=company_b, role=UserRole.owner)
    resp = await client.get(f"/api/v1/sites/{site_id}", headers=auth(owner_b))
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


async def test_get_missing_site_is_404(client, owner):
    resp = await client.get(f"/api/v1/sites/{uuid4()}", headers=auth(owner))
    assert resp.status_code == 404


async def test_patch_site(client, owner):
    create = await client.post(
        "/api/v1/sites", json={"name": "Old", "type": "t"}, headers=auth(owner)
    )
    site_id = create.json()["id"]
    resp = await client.patch(
        f"/api/v1/sites/{site_id}",
        json={"name": "New", "location": "Pune", "status": "completed"},
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "New"
    assert body["location"] == "Pune"
    assert body["status"] == "completed"


async def test_supervisor_cannot_patch_site(client, factory, owner):
    create = await client.post(
        "/api/v1/sites", json={"name": "S", "type": "t"}, headers=auth(owner)
    )
    site_id = create.json()["id"]
    sup = await factory.user(company=None, role=UserRole.supervisor)
    resp = await client.patch(
        f"/api/v1/sites/{site_id}", json={"name": "Hack"}, headers=auth(sup)
    )
    assert resp.status_code == 403


# ---- list / scoping / pagination -------------------------------------------


async def test_owner_lists_all_company_sites(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    for n in ("S1", "S2", "S3"):
        await client.post(
            "/api/v1/sites", json={"name": n, "type": "t"}, headers=auth(owner)
        )
    resp = await client.get("/api/v1/sites", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    names = {item["name"] for item in body["items"]}
    assert names == {"S1", "S2", "S3"}


async def test_supervisor_sees_only_assigned_sites(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    a = await client.post(
        "/api/v1/sites", json={"name": "Assigned", "type": "t"}, headers=auth(owner)
    )
    await client.post(
        "/api/v1/sites", json={"name": "Unassigned", "type": "t"}, headers=auth(owner)
    )
    assigned_id = a.json()["id"]

    sup = await factory.user(company=company, role=UserRole.supervisor)
    # before assignment: empty
    before = await client.get("/api/v1/sites", headers=auth(sup))
    assert before.json()["items"] == []

    # owner assigns the supervisor to the site
    assign = await client.post(
        f"/api/v1/sites/{assigned_id}/assign",
        json={"user_id": str(sup.id)},
        headers=auth(owner),
    )
    assert assign.status_code == 200, assign.text

    after = await client.get("/api/v1/sites", headers=auth(sup))
    names = {item["name"] for item in after.json()["items"]}
    assert names == {"Assigned"}


async def test_supervisor_can_get_assigned_site_but_not_others(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    a = await client.post(
        "/api/v1/sites", json={"name": "A", "type": "t"}, headers=auth(owner)
    )
    b = await client.post(
        "/api/v1/sites", json={"name": "B", "type": "t"}, headers=auth(owner)
    )
    sup = await factory.user(company=company, role=UserRole.supervisor)
    await client.post(
        f"/api/v1/sites/{a.json()['id']}/assign",
        json={"user_id": str(sup.id)},
        headers=auth(owner),
    )
    ok = await client.get(f"/api/v1/sites/{a.json()['id']}", headers=auth(sup))
    assert ok.status_code == 200
    forbidden = await client.get(f"/api/v1/sites/{b.json()['id']}", headers=auth(sup))
    assert forbidden.status_code == 403


async def test_sites_pagination(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    for i in range(5):
        await client.post(
            "/api/v1/sites", json={"name": f"S{i}", "type": "t"}, headers=auth(owner)
        )
    page1 = await client.get("/api/v1/sites?limit=2", headers=auth(owner))
    assert page1.status_code == 200
    b1 = page1.json()
    assert len(b1["items"]) == 2
    assert b1["next_cursor"] is not None

    page2 = await client.get(
        f"/api/v1/sites?limit=2&cursor={b1['next_cursor']}", headers=auth(owner)
    )
    b2 = page2.json()
    assert len(b2["items"]) == 2

    # collect all by paging
    seen = {i["id"] for i in b1["items"]} | {i["id"] for i in b2["items"]}
    cursor = b2["next_cursor"]
    while cursor:
        p = await client.get(f"/api/v1/sites?limit=2&cursor={cursor}", headers=auth(owner))
        pb = p.json()
        seen |= {i["id"] for i in pb["items"]}
        cursor = pb["next_cursor"]
    assert len(seen) == 5


# ---- users -----------------------------------------------------------------


async def test_owner_creates_user_with_role(client, owner):
    resp = await client.post(
        "/api/v1/users",
        json={"name": "Sup One", "phone": "+19990000001", "role": "supervisor"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["role"] == "supervisor"
    assert body["company_id"] == str(owner.company_id)


async def test_list_users_company_scoped(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await client.post(
        "/api/v1/users",
        json={"name": "B", "phone": "+19990000010", "role": "pm"},
        headers=auth(owner),
    )
    other = await factory.company(name="Other")
    await factory.user(company=other, role=UserRole.owner)

    resp = await client.get("/api/v1/users", headers=auth(owner))
    assert resp.status_code == 200
    for item in resp.json()["items"]:
        assert item["company_id"] == str(company.id)


async def test_supervisor_cannot_list_users(client, factory):
    sup = await factory.user(role=UserRole.supervisor)
    resp = await client.get("/api/v1/users", headers=auth(sup))
    assert resp.status_code == 403


# ---- whatsapp groups -------------------------------------------------------


async def test_create_and_list_whatsapp_group(client, factory, owner):
    site = await client.post(
        "/api/v1/sites", json={"name": "WG Site", "type": "t"}, headers=auth(owner)
    )
    site_id = site.json()["id"]
    resp = await client.post(
        "/api/v1/whatsapp-groups",
        json={
            "external_group_id": "grp-123",
            "source": "baileys",
            "site_id": site_id,
            "label": "Site A Chat",
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["external_group_id"] == "grp-123"
    assert body["site_id"] == site_id

    listing = await client.get("/api/v1/whatsapp-groups", headers=auth(owner))
    assert listing.status_code == 200
    ids = {g["external_group_id"] for g in listing.json()["items"]}
    assert "grp-123" in ids


async def test_whatsapp_group_duplicate_rejected(client, owner):
    payload = {"external_group_id": "dup-1", "source": "baileys", "site_id": None, "label": "x"}
    first = await client.post("/api/v1/whatsapp-groups", json=payload, headers=auth(owner))
    assert first.status_code == 201
    second = await client.post("/api/v1/whatsapp-groups", json=payload, headers=auth(owner))
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "conflict"


async def test_whatsapp_group_same_id_different_source_ok(client, owner):
    p1 = {"external_group_id": "g-x", "source": "baileys", "site_id": None, "label": None}
    p2 = {"external_group_id": "g-x", "source": "cloud_api", "site_id": None, "label": None}
    r1 = await client.post("/api/v1/whatsapp-groups", json=p1, headers=auth(owner))
    r2 = await client.post("/api/v1/whatsapp-groups", json=p2, headers=auth(owner))
    assert r1.status_code == 201
    assert r2.status_code == 201


# ---- site baseline ---------------------------------------------------------


async def test_owner_can_set_and_read_site_baseline(client, owner):
    create = await client.post(
        "/api/v1/sites", json={"name": "Base Site", "type": "t"}, headers=auth(owner)
    )
    site_id = create.json()["id"]

    resp = await client.put(
        f"/api/v1/sites/{site_id}/baseline",
        json={"expected_daily_headcount": 20, "notes": "G+3 slab crew"},
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["site_id"] == site_id
    assert body["expected_daily_headcount"] == 20
    assert body["notes"] == "G+3 slab crew"

    read = await client.get(f"/api/v1/sites/{site_id}/baseline", headers=auth(owner))
    assert read.status_code == 200
    assert read.json()["expected_daily_headcount"] == 20


async def test_set_baseline_upserts_single_row(client, owner):
    create = await client.post(
        "/api/v1/sites", json={"name": "S", "type": "t"}, headers=auth(owner)
    )
    site_id = create.json()["id"]
    await client.put(
        f"/api/v1/sites/{site_id}/baseline",
        json={"expected_daily_headcount": 10},
        headers=auth(owner),
    )
    second = await client.put(
        f"/api/v1/sites/{site_id}/baseline",
        json={"expected_daily_headcount": 25},
        headers=auth(owner),
    )
    assert second.status_code == 200
    assert second.json()["expected_daily_headcount"] == 25


async def test_pm_can_set_baseline(client, factory):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    create = await client.post(
        "/api/v1/sites", json={"name": "S", "type": "t"}, headers=auth(pm)
    )
    site_id = create.json()["id"]
    resp = await client.put(
        f"/api/v1/sites/{site_id}/baseline",
        json={"expected_daily_headcount": 15},
        headers=auth(pm),
    )
    assert resp.status_code == 200


async def test_supervisor_cannot_set_baseline(client, factory, owner):
    create = await client.post(
        "/api/v1/sites", json={"name": "S", "type": "t"}, headers=auth(owner)
    )
    site_id = create.json()["id"]
    sup = await factory.user(role=UserRole.supervisor)
    resp = await client.put(
        f"/api/v1/sites/{site_id}/baseline",
        json={"expected_daily_headcount": 15},
        headers=auth(sup),
    )
    assert resp.status_code == 403


async def test_set_baseline_rejects_nonpositive(client, owner):
    create = await client.post(
        "/api/v1/sites", json={"name": "S", "type": "t"}, headers=auth(owner)
    )
    site_id = create.json()["id"]
    resp = await client.put(
        f"/api/v1/sites/{site_id}/baseline",
        json={"expected_daily_headcount": 0},
        headers=auth(owner),
    )
    assert resp.status_code == 422


async def test_get_baseline_unset_returns_null(client, owner):
    create = await client.post(
        "/api/v1/sites", json={"name": "S", "type": "t"}, headers=auth(owner)
    )
    site_id = create.json()["id"]
    resp = await client.get(f"/api/v1/sites/{site_id}/baseline", headers=auth(owner))
    assert resp.status_code == 200
    assert resp.json()["expected_daily_headcount"] is None


async def test_set_baseline_on_missing_site_404(client, owner):
    resp = await client.put(
        f"/api/v1/sites/{uuid4()}/baseline",
        json={"expected_daily_headcount": 15},
        headers=auth(owner),
    )
    assert resp.status_code == 404


# ---- architect visibility --------------------------------------------------


async def test_architect_sees_all_company_sites_without_assignment(client, factory):
    """Architect is a company-wide design authority: no SiteAssignment rows needed."""
    company = await factory.company()
    await factory.site(company=company, name="Site A")
    await factory.site(company=company, name="Site B")
    architect = await factory.user(company=company, role=UserRole.architect)
    token = create_access_token(str(architect.id), architect.role.value)
    resp = await client.get(
        "/api/v1/sites", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    names = {s["name"] for s in resp.json()["items"]}
    assert names == {"Site A", "Site B"}
