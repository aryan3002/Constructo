"""Vision helpers: caption + classify a photo with the vision-tier LLM.

Network-free in tests (inject a FakeLLMClient). Uses complete_vision so the
model actually reads the image at the given (presigned) URL.
"""
from __future__ import annotations

from app.extraction.llm import LLMClient, get_llm_client

_CATEGORIES = {"progress", "design_option", "drawing", "document", "other"}

_CAPTION_SYSTEM = (
    "You are reading a photo from an Indian home-construction WhatsApp group. "
    "Caption what is physically shown in one factual sentence (no opinions), "
    "classify it, and name the room/area if identifiable. Return strict JSON."
)
_CAPTION_SCHEMA = {
    "type": "object",
    "properties": {
        "caption": {"type": "string"},
        "category": {"type": "string", "enum": sorted(_CATEGORIES)},
        "room_hint": {"type": ["string", "null"]},
    },
    "required": ["caption", "category"],
}


async def caption_photo(
    image_url: str, *, llm: LLMClient | None = None, user_hint: str = ""
) -> dict:
    """Return {"caption", "category", "room_hint"} for a photo."""
    llm = llm or get_llm_client("vision")
    out = await llm.complete_vision(
        system=_CAPTION_SYSTEM,
        user=user_hint or "Describe and classify this construction photo.",
        image_url=image_url,
        json_schema=_CAPTION_SCHEMA,
    )
    cat = out.get("category")
    return {
        "caption": (out.get("caption") or "").strip(),
        "category": cat if cat in _CATEGORIES else "other",
        "room_hint": out.get("room_hint"),
    }


async def classify_image(image_url: str, *, llm: LLMClient | None = None) -> str:
    """Just the category (cheap caller convenience)."""
    return (await caption_photo(image_url, llm=llm))["category"]
