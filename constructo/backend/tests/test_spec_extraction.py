"""Spec vision extraction — gpt-4o proposes material fields from a photo."""
from app.extraction.llm import FakeLLMClient
from app.specs.extraction import extract_material_from_image


async def test_extract_returns_fields_and_passes_image():
    canned = {
        "brand": "WELMICA", "product_code": "EB-MR-856", "name": "Radiant Charm",
        "colour": "Mirror Gloss", "finish": "Gloss", "category": "Laminate",
        "size": "1220x2440", "thickness": "1.0", "confidence": 0.9,
    }
    llm = FakeLLMClient(canned=canned)
    out = await extract_material_from_image(llm, "data:image/jpeg;base64,AAAA")

    assert out["brand"] == "WELMICA"
    assert out["product_code"] == "EB-MR-856"
    # the image URL was actually passed to the vision call
    assert llm.calls[-1]["image_url"] == "data:image/jpeg;base64,AAAA"
