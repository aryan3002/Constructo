"""Industry-typical milestone-duration reference table (homeowner, phase 1).

Why this exists
---------------
The homeowner "Updates → Milestones" tracker shows the *real* elapsed "day N"
for the current phase, but a bare "day 8" gives the homeowner no way to answer
their core anxiety: *"is this normal?"*. Pairing it with an honest, clearly
labelled range — "usually 10–18 days · day 8" — normalizes the timeline without
ever fabricating per-project precision.

What this is (and is NOT)
-------------------------
- These ranges are **static and INDUSTRY-typical**, hand-curated for Indian
  residential construction. They are NOT derived from this project, this
  contractor, or this site. The UI MUST label them as "usually X–Y days"
  (industry-typical), never as a project-specific estimate.
- Matching is by milestone *name/type*: a free-text milestone name (curated by
  the contractor, e.g. "Structure & slabs", "Plastering", "RCC slab curing") is
  mapped to a canonical phase by keyword. Unknown names return ``None`` so the
  UI simply omits the range — we never guess.

Later phase (not built here): derive ranges from the contractor's own
historical milestone durations once there is enough data, and fall back to this
table when there isn't.
"""

# Ordered, highest-priority-first. The FIRST entry with any keyword appearing in
# the normalized milestone name wins, so broad headline phases (e.g. "structure")
# are listed before the narrower sub-steps they may textually contain (e.g.
# "slab"). Each value is an inclusive ``(min_days, max_days)`` typical range.
_REFERENCE: tuple[tuple[tuple[str, ...], tuple[int, int]], ...] = (
    (("excavat", "earthwork", "site prep", "digging"), (3, 7)),
    (("foundation", "footing"), (14, 28)),
    (("plinth",), (7, 14)),
    # Superstructure / framing — the broad headline phase. Listed before "slab"
    # so "Structure & slabs" resolves here, not to the slab-curing range.
    (("structure", "superstructure", "framing", "column", "beam"), (20, 40)),
    (("slab", "curing", "roof slab", "roof cast"), (14, 21)),
    (("brick", "masonry", "blockwork", "block work"), (10, 20)),
    (("waterproof",), (3, 7)),
    (("plaster",), (10, 18)),
    (("electric", "wiring"), (7, 14)),
    (("plumb", "sanitary"), (7, 14)),
    (("floor", "tiling", "tile", "marble", "granite"), (10, 20)),
    (("door", "window", "joinery", "carpentry", "woodwork"), (10, 20)),
    (("paint", "putty"), (7, 14)),
    # Interiors / finishes / fit-out — broad headline; listed late so more
    # specific finish phases (paint, flooring, doors) match first.
    (("interior", "finish", "fit-out", "fitout", "fit out"), (30, 60)),
    (("handover", "snag", "possession", "completion"), (5, 14)),
)


def typical_duration_days(name: str) -> tuple[int, int] | None:
    """Return the industry-typical ``(min, max)`` day range for a milestone name.

    The match is case- and surrounding-whitespace-insensitive and keyword-based.
    Returns ``None`` for an empty or unrecognized name — callers must NOT
    fabricate a range when this is ``None``.
    """
    normalized = " ".join(name.lower().split())
    if not normalized:
        return None
    for keywords, span in _REFERENCE:
        if any(keyword in normalized for keyword in keywords):
            return span
    return None
