"""Brief narration + clarifications: deterministic payload shaping + LLM proposes
(FakeLLM, no spend). The LLM phrases prose only; every number/material comes from
the deterministic payload."""
from app.extraction.llm import FakeLLMClient
from app.profiler.brief import (
    PROFILER_BRIEF_SYSTEM,
    build_area_brief_payload,
    generate_clarifications,
    narrate_brief,
)


def test_build_area_brief_payload_keeps_reducer_numbers_and_approved_only():
    taste = {"dimensions": {"style": {"minimal": 2.0}}, "confidence": 1.0, "has_conflict": False}
    themes = [
        {"name": "Soft Minimal", "palette": ["oak"], "materials": ["light oak"], "status": "approved"},
        {"name": "Rejected One", "palette": [], "materials": ["chrome"], "status": "rejected"},
    ]
    conflicts = [
        {"dimension": "colors", "value": "dark", "decision_note": "go light", "resolution_status": "resolved"},
        {"dimension": "style", "value": "ornate", "decision_note": None, "resolution_status": "open"},
    ]
    payload = build_area_brief_payload("kitchen", taste, themes, conflicts)
    assert payload["area_key"] == "kitchen"
    assert payload["confidence"] == 1.0  # straight from the reducer
    # only APPROVED/adjusted themes flow into the brief; rejected dropped:
    assert [t["name"] for t in payload["themes"]] == ["Soft Minimal"]
    assert "light oak" in payload["material_families"]
    # only RESOLVED/deferred conflicts surface; open ones excluded:
    assert [c["value"] for c in payload["resolved_conflicts"]] == ["dark"]


async def test_narrate_brief_calls_complete_per_audience_and_returns_prose():
    canned = {"headline": "A calm, warm kitchen", "summary": "Light woods and soft tones.",
              "sections": [{"title": "Materials", "body": "Light oak throughout."}]}
    llm = FakeLLMClient(canned=canned)
    payload = {"scope_type": "rooms", "areas": [{"area_key": "kitchen", "confidence": 1.0,
               "material_families": ["light oak"], "themes": [{"name": "Soft Minimal"}],
               "resolved_conflicts": []}]}
    out = await narrate_brief(llm, "contractor", payload)
    assert out["headline"] == "A calm, warm kitchen"
    # the audience is named in the prompt; it used complete() (not vision):
    assert "contractor" in llm.calls[-1]["user"].lower() or "contractor" in llm.calls[-1]["system"].lower()
    assert "image_url" not in llm.calls[-1]
    assert PROFILER_BRIEF_SYSTEM  # system prompt exists


async def test_generate_clarifications_returns_questions_from_signals():
    canned = {"questions": ["Do you prefer matte or glossy finishes?",
                            "Warmer or cooler whites for the cabinets?"]}
    llm = FakeLLMClient(canned=canned)
    taste = {"dimensions": {"style": {"minimal": 0.5, "ornate": -0.5}}, "confidence": 0.3,
             "has_conflict": True}
    qs = await generate_clarifications(llm, "kitchen", taste)
    assert len(qs) == 2
    assert qs[0].startswith("Do you prefer")
    assert "minimal" in llm.calls[-1]["user"]  # grounded in the taste signals
