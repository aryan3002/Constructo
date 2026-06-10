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
