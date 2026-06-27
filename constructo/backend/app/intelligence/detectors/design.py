"""Design-fidelity detectors (Phase 4): does what's being installed match the
homeowner's approved taste?

Reuses the profiler's deterministic core — ``app.profiler.taste.check_consistency``
and the per-area ``taste_model`` — so the JUDGMENT stays math, not a fresh model.
``material_theme_clash`` is fully deterministic; ``photo_vs_theme`` (separate)
adds one vision call to extract a photo's attributes first.

Conservative by construction: only a clear ``conflict`` (a strong negative taste
score) flags; tension/consistent stay silent, and an empty taste_model abstains.
This protects homeowner trust — it never cries wolf.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from app.extraction.llm import LLMClient
from app.intelligence.detectors.base import Finding
from app.profiler.extraction import extract_reference_attributes
from app.profiler.taste import check_consistency

# Concrete material words -> abstract taste vocabulary. Both the abstract bucket
# AND the raw words are emitted, to maximise overlap with whatever vocabulary the
# profiler's vision extraction produced for the taste_model.
_COLOR_BUCKETS = {
    "light": {"white", "off-white", "offwhite", "cream", "ivory", "beige", "light",
              "pale", "pastel", "sand", "linen"},
    "dark": {"black", "charcoal", "dark", "ebony", "graphite", "grey", "gray", "slate"},
}
_MATERIAL_BUCKETS = {
    "wood": {"wood", "wooden", "oak", "teak", "walnut", "ply", "plywood", "laminate",
             "veneer", "timber"},
    "metal": {"metal", "steel", "stainless", "chrome", "aluminium", "aluminum",
              "brass", "iron"},
    "stone": {"marble", "granite", "stone", "quartz", "terrazzo", "sandstone"},
}


def _words(*parts: str | None) -> set[str]:
    out: set[str] = set()
    for p in parts:
        if p:
            out |= {w for w in re.split(r"[\s/_-]+", p.lower()) if w}
    return out


def _bucketize(words: set[str], buckets: dict[str, set[str]]) -> list[str]:
    vals: list[str] = []
    for name, members in buckets.items():
        hit = words & members
        if hit:
            vals.append(name)          # abstract bucket
            vals.extend(sorted(hit))   # the concrete words too
    return list(dict.fromkeys(vals))


def material_to_attrs(
    *, colour: str | None, finish: str | None, material: str | None
) -> dict:
    """Map a material's concrete attributes to the taste vocabulary, or {} if
    nothing maps confidently (never guess)."""
    cw = _words(colour)
    mw = _words(material)
    attrs: dict[str, list[str]] = {}
    colors = _bucketize(cw, _COLOR_BUCKETS)
    materials = _bucketize(mw, _MATERIAL_BUCKETS)
    if colors:
        attrs["colors"] = colors
    if materials:
        attrs["materials"] = materials
    return attrs


@dataclass
class SpecRow:
    """An installed/finalized material in a design area."""

    id: str
    label: str
    colour: str | None
    finish: str | None
    material: str | None
    area_key: str | None  # which design area (resolved via component -> area)


@dataclass
class AreaTaste:
    area_key: str
    dimensions: dict  # taste_model["dimensions"]: {dim: {value: score}}


def material_theme_clash(specs: list[SpecRow], areas: list[AreaTaste]) -> list[Finding]:
    """Flag a finalized material that clearly conflicts with the homeowner's
    approved taste for its area. Abstains on empty taste or unmappable materials."""
    taste_by_area = {a.area_key: a.dimensions for a in areas if a.dimensions}
    out: list[Finding] = []
    for spec in specs:
        dims = taste_by_area.get(spec.area_key)
        if not dims:
            continue  # no taste signal for this area -> abstain
        attrs = material_to_attrs(colour=spec.colour, finish=spec.finish, material=spec.material)
        if not attrs:
            continue  # nothing mapped -> abstain
        verdict = check_consistency(attrs, dims)
        if verdict.get("status") != "conflict":
            continue  # only a clear conflict flags; tension/consistent stay silent
        out.append(
            Finding(
                finding_type="material_theme_clash",
                severity="medium",
                headline=f"{spec.label} may not match the approved design for {spec.area_key}",
                detail=(
                    f"The selected {spec.label.lower()} "
                    f"({spec.colour or spec.material or 'material'}) appears to go against "
                    f"the homeowner's approved taste for {spec.area_key}. Worth confirming."
                ),
                evidence_event_ids=[spec.id],
                phase="design",
            )
        )
    return out


@dataclass
class PhotoRow:
    """An installed/published photo tied to a design area (via room_tag)."""

    id: str
    image_url: str
    area_key: str | None


async def photo_vs_theme(
    photos: list[PhotoRow], areas: list[AreaTaste], *, llm: LLMClient
) -> list[Finding]:
    """Flag an installed photo whose look clearly conflicts with the homeowner's
    approved taste for its area. One vision call per photo that has area taste to
    compare against; abstains otherwise (no taste -> no call). The homeowner's
    standout signal, so a conflict is high severity."""
    taste_by_area = {a.area_key: a.dimensions for a in areas if a.dimensions}
    out: list[Finding] = []
    for photo in photos:
        dims = taste_by_area.get(photo.area_key)
        if not dims:
            continue
        attrs = await extract_reference_attributes(llm, photo.image_url)
        if not isinstance(attrs, dict):
            continue
        if check_consistency(attrs, dims).get("status") != "conflict":
            continue
        out.append(
            Finding(
                finding_type="photo_vs_theme",
                severity="high",
                headline=(
                    f"Installed work in {photo.area_key} looks different from the design"
                ),
                detail=(
                    f"A photo from {photo.area_key} appears to go against the homeowner's "
                    f"approved taste for that area. Worth confirming before it goes further."
                ),
                evidence_event_ids=[photo.id],
                phase="design",
            )
        )
    return out
