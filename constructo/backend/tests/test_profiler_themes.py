"""Theme narration: pure evidence selection + LLM proposes (FakeLLM, no spend)."""
from app.extraction.llm import FakeLLMClient
from app.profiler.themes import narrate_themes, top_reference_ids


def test_top_reference_ids_picks_highest_starred_deterministically():
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},
        {"reference_id": "r2", "contributor_id": "A", "stars": 2, "tags": {}},
        {"reference_id": "r3", "contributor_id": "B", "stars": 4, "tags": {}},
        {"reference_id": "r1", "contributor_id": "B", "stars": 3, "tags": {}},  # r1 max stays 5
    ]
    assert top_reference_ids(rankings, limit=2) == ["r1", "r3"]  # 5, then 4
    assert top_reference_ids([], limit=3) == []


async def test_narrate_themes_calls_complete_and_returns_list():
    canned = {"themes": [{"name": "Warm Contemporary", "palette": ["oak", "beige"],
                          "materials": ["light oak"], "rationale": "You liked warm minimal."}]}
    llm = FakeLLMClient(canned=canned)
    taste = {"dimensions": {"style": {"minimal": 2.0, "ornate": -1.0}, "colors": {"light": 1.5}}}
    out = await narrate_themes(llm, "kitchen", taste)
    assert out[0]["name"] == "Warm Contemporary"
    # it used complete() (not vision) and the prompt mentions the liked/disliked signals
    assert "minimal" in llm.calls[-1]["user"]
    assert "ornate" in llm.calls[-1]["user"]
    assert "image_url" not in llm.calls[-1]  # complete(), not complete_vision()
