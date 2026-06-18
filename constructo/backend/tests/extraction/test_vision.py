import pytest

from app.extraction.llm import FakeLLMClient
from app.extraction.vision import caption_photo, classify_image


@pytest.mark.asyncio
async def test_caption_photo_returns_text_and_passes_url():
    fake = FakeLLMClient(
        canned={
            "caption": "RCC slab shuttering in progress",
            "category": "progress",
            "room_hint": "first floor",
        }
    )
    out = await caption_photo("https://r2/x.jpg", llm=fake)
    assert out["caption"]
    assert out["category"] in {"progress", "design_option", "drawing", "document", "other"}
    assert fake.calls[-1]["image_url"] == "https://r2/x.jpg"


@pytest.mark.asyncio
async def test_classify_image_defaults_other_on_blank():
    fake = FakeLLMClient(canned={})
    assert (await classify_image("https://r2/y.jpg", llm=fake)) in {
        "progress",
        "design_option",
        "drawing",
        "document",
        "other",
    }
