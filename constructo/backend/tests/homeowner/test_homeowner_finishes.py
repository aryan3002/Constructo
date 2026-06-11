"""TDD: GET /api/v1/homeowner/finishes — room-grouped, cost-firewalled, room-narrowed.

Contract:
* Returns material finishes grouped by room (Space.name).
* cost fields (unit_rate, wastage_pct, line_total) NEVER appear in the response.
* approved → "chosen"; pending → "deciding"; rejected specs are excluded.
* Members with design_space_id set see only finishes for their scoped room.
* A non-member gets 403.
"""
from decimal import Decimal

from app.models import (
    Component,
    HomeownerMember,
    HomeownerSubRole,
    Material,
    MemberStatus,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
    UserRole,
)

from .conftest import auth

# ─── helpers ────────────────────────────────────────────────────────────────


async def _seed_spec(
    db_session,
    *,
    company,
    site,
    space,
    comp_name="Floor",
    material=None,
    qty=Decimal("10"),
    unit="Sq Ft",
    unit_rate=Decimal("120"),
    wastage_pct=Decimal("5"),
    approval_status=SpecApprovalStatus.approved,
    label="FL-Tile",
    client_final_code="FL-A3",
):
    """Create Component + Spec, flushing between so IDs are assigned."""
    comp = Component(space_id=space.id, name=comp_name)
    db_session.add(comp)
    await db_session.flush()  # assigns comp.id

    spec = Spec(
        company_id=company.id,
        site_id=site.id,
        component_id=comp.id,
        material_id=material.id if material else None,
        label=label,
        qty=qty,
        unit=unit,
        unit_rate=unit_rate,
        wastage_pct=wastage_pct,
        approval_status=approval_status,
        client_final_code=client_final_code,
    )
    db_session.add(spec)
    return comp, spec


# ─── Test 1: grouped by room, status "chosen", NO cost fields ───────────────


async def test_finishes_grouped_by_room_no_cost_fields(client, factory, db_session):
    """Seed site with Living Room / Floor / Kajaria tile + approved spec.
    Assert: 200; room == "Living Room"; element == "Floor"; brand == "Kajaria";
    status == "chosen"; client_final_code == "FL-A3";
    and the serialised JSON contains NO unit_rate / wastage_pct / line_total keys.
    """
    company = await factory.company()
    site = await factory.site(company, name="Sunrise Villa")
    homeowner = await factory.user(company=company, role=UserRole.homeowner)

    member = HomeownerMember(
        site_id=site.id,
        user_id=homeowner.id,
        sub_role=HomeownerSubRole.primary_owner,
        status=MemberStatus.active,
    )
    db_session.add(member)
    await db_session.flush()

    room = Space(site_id=site.id, name="Living Room", kind=SpaceKind.room)
    db_session.add(room)
    await db_session.flush()

    material = Material(
        company_id=company.id,
        name="Kajaria Ivory",
        brand="Kajaria",
        colour="Ivory Beige",
        finish="Matt",
        category="Tile",
    )
    db_session.add(material)
    await db_session.flush()

    _comp, _spec = await _seed_spec(
        db_session,
        company=company,
        site=site,
        space=room,
        comp_name="Floor",
        material=material,
        qty=Decimal("10"),
        unit="Sq Ft",
        unit_rate=Decimal("120"),
        wastage_pct=Decimal("5"),
        approval_status=SpecApprovalStatus.approved,
        client_final_code="FL-A3",
    )
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/homeowner/finishes?site_id={site.id}",
        headers=auth(homeowner),
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()
    assert len(body["rooms"]) == 1

    room_data = body["rooms"][0]
    assert room_data["room"] == "Living Room"
    assert len(room_data["items"]) == 1

    item = room_data["items"][0]
    assert item["element"] == "Floor"
    assert item["brand"] == "Kajaria"
    assert item["colour"] == "Ivory Beige"
    assert item["finish"] == "Matt"
    assert item["category"] == "Tile"
    assert item["status"] == "chosen"
    assert item["client_final_code"] == "FL-A3"

    # The firewall: cost fields must NEVER appear in the serialised output.
    text = resp.text
    assert "unit_rate" not in text
    assert "wastage_pct" not in text
    assert "line_total" not in text


# ─── Test 2: pending → "deciding"; rejected → absent ───────────────────────


