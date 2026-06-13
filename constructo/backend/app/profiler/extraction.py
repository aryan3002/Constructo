"""Vision extraction for the Design Profiler: an inspiration image -> proposed design
attributes. The LLM PROPOSES; the deterministic reducer (taste.py) decides. Leaves
fields null rather than guessing."""
from app.extraction.llm import LLMClient, get_llm_client

PROFILER_VISION_SYSTEM = (
    "You read a single interior or architecture inspiration image for a homeowner's design "
    "profile. Extract only the design attributes that are clearly visible. Never guess; use null "
    "or an empty list when something is not clearly visible. 'style' is the overall look "
    "(e.g. contemporary minimal, warm traditional); 'materials' and 'colors' are short lists; "
    "'lighting' is the light mood; 'decorative_density' is plain|moderate|busy."
)

PROFILER_VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "style": {"type": ["string", "null"]},
        "materials": {"type": "array", "items": {"type": "string"}},
        "colors": {"type": "array", "items": {"type": "string"}},
        "lighting": {"type": ["string", "null"]},
        "decorative_density": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
    },
}


def get_llm() -> LLMClient:
    """Injectable LLM client (overridden in tests with a FakeLLMClient)."""
    return get_llm_client()


async def extract_reference_attributes(llm: LLMClient, image_url: str) -> dict:
    return await llm.complete_vision(
        PROFILER_VISION_SYSTEM,
        "Extract the design attributes from this inspiration image.",
        image_url,
        PROFILER_VISION_SCHEMA,
    )
