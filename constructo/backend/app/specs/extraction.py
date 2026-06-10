"""Vision extraction for the Spec engine: a photo of a material sample-book page
-> proposed material fields. gpt-4o PROPOSES; a human commits. Leaves fields null
rather than guessing."""
from app.extraction.llm import LLMClient, get_llm_client

SPEC_VISION_SYSTEM = (
    "You are a material-spec extraction engine for an interior fit-out firm. "
    "You are shown a photo of a material sample-book page or a printed material spec. "
    "Extract ONLY what is clearly legible — never guess. Leave any field null if it is "
    "not clearly visible. 'product_code' is the SKU/code printed on the sample "
    "(e.g. 'OS-9006-02', 'EB-MR-856'); 'name' is the trade/collection name; 'category' "
    "is the material kind (Laminate / Louver / Paint / Tile / Veneer / Stone / ...)."
)

SPEC_VISION_SCHEMA = {
    "type": "object",
    "properties": {
        "brand": {"type": ["string", "null"]},
        "product_code": {"type": ["string", "null"]},
        "name": {"type": ["string", "null"]},
        "colour": {"type": ["string", "null"]},
        "finish": {"type": ["string", "null"]},
        "category": {"type": ["string", "null"]},
        "size": {"type": ["string", "null"]},
        "thickness": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
    },
}


def get_llm() -> LLMClient:
    """Injectable LLM client (overridden in tests with a FakeLLMClient)."""
    return get_llm_client()


async def extract_material_from_image(llm: LLMClient, image_url: str) -> dict:
    """Ask gpt-4o to read a sample-book page and propose material fields."""
    return await llm.complete_vision(
        SPEC_VISION_SYSTEM,
        "Extract the material spec from this sample-book page.",
        image_url,
        SPEC_VISION_SCHEMA,
    )
