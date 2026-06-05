"""Homeowner scaffold step of the WhatsApp import (scripts.import_whatsapp_export).

Verifies the import can publish a homeowner-facing view (property + rooms +
milestones + a Project-Updates timeline mapped from real progress/issue events)
onto an imported site, and that re-running is idempotent.
"""
from contextlib import asynccontextmanager
from datetime import date
from uuid import uuid4

from sqlalchemy import func, select

from app.models import (
    Milestone,
    Property,
    SiteEventModel,
    Space,
    SpaceKind,
    Update,
    UpdateType,
    UserRole,
)
from scripts.import_whatsapp_export import scaffold_homeowner


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


async def _event(db_session, site_id, etype, summary, on=date(2026, 5, 1)):
    ev = SiteEventModel(
        id=uuid4(), site_id=site_id, event_type=etype, occurred_on=on,
        summary=summary, fields={}, confidence=0.9, needs_clarification=False,
        source_message_ids=[], version=1,
    )
    db_session.add(ev)
    await db_session.flush()
    return ev


async def test_scaffold_publishes_homeowner_view(db_session, factory):
    company = await factory.company()
    site = await factory.site(company=company, name="Tripathi Dream Home")
    await factory.user(company=company, role=UserRole.owner)
    await _event(db_session, site.id, "progress_update", "Lift area 2nd coat whitewash going on")
    await _event(db_session, site.id, "issue", "Granite margin short on the sitout")
    await _event(db_session, site.id, "material_delivery", "100 bags cement")  # NOT a card
    await _event(db_session, site.id, "progress_update", "No message provided.")  # skipped

    world = {"site_id": site.id, "company_id": company.id}
    counts = await scaffold_homeowner(world, session_factory=_session_factory(db_session))

    # Property published.
    prop = (
        await db_session.execute(select(Property).where(Property.site_id == site.id))
    ).scalars().all()
    assert len(prop) == 1
    assert prop[0].display_name == "Tripathi Dream Home"

    # Room skeleton: 2 floors + 8 rooms = 10 spaces.
    spaces = (
        await db_session.execute(select(Space).where(Space.site_id == site.id))
    ).scalars().all()
    assert len(spaces) == 10
    assert sum(1 for s in spaces if s.kind == SpaceKind.floor) == 2

    # 4 milestones.
    ms = (
        await db_session.execute(select(Milestone).where(Milestone.site_id == site.id))
    ).scalars().all()
    assert len(ms) == 4

    # Timeline: only the progress + issue events become cards (cement excluded,
    # "No message provided." skipped) -> 2 updates with the right types.
    ups = (
        await db_session.execute(select(Update).where(Update.site_id == site.id))
    ).scalars().all()
    assert len(ups) == 2
    types = {u.type for u in ups}
    assert types == {UpdateType.progress, UpdateType.delay}
    assert counts["updates"] == 2


async def test_scaffold_is_idempotent(db_session, factory):
    company = await factory.company()
    site = await factory.site(company=company, name="Tripathi Dream Home")
    await factory.user(company=company, role=UserRole.owner)
    await _event(db_session, site.id, "progress_update", "Slab work continuing")

    world = {"site_id": site.id, "company_id": company.id}
    sf = _session_factory(db_session)
    await scaffold_homeowner(world, session_factory=sf)
    await scaffold_homeowner(world, session_factory=sf)  # re-run

    for model in (Property, Update):
        n = (
            await db_session.execute(
                select(func.count()).select_from(model).where(model.site_id == site.id)
            )
        ).scalar()
        assert n == (1 if model is Property else 1), f"{model.__name__} duplicated"
    n_spaces = (
        await db_session.execute(
            select(func.count()).select_from(Space).where(Space.site_id == site.id)
        )
    ).scalar()
    assert n_spaces == 10  # not 20 — upserted, not duplicated
