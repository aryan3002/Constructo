"""Deterministic taste reducer for the Design Profiler.

PURE functions, NO LLM, NO DB. The trust core: confidence and conflicts are math,
never model output. Operates on plain dicts so it is unit-testable without a database.

Input shapes:
  rankings:   [{"reference_id": str, "contributor_id": str, "stars": int,
                "tags": {"positive": [...], "negative": [...]}}]
  attributes: [{"reference_id": str, "attributes": {"style": str | [str],
                "materials": [str], "colors": str | [str], "lighting": str, ...}}]
"""
from __future__ import annotations

STAR_WEIGHT = {1: -1.0, 2: -0.5, 3: 0.0, 4: 0.5, 5: 1.0}

# A negative quick-tag suppresses a specific (dimension, value).
NEGATIVE_TAG_DIMENSION = {
    "too_dark": ("lighting", "dark"),
    "too_busy": ("decorative_density", "busy"),
    "too_expensive": ("cost", "premium"),
    "hard_to_maintain": ("maintenance", "high"),
}

DIMENSIONS = ("style", "materials", "colors", "lighting")
CONFLICT_THRESHOLD = 0.5


def star_weight(stars: int) -> float:
    return STAR_WEIGHT[stars]


def _values(raw) -> list:
    if raw is None:
        return []
    return raw if isinstance(raw, list) else [raw]


def aggregate_dimension_scores(rankings: list[dict], attributes: list[dict]) -> dict:
    """{dimension: {value: summed_star_weight}} over all rankings x attribute values,
    then negative quick-tags applied."""
    attrs_by_ref = {a["reference_id"]: a["attributes"] for a in attributes}
    scores: dict[str, dict[str, float]] = {d: {} for d in DIMENSIONS}
    for r in rankings:
        ref_attrs = attrs_by_ref.get(r["reference_id"])
        if not ref_attrs:
            continue
        w = star_weight(r["stars"])
        for dim in DIMENSIONS:
            for v in _values(ref_attrs.get(dim)):
                scores[dim][v] = scores[dim].get(v, 0.0) + w
    for r in rankings:
        for tag in (r.get("tags") or {}).get("negative", []):
            # Normalize the app's human label ("Too dark") to the reducer key
            # ("too_dark") so the negative quick-tags actually take effect.
            tag_key = str(tag).strip().lower().replace(" ", "_")
            mapping = NEGATIVE_TAG_DIMENSION.get(tag_key)
            if mapping:
                dim, v = mapping
                scores.setdefault(dim, {})
                scores[dim][v] = scores[dim].get(v, 0.0) - 1.0
    return scores


def confidence_score(ranked_count: int, recommended_count: int) -> float:
    if recommended_count <= 0:
        return 0.0
    return round(min(1.0, ranked_count / recommended_count), 3)


def detect_conflicts(rankings: list[dict], attributes: list[dict]) -> list[dict]:
    """Per (dimension, value): if one contributor's summed weight >= +threshold and
    another's <= -threshold, emit a conflict pair."""
    attrs_by_ref = {a["reference_id"]: a["attributes"] for a in attributes}
    per: dict[tuple, dict[str, float]] = {}
    for r in rankings:
        ref_attrs = attrs_by_ref.get(r["reference_id"])
        if not ref_attrs:
            continue
        w = star_weight(r["stars"])
        c = r["contributor_id"]
        for dim in DIMENSIONS:
            for v in _values(ref_attrs.get(dim)):
                per.setdefault((dim, v), {})
                per[(dim, v)][c] = per[(dim, v)].get(c, 0.0) + w
    conflicts: list[dict] = []
    for (dim, v), bycontrib in per.items():
        likers = sorted(c for c, s in bycontrib.items() if s >= CONFLICT_THRESHOLD)
        dislikers = sorted(c for c, s in bycontrib.items() if s <= -CONFLICT_THRESHOLD)
        for a in likers:
            for b in dislikers:
                conflicts.append(
                    {"dimension": dim, "value": v, "contributor_a": a, "contributor_b": b}
                )
    return conflicts


def check_consistency(reference_attributes: dict, dimension_scores: dict) -> dict:
    """Compare one reference's attributes to the aggregate taste. Advisory, never blocks."""
    worst = 1.0
    for dim in DIMENSIONS:
        for v in _values(reference_attributes.get(dim)):
            worst = min(worst, dimension_scores.get(dim, {}).get(v, 0.0))
    if worst <= -CONFLICT_THRESHOLD:
        return {"status": "conflict", "reason": "Goes against your stronger preferences"}
    if worst < 0:
        return {"status": "tension", "reason": "A slight departure from your direction"}
    return {"status": "consistent", "reason": "Fits your style"}


def build_taste_model(rankings: list[dict], attributes: list[dict], recommended_count: int) -> dict:
    ranked_count = len({r["reference_id"] for r in rankings})
    conflicts = detect_conflicts(rankings, attributes)
    return {
        "dimensions": aggregate_dimension_scores(rankings, attributes),
        "ranked_count": ranked_count,
        "recommended_count": recommended_count,
        "confidence": confidence_score(ranked_count, recommended_count),
        "conflicts": conflicts,
        "has_conflict": len(conflicts) > 0,
    }