async def test_pending_is_deciding_and_rejected_hidden(client, factory, db_session):
    """One pending spec → status=="deciding"; one rejected spec → absent."""
    company = await factory.company()
    site = await factory.site(company, name="Mango Villa")
    homeowner = await factory.user(company=company, role=UserRole.homeowner)

    member = HomeownerMember(
        site_id=site.id,
        user_id=homeowner.id,
        sub_role=HomeownerSubRole.primary_owner,
        status=MemberStatus.active,
    )
    db_session.add(member)
    await db_session.flush()

    room = Space(site_id=site.id, name="Bedroom", kind=SpaceKind.room)
    db_session.add(room)
    await db_session.flush()

    _comp_p, _spec_p = await _seed_spec(
        db_session,
        company=company,
        site=site,
        space=room,
        comp_name="Ceiling",
        approval_status=SpecApprovalStatus.pending,
        label="pending-tile",
        client_final_code=None,
    )
    _comp_r, _spec_r = await _seed_spec(
        db_session,
        company=company,
        site=site,
        space=room,
        comp_name="Skirting",
        approval_status=SpecApprovalStatus.rejected,
        label="rejected-tile",
        client_final_code=None,
    )
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/homeowner/finishes?site_id={site.id}",
        headers=auth(homeowner),
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()
    # Only one room (Bedroom), and only one item (rejected is hidden).
    assert len(body["rooms"]) == 1
    items = body["rooms"][0]["items"]
    assert len(items) == 1

    assert items[0]["element"] == "Ceiling"
    assert items[0]["status"] == "deciding"

    # Confirm rejected element is absent.
    elements = [i["element"] for i in items]
    assert "Skirting" not in elements


# ─── Test 3: room-narrowed member sees only their room ──────────────────────


async def test_room_narrowed_member_sees_only_their_room(client, factory, db_session):
    """A member with design_space_id=<kitchen> sees only kitchen finishes."""
    company = await factory.company()
    site = await factory.site(company, name="Lotus Heights")
    homeowner = await factory.user(company=company, role=UserRole.homeowner)

    # Two rooms: Living Room and Kitchen.
    living = Space(site_id=site.id, name="Living Room", kind=SpaceKind.room)
    kitchen = Space(site_id=site.id, name="Kitchen", kind=SpaceKind.room)
    db_session.add(living)
    db_session.add(kitchen)
    await db_session.flush()

    member = HomeownerMember(
        site_id=site.id,
        user_id=homeowner.id,
        sub_role=HomeownerSubRole.family,
        status=MemberStatus.active,
        design_space_id=kitchen.id,  # scoped to kitchen only
    )
    db_session.add(member)
    await db_session.flush()

    # Spec in Living Room (should be hidden for this member).
    _comp_l, _spec_l = await _seed_spec(
        db_session,
        company=company,
        site=site,
        space=living,
        comp_name="Floor",
        approval_status=SpecApprovalStatus.approved,
        label="living-tile",
    )
    # Spec in Kitchen (should be visible).
    _comp_k, _spec_k = await _seed_spec(
        db_session,
        company=company,
        site=site,
        space=kitchen,
        comp_name="Counter",
        approval_status=SpecApprovalStatus.approved,
        label="kitchen-counter",
    )
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/homeowner/finishes?site_id={site.id}",
        headers=auth(homeowner),
    )
    assert resp.status_code == 200, resp.text

    body = resp.json()
    room_names = [r["room"] for r in body["rooms"]]
    assert "Kitchen" in room_names
    assert "Living Room" not in room_names

    items = body["rooms"][0]["items"]
    assert len(items) == 1
    assert items[0]["element"] == "Counter"


# ─── Test 4: non-member gets 403 ────────────────────────────────────────────


async def test_non_member_forbidden(client, factory, db_session):
    """A user who isn't a homeowner member of the site gets 403."""
    company = await factory.company()
    site = await factory.site(company, name="Cedar House")
    outsider = await factory.user(company=company, role=UserRole.homeowner)
    # outsider has no HomeownerMember row for this site.

    resp = await client.get(
        f"/api/v1/homeowner/finishes?site_id={site.id}",
        headers=auth(outsider),
    )
    assert resp.status_code in (401, 403), resp.text
