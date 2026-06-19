import fitz  # PyMuPDF
import pytest

from app.extraction.llm import FakeLLMClient
from app.extraction.pdf_read import read_pdf


def _make_pdf(path: str) -> None:
    """Write a tiny one-page PDF with a real text layer."""
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "GROUND FLOOR PLAN\nMaster Bedroom\nKitchen")
    doc.save(path)
    doc.close()


@pytest.mark.asyncio
async def test_read_pdf_roundtrip_text_and_vision(tmp_path):
    pdf_path = tmp_path / "plan.pdf"
    _make_pdf(str(pdf_path))

    fake = FakeLLMClient(
        canned={
            "kind": "floor_plan",
            "rooms": ["Master Bedroom", "Kitchen"],
            "summary": "Ground floor plan",
        }
    )
    result = await read_pdf(str(pdf_path), llm=fake)

    # Text layer is read straight from the PDF.
    assert "Master Bedroom" in result["text"]
    # kind / rooms / summary come from the (faked) vision pass.
    assert result["kind"] == "floor_plan"
    assert "Kitchen" in result["rooms"]
    assert result["summary"] == "Ground floor plan"
    assert result["pages"] >= 1
    # A rendered page image (data URI) was passed to the vision model.
    assert fake.calls[-1]["image_url"].startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_read_pdf_bad_path_is_tolerant():
    # A missing file must degrade gracefully, not raise.
    result = await read_pdf("/nope/missing.pdf", llm=FakeLLMClient(canned={}))
    assert result["text"] == ""
    assert result["kind"] == "other"
    assert result["rooms"] == []
    assert result["pages"] == 0
