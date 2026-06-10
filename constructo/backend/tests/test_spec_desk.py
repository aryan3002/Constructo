"""TDD: GET /api/v1/specs/desk — room-grouped spec lines + per-line costing."""
from decimal import Decimal

from app.auth.jwt import create_access_token
from app.models import Component, Material, Space, SpaceKind, Spec, UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_desk_groups_rooms_with_lines_and_totals(client, factory, db_session):
    """Seed one room + component + material + spec; assert room grouping, line detail,
    per-line total, grand_total, and excluded_total."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)

    room = Space(site_id=site.id, name="Living Room", kind=SpaceKind.room)
    db_session.add(room)
    await db_session.flush()

    comp = Component(space_id=room.id, name="Floor", location="Wall A")
    db_session.add(comp)
    await db_session.flush()

    material = Material(
        company_id=company.id,
        name="Kajaria Tile",
        brand="Kajaria",
        sku="ETW-8080",
        category="Tile",
        colour=None,
        finish=None,
    )
    db_session.add(material)
    await db_session.flush()

    spec = Spec(
        company_id=company.id,
        site_id=site.id,
        component_id=comp.id,
        material_id=material.id,
        label="Floor",
        qty=Decimal("10"),
        unit_rate=Decimal("100"),
        wastage_pct=Decimal("10"),
    )
    db_session.add(spec)
    await db_session.commit()

    resp = await client.get(f"/api/v1/specs/desk?site_id={site.id}", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["rooms"]) == 1
    room_data = body["rooms"][0]
    assert room_data["room"] == "Living Room"
    assert room_data["total"] == "1100.00"
    assert room_data["excluded"] == 0

    assert len(room_data["lines"]) == 1
    line = room_data["lines"][0]
    assert line["element"] == "Floor"
    assert line["brand"] == "Kajaria"
    assert line["sku"] == "ETW-8080"
    assert line["category"] == "Tile"
    assert line["line_total"] == "1100.00"
    assert line["approval_status"] == "pending"

    assert body["grand_total"] == "1100.00"
    assert body["excluded_total"] == 0


async def test_desk_counts_unpriced_lines(client, factory, db_session):
    """A spec with qty but no unit_rate → line_total is null; excluded == 1,
    room total == 0.00, excluded_total == 1."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)

    room = Space(site_id=site.id, name="Kitchen", kind=SpaceKind.room)
    db_session.add(room)
    await db_session.flush()

    comp = Component(space_id=room.id, name="Backsplash", location=None)
    db_session.add(comp)
    await db_session.flush()

    spec = Spec(
        company_id=company.id,
        site_id=site.id,
        component_id=comp.id,
        material_id=None,
        label="Backsplash Tile",
        qty=Decimal("5"),
        unit_rate=None,  # unpriced
        wastage_pct=None,
    )
    db_session.add(spec)
    await db_session.commit()

    resp = await client.get(f"/api/v1/specs/desk?site_id={site.id}", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()

    assert len(body["rooms"]) == 1
    room_data = body["rooms"][0]
    assert room_data["room"] == "Kitchen"
    assert room_data["total"] == "0.00"
    assert room_data["excluded"] == 1

    line = room_data["lines"][0]
    assert line["line_total"] is None

    assert body["grand_total"] == "0.00"
    assert body["excluded_total"] == 1
