"""Spec-enrichment pass (scripts.enrich_specs).

Seeds the imported company/site + a couple of ``material_delivery`` SiteEvents +
a room Space, injects a network-free FakeLLM whose canned result lists three
specs across different routing statuses, and asserts:
  * three Spec rows are upserted with the right approval/routing state,
  * each spec binds to a real Component (NOT NULL component_id is satisfied),
  * a second run() creates no duplicates (uuid5 idempotency), and
  * no material/finish signal yields zero specs.
"""
from contextlib import asynccontextmanager
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import func, select

import scripts.enrich_specs as es
from app.extraction.llm import FakeLLMClient
from app.models import (
    Company,
    Component,
    Material,
    Site,
    SiteEventModel,
    Space,
    SpaceKind,
    Spec,
    SpecApprovalStatus,
)
from app.specs.schemas import _routing_status

# Canned proposal every complete() call returns: 3 specs across 3 statuses.
_CANNED = {
    "specs": [
        {
            "area": "Master Bedroom",
            "item": "Flooring",
            "material": "Italian marble",
            "unit": "sqft",
            "status": "released",
        },
        {
            "area": "Kitchen",
            "item": "Countertop",
            "material": "Granite",
            "unit": "sqft",
            "status": "out_for_approval",
        },
        {
            "area": "Living Room",
            "item": "Walls",
            "material": None,
            "unit": None,
            "status": "draft",
        },
    ]
}


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


@pytest.fixture(autouse=True)
def _fake_llm(monkeypatch):
    """Force run() onto a canned, network-free FakeLLM (no Azure)."""
    monkeypatch.setattr(
        es, "get_llm_client", lambda tier="smart": FakeLLMClient(canned=_CANNED)
    )


async def _seed(db_session, *, with_signal: bool = True) -> Site:
    """Imported company + site + (optionally) material_delivery events + a room."""
    company = Company(id=es._id("company"), name="CivilArch (CADS)")
    db_session.add(company)
    await db_session.flush()
    site = Site(id=es._id("site"), company_id=company.id, name="Tripathi Dream Home")
    db_session.add(site)
    await db_session.flush()

    # A real room Space (anchors specs whose area matches).
    db_session.add(
        Space(id=uuid4(), site_id=site.id, parent_id=None, name="Master Bedroom",
              kind=SpaceKind.room, order=0)
    )

    if with_signal:
        for i, mat in enumerate(("cement", "granite")):
            db_session.add(
                SiteEventModel(
                    id=uuid4(),
                    site_id=site.id,
                    event_type="material_delivery",
                    occurred_on=date(2026, 3, 10 + i),
                    summary=f"{mat} delivered",
                    fields={"material": mat, "quantity": 10},
                    confidence=0.9,
                    source_message_ids=[],
                )
            )
    await db_session.flush()
    return site


async def test_enrich_specs_creates_rows_with_routing(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    counts = await es.run(session_factory=sf)

    assert counts["materials_seen"] == 2
    assert counts["specs"] == 3

    rows = (
        await db_session.execute(select(Spec).where(Spec.site_id == site.id))
    ).scalars().all()
    assert len(rows) == 3
    assert all(s.company_id == es._id("company") for s in rows)
    # Every spec binds to a real component (NOT NULL component_id satisfied).
    assert all(s.component_id is not None for s in rows)

    by_label = {s.label: s for s in rows}
    # released → approved + released_at stamped.
    released = by_label["Flooring"]
    assert released.approval_status == SpecApprovalStatus.approved
    assert released.released_at is not None
    assert _routing_status(
        released.approval_status, released.sent_at, released.released_at
    ) == "released"
    assert released.material_id is not None  # Italian marble material created

    # out_for_approval → pending + sent_at, no released_at.
    ofa = by_label["Countertop"]
    assert ofa.approval_status == SpecApprovalStatus.pending
    assert ofa.sent_at is not None
    assert ofa.released_at is None
    assert _routing_status(ofa.approval_status, ofa.sent_at, ofa.released_at) == (
        "out_for_approval"
    )

    # draft → pending, no stamps, no material (canned material was null).
    draft = by_label["Walls"]
    assert draft.approval_status == SpecApprovalStatus.pending
    assert draft.sent_at is None and draft.released_at is None
    assert _routing_status(draft.approval_status, draft.sent_at, draft.released_at) == (
        "draft"
    )
    assert draft.material_id is None

    # Materials only created where the proposal named one (2 of 3).
    mats = (
        await db_session.execute(
            select(func.count()).select_from(Material).where(
                Material.company_id == es._id("company")
            )
        )
    ).scalar()
    assert mats == 2

    # The "Master Bedroom" spec anchored to the EXISTING room, not a new floor.
    comp = (
        await db_session.execute(
            select(Component).where(Component.id == released.component_id)
        )
    ).scalar_one()
    anchor = (
        await db_session.execute(select(Space).where(Space.id == comp.space_id))
    ).scalar_one()
    assert anchor.name == "Master Bedroom"
    assert anchor.kind == SpaceKind.room


async def test_enrich_specs_is_idempotent(db_session):
    site = await _seed(db_session)
    sf = _session_factory(db_session)

    await es.run(session_factory=sf)
    second = await es.run(session_factory=sf)  # re-run upserts the same rows

    assert second["specs"] == 3
    n_spec = (
        await db_session.execute(
            select(func.count()).select_from(Spec).where(Spec.site_id == site.id)
        )
    ).scalar()
    assert n_spec == 3  # not 6
    n_comp = (
        await db_session.execute(
            select(func.count()).select_from(Component)
        )
    ).scalar()
    assert n_comp == 3  # one component per spec, not duplicated


async def test_enrich_specs_no_signal_is_zero(db_session):
    site = await _seed(db_session, with_signal=False)

    counts = await es.run(session_factory=_session_factory(db_session))

    assert counts["specs"] == 0
    n = (
        await db_session.execute(
            select(func.count()).select_from(Spec).where(Spec.site_id == site.id)
        )
    ).scalar()
    assert n == 0
