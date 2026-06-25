"""The construction-sequence layer (intelligence baseline) — pure functions.

Extends milestone_reference (durations) with explicit phase identity, ordering,
dependencies, overlap, and a phase -> expected work/material map that the
schedule and consistency detectors stand on. Hand-computable assertions only.
"""
from app.intelligence.sequence import (
    canonical_phase,
    depends_on,
    phase_for_material,
    phase_order,
    phases_can_overlap,
    violates_sequence,
)

# ---- canonical_phase: free-text milestone name -> canonical phase key ----

def test_canonical_phase_maps_common_names():
    assert canonical_phase("Foundation work") == "foundation"
    assert canonical_phase("RCC slab curing") == "curing"
    assert canonical_phase("Structure & slabs") == "structure"
    assert canonical_phase("Plastering") == "plastering"
    assert canonical_phase("Internal flooring & tiling") == "flooring"
    assert canonical_phase("Brickwork / masonry") == "brickwork"


def test_canonical_phase_unknown_returns_none():
    assert canonical_phase("some random milestone xyz") is None
    assert canonical_phase("") is None


# ---- phase_order: sequence position ----

def test_phase_order_follows_construction_sequence():
    assert phase_order("excavation") == 0
    assert phase_order("foundation") == 1
    assert phase_order("handover") == 14
    assert phase_order("excavation") < phase_order("brickwork") < phase_order("painting")


def test_phase_order_unknown_is_none():
    assert phase_order("nonsense") is None


# ---- depends_on: prerequisites ----

def test_depends_on_returns_direct_prerequisites():
    assert depends_on("excavation") == ()
    assert depends_on("foundation") == ("excavation",)
    assert depends_on("plastering") == ("electrical", "plumbing")


def test_depends_on_unknown_is_empty():
    assert depends_on("nonsense") == ()


# ---- phases_can_overlap: legitimate parallelism ----

def test_overlap_is_symmetric_for_parallel_trades():
    assert phases_can_overlap("electrical", "plumbing") is True
    assert phases_can_overlap("plumbing", "electrical") is True
    assert phases_can_overlap("flooring", "painting") is True


def test_sequential_phases_do_not_overlap():
    assert phases_can_overlap("foundation", "plastering") is False
    assert phases_can_overlap("foundation", "foundation") is False


# ---- phase_for_material: which phases consume a material ----

def test_phase_for_material_maps_to_consuming_phases():
    assert phase_for_material("cement") == (
        "foundation", "plinth", "structure", "brickwork", "plastering",
    )
    assert phase_for_material("tile") == ("flooring",)


def test_phase_for_material_unknown_or_none_is_empty():
    assert phase_for_material(None) == ()
    assert phase_for_material("unobtainium") == ()


# ---- violates_sequence: started before prerequisites complete ----

def test_violates_sequence_when_prerequisite_incomplete():
    assert violates_sequence("plastering", {"brickwork"}) is True


def test_no_violation_when_prerequisites_complete():
    assert violates_sequence("plastering", {"electrical", "plumbing"}) is False
    assert violates_sequence("excavation", set()) is False
    assert violates_sequence("painting", {"plastering"}) is False
