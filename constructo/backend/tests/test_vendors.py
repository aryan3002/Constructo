"""Vendor master CRUD (W4.5)."""
from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_owner_creates_and_lists_vendor(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    created = await client.post(
        "/api/v1/vendors",
        json={"name": "Cement Co", "category": "material", "gstin": "29ABCDE1234F1Z5"},
        headers=auth(owner),
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Cement Co"
    assert body["is_active"] is True

    listed = await client.get("/api/v1/vendors", headers=auth(owner))
    assert listed.status_code == 200
    assert [v["name"] for v in listed.json()] == ["Cement Co"]


async def test_pm_can_create_supervisor_cannot(client, factory, db_session):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    sup = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    ok = await client.post("/api/v1/vendors", json={"name": "Steel Ltd"}, headers=auth(pm))
    assert ok.status_code == 201

    denied = await client.post(
        "/api/v1/vendors", json={"name": "Nope"}, headers=auth(sup)
    )
    assert denied.status_code == 403


async def test_supervisor_can_read_vendors(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    sup = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()
    await client.post("/api/v1/vendors", json={"name": "Sand Supply"}, headers=auth(owner))

    listed = await client.get("/api/v1/vendors", headers=auth(sup))
    assert listed.status_code == 200
    assert [v["name"] for v in listed.json()] == ["Sand Supply"]


async def test_update_and_archive_vendor(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()
    vid = (
        await client.post("/api/v1/vendors", json={"name": "Old Name"}, headers=auth(owner))
    ).json()["id"]

    renamed = await client.patch(
        f"/api/v1/vendors/{vid}",
        json={"name": "New Name", "category": "labour"},
        headers=auth(owner),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "New Name"
    assert renamed.json()["category"] == "labour"

    # Archive -> drops out of the default list, back via include_archived.
    await client.patch(f"/api/v1/vendors/{vid}", json={"is_active": False}, headers=auth(owner))
    default = await client.get("/api/v1/vendors", headers=auth(owner))
    assert default.json() == []
    archived = await client.get(
        "/api/v1/vendors?include_archived=true", headers=auth(owner)
    )
    assert len(archived.json()) == 1
    assert archived.json()[0]["is_active"] is False


async def test_cannot_touch_other_companys_vendor(client, factory, db_session):
    owner_a = await factory.user(role=UserRole.owner)  # company A
    owner_b = await factory.user(role=UserRole.owner)  # company B
    await db_session.commit()
    vid = (
        await client.post("/api/v1/vendors", json={"name": "A's vendor"}, headers=auth(owner_a))
    ).json()["id"]

    # B can't see A's vendor, and can't patch it.
    assert (await client.get("/api/v1/vendors", headers=auth(owner_b))).json() == []
    resp = await client.patch(
        f"/api/v1/vendors/{vid}", json={"name": "hijack"}, headers=auth(owner_b)
    )
    assert resp.status_code == 404
