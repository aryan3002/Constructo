"""photo_vs_theme: an installed photo whose look conflicts with the homeowner's
approved taste. Vision via the profiler extractor (injected FakeLLM — no network)."""
from app.extraction.llm import FakeLLMClient
from app.intelligence.detectors.design import AreaTaste, PhotoRow, photo_vs_theme


def _bathroom_taste():
    # homeowner likes light, dislikes dark
    return AreaTaste(area_key="bathroom", dimensions={"colors": {"light": 1.0, "dark": -1.0}})


async def test_photo_clashing_with_taste_flags_high():
    photos = [PhotoRow(id="p1", image_url="https://x/tile.jpg", area_key="bathroom")]
    llm = FakeLLMClient(canned={"colors": ["dark"], "materials": [], "style": None})
    out = await photo_vs_theme(photos, [_bathroom_taste()], llm=llm)
    assert len(out) == 1
    assert out[0].finding_type == "photo_vs_theme"
    assert out[0].severity == "high"
    assert out[0].evidence_event_ids == ["p1"]


async def test_photo_matching_taste_is_quiet():
    photos = [PhotoRow(id="p1", image_url="https://x/tile.jpg", area_key="bathroom")]
    llm = FakeLLMClient(canned={"colors": ["light"], "materials": [], "style": None})
    assert await photo_vs_theme(photos, [_bathroom_taste()], llm=llm) == []


async def test_photo_abstains_without_area_taste():
    photos = [PhotoRow(id="p1", image_url="https://x/tile.jpg", area_key="kitchen")]
    llm = FakeLLMClient(canned={"colors": ["dark"]})
    # no kitchen taste -> no vision call, no finding
    assert await photo_vs_theme(photos, [_bathroom_taste()], llm=llm) == []
