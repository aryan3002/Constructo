"""Spec engine — Material Specification line items (Spec)."""
from decimal import Decimal

from app.auth.jwt import create_access_token
from app.models import (
    Component,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
    UserRole,
)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _room_with_component(factory, db_session, company, site):
    """Seed a Space (room) + Component (wall work item) for the site."""
    room = Space(site_id=site.id, name="Master Bedroom", kind=SpaceKind.room)
    db_session.add(room)
    await db_session.flush()
    comp = Component(space_id=room.id, name="Bed Head Wall", location="Wall A")
    db_session.add(comp)
    await db_session.flush()
    return room, comp


async def test_spec_row_persists(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    spec = Spec(
        company_id=company.id,
        site_id=site.id,
        component_id=comp.id,
        label="Laminate-1",
        qty=Decimal("5"),
        unit="sheets",
        unit_rate=Decimal("1200"),
    )
    db_session.add(spec)
    await db_session.commit()
    await db_session.refresh(spec)

    assert spec.approval_status is SpecApprovalStatus.pending
    assert spec.client_final_code is None
    assert spec.qty == Decimal("5")


async def test_supervisor_creates_owner_lists_specs(client, factory, db_session):
    company = await factory.company()
    await factory.user(company=company)  # role defaults to owner
    sup = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()

    created = await client.post(
        "/api/v1/specs",
        json={
            "site_id": str(site.id),
            "component_id": str(comp.id),
            "label": "Laminate-1",
            "qty": "5",
            "unit": "sheets",
            "unit_rate": "1200",
        },
        headers=auth(sup),
    )
    assert created.status_code == 201
    body = created.json()
    assert body["label"] == "Laminate-1"
    assert body["approval_status"] == "pending"

    owner = await factory.user(company=company, role=UserRole.owner)
    listed = await client.get(f"/api/v1/specs?site_id={site.id}", headers=auth(owner))
    assert listed.status_code == 200
    assert [s["label"] for s in listed.json()] == ["Laminate-1"]


async def test_update_and_approve_spec(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()

    created = await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Louvers"},
        headers=auth(owner),
    )
    spec_id = created.json()["id"]

    updated = await client.patch(
        f"/api/v1/specs/{spec_id}",
        json={"qty": "12", "unit_rate": "300", "unit": "rft"},
        headers=auth(owner),
    )
    assert updated.status_code == 200
    assert updated.json()["qty"] == "12.00"

    approved = await client.post(
        f"/api/v1/specs/{spec_id}/approve",
        json={"status": "approved", "client_final_code": "OS-9006-02"},
        headers=auth(owner),
    )
    assert approved.status_code == 200
    assert approved.json()["approval_status"] == "approved"
    assert approved.json()["client_final_code"] == "OS-9006-02"


async def test_supervisor_cannot_approve(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    sup = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()
    created = await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Paint"},
        headers=auth(owner),
    )
    spec_id = created.json()["id"]
    resp = await client.post(
        f"/api/v1/specs/{spec_id}/approve",
        json={"status": "approved"},
        headers=auth(sup),
    )
    assert resp.status_code == 403


async def test_costing_rollup_endpoint(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()
    await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Laminate-1",
              "qty": "10", "unit_rate": "100", "wastage_pct": "10"},
        headers=auth(owner),
    )
    resp = await client.get(f"/api/v1/specs/rollup?site_id={site.id}", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["grand_total"] == "1100.00"
    assert body["rooms"][0]["room"] == "Master Bedroom"


async def test_architect_creates_and_approves_spec(client, factory, db_session):
    # The Architect owns the spec for interior fit-out firms: can create AND approve.
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()

    created = await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Laminate"},
        headers=auth(architect),
    )
    assert created.status_code == 201
    spec_id = created.json()["id"]

    approved = await client.post(
        f"/api/v1/specs/{spec_id}/approve",
        json={"status": "approved", "client_final_code": "OS-9006-02"},
        headers=auth(architect),
    )
    assert approved.status_code == 200
    assert approved.json()["approval_status"] == "approved"


async def test_desk_routing_status_out_for_approval(client, factory, db_session):
    """A spec that has been routed shows routing_status=='out_for_approval' in /desk."""
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()

    # Create a draft spec
    created = await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Marble Tile"},
        headers=auth(architect),
    )
    assert created.status_code == 201
    spec_id = created.json()["id"]

    # Desk before routing → draft
    desk_before = await client.get(f"/api/v1/specs/desk?site_id={site.id}", headers=auth(architect))
    assert desk_before.status_code == 200
    lines_before = desk_before.json()["rooms"][0]["lines"]
    assert lines_before[0]["routing_status"] == "draft"
    assert lines_before[0]["sent_at"] is None
    assert lines_before[0]["released_at"] is None

    # Route it (designer proposes)
    routed = await client.post(f"/api/v1/specs/{spec_id}/route", headers=auth(architect))
    assert routed.status_code == 200
    assert routed.json()["routing_status"] == "out_for_approval"

    # Desk after routing → out_for_approval, sent_at populated
    desk_after = await client.get(f"/api/v1/specs/desk?site_id={site.id}", headers=auth(architect))
    assert desk_after.status_code == 200
    line = desk_after.json()["rooms"][0]["lines"][0]
    assert line["routing_status"] == "out_for_approval"
    assert line["sent_at"] is not None
    assert line["released_at"] is None


async def test_desk_routing_status_released(client, factory, db_session):
    """An approved-then-released spec shows routing_status=='released' in /desk."""
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()

    created = await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Granite Floor"},
        headers=auth(architect),
    )
    spec_id = created.json()["id"]

    # Route → approve → release
    await client.post(f"/api/v1/specs/{spec_id}/route", headers=auth(architect))
    await client.post(
        f"/api/v1/specs/{spec_id}/approve",
        json={"status": "approved"},
        headers=auth(architect),
    )
    released = await client.post(f"/api/v1/specs/{spec_id}/release", headers=auth(architect))
    assert released.status_code == 200

    desk = await client.get(f"/api/v1/specs/desk?site_id={site.id}", headers=auth(architect))
    assert desk.status_code == 200
    line = desk.json()["rooms"][0]["lines"][0]
    assert line["routing_status"] == "released"
    assert line["released_at"] is not None


async def test_desk_routing_status_returned(client, factory, db_session):
    """A rejected spec shows routing_status=='returned' in /desk."""
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    _room, comp = await _room_with_component(factory, db_session, company, site)
    await db_session.commit()

    created = await client.post(
        "/api/v1/specs",
        json={"site_id": str(site.id), "component_id": str(comp.id), "label": "Vinyl Floor"},
        headers=auth(architect),
    )
    spec_id = created.json()["id"]

    await client.post(f"/api/v1/specs/{spec_id}/route", headers=auth(architect))
    await client.post(
        f"/api/v1/specs/{spec_id}/approve",
        json={"status": "rejected"},
        headers=auth(architect),
    )

    desk = await client.get(f"/api/v1/specs/desk?site_id={site.id}", headers=auth(architect))
    line = desk.json()["rooms"][0]["lines"][0]
    assert line["routing_status"] == "returned"
