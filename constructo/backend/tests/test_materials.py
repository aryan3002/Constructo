"""Material/catalog master CRUD (W4.6)."""
from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_owner_creates_and_lists_material(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()

    created = await client.post(
        "/api/v1/materials",
        json={"name": "OPC 53 Cement", "unit": "bag", "category": "binder"},
        headers=auth(owner),
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "OPC 53 Cement"
    assert body["unit"] == "bag"
    assert body["is_active"] is True

    listed = await client.get("/api/v1/materials", headers=auth(owner))
    assert listed.status_code == 200
    assert [m["name"] for m in listed.json()] == ["OPC 53 Cement"]


async def test_pm_creates_supervisor_cannot(client, factory, db_session):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    sup = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()

    assert (
        await client.post("/api/v1/materials", json={"name": "Rebar"}, headers=auth(pm))
    ).status_code == 201
    assert (
        await client.post("/api/v1/materials", json={"name": "Nope"}, headers=auth(sup))
    ).status_code == 403


async def test_supervisor_can_read_materials(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    sup = await factory.user(company=company, role=UserRole.supervisor)
    await db_session.commit()
    await client.post("/api/v1/materials", json={"name": "Sand"}, headers=auth(owner))

    listed = await client.get("/api/v1/materials", headers=auth(sup))
    assert listed.status_code == 200
    assert [m["name"] for m in listed.json()] == ["Sand"]


async def test_update_and_archive_material(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    await db_session.commit()
    mid = (
        await client.post("/api/v1/materials", json={"name": "Old"}, headers=auth(owner))
    ).json()["id"]

    renamed = await client.patch(
        f"/api/v1/materials/{mid}",
        json={"name": "TMT Steel", "unit": "kg"},
        headers=auth(owner),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "TMT Steel"
    assert renamed.json()["unit"] == "kg"

    await client.patch(
        f"/api/v1/materials/{mid}", json={"is_active": False}, headers=auth(owner)
    )
    assert (await client.get("/api/v1/materials", headers=auth(owner))).json() == []
    archived = await client.get(
        "/api/v1/materials?include_archived=true", headers=auth(owner)
    )
    assert len(archived.json()) == 1
    assert archived.json()[0]["is_active"] is False


async def test_cannot_touch_other_companys_material(client, factory, db_session):
    owner_a = await factory.user(role=UserRole.owner)
    owner_b = await factory.user(role=UserRole.owner)
    await db_session.commit()
    mid = (
        await client.post("/api/v1/materials", json={"name": "A's"}, headers=auth(owner_a))
    ).json()["id"]

    assert (await client.get("/api/v1/materials", headers=auth(owner_b))).json() == []
    resp = await client.patch(
        f"/api/v1/materials/{mid}", json={"name": "hijack"}, headers=auth(owner_b)
    )
    assert resp.status_code == 404
