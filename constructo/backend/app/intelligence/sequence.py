"""Construction-sequence layer for the proactive-intelligence engine.

Extends ``app.homeowner.milestone_reference`` (which already maps milestone
names -> industry-typical *durations*) with the things the schedule and
consistency detectors also need: a canonical phase *identity*, an explicit
*order*, *dependencies*, legitimate *overlap*, and a phase -> expected
*materials* map.

Pure data + pure functions: no DB, no LLM, hand-computable. Industry-typical and
static for now; the learned-from-history override is a later phase (mirrors the
note in milestone_reference).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Phase:
    key: str
    keywords: tuple[str, ...]
    depends_on: tuple[str, ...] = ()
    overlaps: tuple[str, ...] = ()
    materials: tuple[str, ...] = ()


# Ordered, highest-priority-first for name matching — the FIRST phase with any
# keyword in the normalized milestone name wins, so broad headline phases
# (structure) precede the narrower sub-steps they may textually contain (slab).
# Order in this tuple IS the construction sequence order.
_PHASES: tuple[Phase, ...] = (
    Phase("excavation", ("excavat", "earthwork", "site prep", "digging")),
    Phase("foundation", ("foundation", "footing"),
          depends_on=("excavation",),
          materials=("cement", "steel", "sariya", "saria", "rebar", "aggregate", "gitti")),
    Phase("plinth", ("plinth",), depends_on=("foundation",),
          materials=("cement", "brick", "sand", "reti")),
    Phase("structure", ("structure", "superstructure", "framing", "column", "beam"),
          depends_on=("plinth",),
          materials=("cement", "steel", "sariya", "saria", "rebar", "aggregate",
                     "shuttering", "ply")),
    Phase("curing", ("slab", "curing", "roof slab", "roof cast"),
          depends_on=("structure",)),
    Phase("brickwork", ("brick", "masonry", "blockwork", "block work", "eint", "chinai"),
          depends_on=("curing",),
          materials=("brick", "eint", "block", "cement", "sand", "reti")),
    Phase("waterproofing", ("waterproof",), depends_on=("brickwork",)),
    Phase("electrical", ("electric", "wiring", "conduit"),
          depends_on=("brickwork",), overlaps=("plumbing",),
          materials=("wire", "cable", "conduit", "switch")),
    Phase("plumbing", ("plumb", "sanitary"),
          depends_on=("brickwork",), overlaps=("electrical",),
          materials=("pipe", "cpvc", "upvc", "fitting")),
    Phase("plastering", ("plaster",), depends_on=("electrical", "plumbing"),
          materials=("cement", "sand", "reti")),
    # NB: no "stone" keyword — it is a substring of "milestone" and would
    # mis-match every milestone name. milestone_reference avoids it too.
    Phase("flooring", ("floor", "tiling", "tile", "marble", "granite"),
          depends_on=("plastering",), overlaps=("painting",),
          materials=("tile", "marble", "granite", "stone")),
    Phase("doors_joinery", ("door", "window", "joinery", "carpentry", "woodwork"),
          depends_on=("plastering",),
          materials=("wood", "ply", "laminate", "hardware")),
    Phase("painting", ("paint", "putty", "primer"),
          depends_on=("plastering",), overlaps=("flooring",),
          materials=("paint", "putty", "primer")),
    Phase("finishing", ("interior", "finish", "fit-out", "fitout", "fit out"),
          depends_on=("flooring", "painting")),
    Phase("handover", ("handover", "snag", "possession", "completion"),
          depends_on=("finishing",)),
)

_BY_KEY: dict[str, Phase] = {p.key: p for p in _PHASES}
_ORDER: dict[str, int] = {p.key: i for i, p in enumerate(_PHASES)}


def _normalize(name: str) -> str:
    return " ".join((name or "").lower().split())


def canonical_phase(name: str) -> str | None:
    """Map a free-text milestone name to a canonical phase key, or None.

    Keyword-based and priority-ordered (first match wins), mirroring
    ``milestone_reference.typical_duration_days``. None for empty/unknown — never
    guess.
    """
    normalized = _normalize(name)
    if not normalized:
        return None
    for phase in _PHASES:
        if any(kw in normalized for kw in phase.keywords):
            return phase.key
    return None


def phase_order(phase: str) -> int | None:
    """The 0-based sequence position of a canonical phase, or None if unknown."""
    return _ORDER.get(phase)


def depends_on(phase: str) -> tuple[str, ...]:
    """Prerequisite phase keys that must complete before this phase."""
    p = _BY_KEY.get(phase)
    return p.depends_on if p else ()


def phases_can_overlap(phase_a: str, phase_b: str) -> bool:
    """True if the two phases legitimately run in parallel (e.g. electrical/plumbing)."""
    if phase_a == phase_b:
        return False
    pa = _BY_KEY.get(phase_a)
    return bool(pa and phase_b in pa.overlaps)


def phase_for_material(material: str | None) -> tuple[str, ...]:
    """Canonical phases a delivered material plausibly belongs to (may be several),
    in construction order. Empty for unknown/None."""
    if not material:
        return ()
    m = material.strip().lower()
    if not m:
        return ()
    return tuple(
        p.key for p in _PHASES if any(mat in m for mat in p.materials)
    )


def violates_sequence(active_phase: str, completed_phases: set[str]) -> bool:
    """True if ``active_phase`` started while a direct prerequisite is not complete."""
    deps = depends_on(active_phase)
    return any(d not in completed_phases for d in deps)
