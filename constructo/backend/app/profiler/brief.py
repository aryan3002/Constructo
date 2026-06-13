"""Brief narration + clarifications for the Design Profiler.

Determinism Doctrine: deterministic Python gathers every number / material / count
into a structured payload; the LLM only NARRATES prose per audience. ``confidence``
always originates from the reducer (taste.py), never the model. All LLM calls are
fail-safe at the call site (router) so narration never 500s a request.
"""
from app.extraction.llm import LLMClient

PROFILER_BRIEF_SYSTEM = (
    "You are an interior design assistant writing a design brief for one specific audience. "
    "You are given a STRUCTURED payload (areas, approved themes, material families, resolved "
    "decisions, and a numeric confidence). Write clear, reassuring prose that REFLECTS the "
    "payload exactly. Never invent materials, numbers, or preferences not present in the payload. "
    "Never output a confidence number yourself. Audiences: 'homeowner' = warm and reassuring, "
    "plain language; 'architect' = design intent, room priorities, open questions, where AI "
    "confidence is low; 'contractor' = finish expectations, material families, procurement "
    "dependencies, cost-impact flags, pending approvals, room-wise execution notes."
)

PROFILER_BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "summary": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "body": {"type": "string"}},
            },
        },
    },
}

PROFILER_CLARIFY_SYSTEM = (
    "You are an interior design assistant. Given a homeowner's aggregated taste signals for one "
    "area (liked/disliked style/material/color values, a confidence score, and whether co-owners "
    "conflict), propose 1-4 short, specific clarifying questions that would raise confidence or "
    "resolve a disagreement. Ground every question in the given signals. Do not ask generic "
    "questions. Do not output anything except the questions."
)

PROFILER_CLARIFY_SCHEMA = {
    "type": "object",
    "properties": {"questions": {"type": "array", "items": {"type": "string"}}},
}

_KEEP_THEME_STATUSES = {"approved", "adjusted"}
_KEEP_CONFLICT_STATUSES = {"resolved", "deferred_to_architect"}


def build_area_brief_payload(
    area_key: str, taste_model: dict, themes: list[dict], conflicts: list[dict]
) -> dict:
    """Deterministically shape ONE area into the structured brief payload.

    Only APPROVED/adjusted themes and RESOLVED/deferred conflicts flow into the brief
    (proposals and open disagreements are not yet committed). ``confidence`` is copied
    straight from the reducer's taste model.
    """
    kept_themes = [t for t in themes if t.get("status") in _KEEP_THEME_STATUSES]
    material_families: list[str] = []
    for t in kept_themes:
        for m in t.get("materials") or []:
            if m not in material_families:
                material_families.append(m)
    resolved = [
        {"dimension": c.get("dimension"), "value": c.get("value"),
         "decision_note": c.get("decision_note")}
        for c in conflicts
        if c.get("resolution_status") in _KEEP_CONFLICT_STATUSES
    ]
    return {
        "area_key": area_key,
        "confidence": taste_model.get("confidence", 0.0),
        "has_conflict": taste_model.get("has_conflict", False),
        "dimensions": taste_model.get("dimensions", {}),
        "themes": [{"name": t.get("name"), "palette": t.get("palette") or [],
                    "materials": t.get("materials") or []} for t in kept_themes],
        "material_families": material_families,
        "resolved_conflicts": resolved,
    }


def _payload_summary_text(audience: str, payload: dict) -> str:
    """Deterministic, human-readable rendering of the payload for the LLM prompt."""
    lines = [f"Audience: {audience}", f"Scope: {payload.get('scope_type', 'whole_house')}"]
    for area in payload.get("areas", []):
        lines.append(f"\nArea: {area.get('area_key')} (confidence {area.get('confidence')})")
        if area.get("material_families"):
            lines.append(f"  Material families: {', '.join(area['material_families'])}")
        for t in area.get("themes", []):
            lines.append(f"  Theme: {t.get('name')}")
        for c in area.get("resolved_conflicts", []):
            note = c.get("decision_note")
            lines.append(f"  Resolved: {c.get('dimension')}={c.get('value')} ({note})")
    return "\n".join(lines)


async def narrate_brief(llm: LLMClient, audience: str, payload: dict) -> dict:
    """LLM narrates the audience-specific prose for a structured payload.

    Returns {headline, summary, sections}. NEVER includes numbers/materials the
    payload did not supply (the router composes the persisted content from the
    deterministic payload + this prose)."""
    user = _payload_summary_text(audience, payload)
    out = await llm.complete(PROFILER_BRIEF_SYSTEM, user, PROFILER_BRIEF_SCHEMA)
    return {
        "headline": out.get("headline", ""),
        "summary": out.get("summary", ""),
        "sections": out.get("sections", []),
    }


def _clarify_summary_text(area_key: str, taste_model: dict) -> str:
    lines = [f"Area: {area_key}", f"Confidence: {taste_model.get('confidence', 0.0)}",
             f"Has conflict: {taste_model.get('has_conflict', False)}"]
    for dim, values in (taste_model.get("dimensions") or {}).items():
        liked = sorted([v for v, s in values.items() if s > 0], key=lambda v: -values[v])
        disliked = sorted([v for v, s in values.items() if s < 0], key=lambda v: values[v])
        if liked:
            lines.append(f"Liked {dim}: {', '.join(liked)}")
        if disliked:
            lines.append(f"Disliked {dim}: {', '.join(disliked)}")
    return "\n".join(lines)


async def generate_clarifications(llm: LLMClient, area_key: str, taste_model: dict) -> list[str]:
    """LLM proposes grounded clarifying questions for a low-confidence/conflicting area."""
    user = _clarify_summary_text(area_key, taste_model)
    out = await llm.complete(PROFILER_CLARIFY_SYSTEM, user, PROFILER_CLARIFY_SCHEMA)
    return [q for q in (out.get("questions") or []) if isinstance(q, str) and q.strip()]
