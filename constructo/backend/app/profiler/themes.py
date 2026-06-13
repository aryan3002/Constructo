"""Theme narration for the Design Profiler.

The deterministic taste model -> AI-proposed theme directions. The LLM PROPOSES
names/palette/materials/rationale; CONFIDENCE comes from the reducer (taste.py),
never the model; EVIDENCE is the deterministically top-ranked references.
"""
from app.extraction.llm import LLMClient

PROFILER_THEME_SYSTEM = (
    "You are an interior design assistant. Given a homeowner's aggregated taste signals for one "
    "area of their home (liked and disliked style/material/color/lighting values), propose 1-3 "
    "named design theme directions. For each: a short evocative name, a palette (list of color "
    "names), a materials list, and a one-sentence rationale grounded ONLY in the given signals. "
    "Do not invent preferences not present in the signals. Do not output any confidence number."
)

PROFILER_THEME_SCHEMA = {
    "type": "object",
    "properties": {
        "themes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "palette": {"type": "array", "items": {"type": "string"}},
                    "materials": {"type": "array", "items": {"type": "string"}},
                    "rationale": {"type": "string"},
                },
            },
        }
    },
}


def top_reference_ids(rankings: list[dict], limit: int = 4) -> list[str]:
    """Deterministically pick the highest-starred reference ids as theme evidence.
    Ties break by reference_id (stable)."""
    by_ref: dict[str, int] = {}
    for r in rankings:
        rid = r["reference_id"]
        by_ref[rid] = max(by_ref.get(rid, 0), r["stars"])
    ordered = sorted(by_ref.items(), key=lambda kv: (-kv[1], kv[0]))
    return [rid for rid, _ in ordered][:limit]


def _taste_summary_text(area_key: str, taste_model: dict) -> str:
    """Deterministic, human-readable rendering of the taste model for the LLM prompt."""
    lines = [f"Area: {area_key}"]
    for dim, values in (taste_model.get("dimensions") or {}).items():
        liked = sorted([v for v, s in values.items() if s > 0], key=lambda v: -values[v])
        disliked = sorted([v for v, s in values.items() if s < 0], key=lambda v: values[v])
        if liked:
            lines.append(f"Liked {dim}: {', '.join(liked)}")
        if disliked:
            lines.append(f"Disliked {dim}: {', '.join(disliked)}")
    return "\n".join(lines)


async def narrate_themes(llm: LLMClient, area_key: str, taste_model: dict) -> list[dict]:
    """LLM proposes theme directions from the taste summary. Returns a list of
    {name, palette, materials, rationale} dicts (never confidence — that's the reducer's)."""
    user = _taste_summary_text(area_key, taste_model)
    out = await llm.complete(PROFILER_THEME_SYSTEM, user, PROFILER_THEME_SCHEMA)
    return out.get("themes", [])
