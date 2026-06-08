"""Curated industry-typical milestone-duration reference table (phase 1).

These ranges are static, INDUSTRY-typical (never project-specific). The lookup
matches a free-text milestone name to a canonical phase by keyword. A later
phase will derive ranges from a contractor's own history — this only normalizes
"is this normal?" anxiety with honest, clearly-labelled ranges.
"""
from app.homeowner.milestone_reference import typical_duration_days
from app.models import Milestone, MilestoneStatus

from .conftest import auth


def test_known_phases_resolve_to_their_typical_range():
    # Anchored on the values cited in the design handoff.
    assert typical_duration_days("RCC slab curing") == (14, 21)
    assert typical_duration_days("Brickwork") == (10, 20)
    assert typical_duration_days("Plaster") == (10, 18)


def test_matching_is_case_and_whitespace_insensitive():
    assert typical_duration_days("  PLASTERING  ") == (10, 18)
    assert typical_duration_days("brick work") == (10, 20)


def test_compound_headline_resolves_to_the_broader_phase():
    # "Structure & slabs" contains both "structure" and "slab"; the broad
    # headline phase must win over the narrower slab-curing range.
    assert typical_duration_days("Structure & slabs") == typical_duration_days("Structure")
    assert typical_duration_days("Structure & slabs") != (14, 21)


def test_unknown_milestone_returns_none_never_fabricates():
    assert typical_duration_days("Astrology consult") is None
    assert typical_duration_days("") is None


async def test_milestones_endpoint_surfaces_typical_range(client, ctx, db_session):
    """The homeowner /milestones read path attaches the industry-typical range,
    matched by name, and emits null (never a guess) for unrecognized names."""
    db_session.add_all([
        Milestone(site_id=ctx.site.id, name="Plastering", status=MilestoneStatus.now, order=0),
        Milestone(site_id=ctx.site.id, name="Astrology consult",
                  status=MilestoneStatus.upcoming, order=1),
    ])
    await db_session.flush()

    resp = await client.get("/api/v1/homeowner/milestones", headers=auth(ctx.homeowner))
    assert resp.status_code == 200, resp.text
    by_name = {m["name"]: m for m in resp.json()}
    assert by_name["Plastering"]["typical_duration_days"] == [10, 18]
    assert by_name["Astrology consult"]["typical_duration_days"] is None
