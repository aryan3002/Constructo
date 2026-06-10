"""Spec engine — Material Specification line items (Spec)."""
from decimal import Decimal

from app.auth.jwt import create_access_token
from app.models import (
    Component,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
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
