"""H6.1 contracts-freeze exit bar: the frozen ai.py signatures + complete_vision.

Network-free (FakeLLMClient only). Asserts the new keyword-only params exist and
accept values, that all existing callers keep compiling (no new args), and that
``complete_vision`` records the image_url without any network.
"""
from datetime import date

from app.extraction.llm import FakeLLMClient, LLMClient
from app.homeowner.ai import (
    draft_caption,
    draft_weekly_summary,
    generate_design_profile,
)


async def test_draft_caption_accepts_image_url_and_language():
    llm = FakeLLMClient()
    out = await draft_caption(
        llm,
        summary="slab poured",
        image_url="http://x/p.jpg",
        room_tag="kitchen",
        language="hi",
    )
    assert isinstance(out, str) and out.strip()


async def test_draft_caption_back_compat_no_new_args():
    """Existing callers (no image_url/language) still work — keyword-only defaults."""
    llm = FakeLLMClient()
    out = await draft_caption(llm, summary="x", room_tag="y")
    assert isinstance(out, str)


async def test_complete_vision_delegates_and_records_image_url():
    llm = FakeLLMClient()
    schema = {"type": "object", "properties": {"caption": {"type": "string"}}}
    vision = await llm.complete_vision("sys", "slab poured", "http://x/p.jpg", schema)
    plain = await FakeLLMClient().complete("sys", "slab poured", schema)
    # Same echo dict as complete() (image ignored), no network.
    assert vision == plain
    # The image_url was passed and recorded for assertion.
    assert any(call.get("image_url") == "http://x/p.jpg" for call in llm.calls)


def test_fake_satisfies_protocol_with_new_method():
    fake = FakeLLMClient()
    assert isinstance(fake, LLMClient)
    assert hasattr(fake, "complete_vision")


async def test_weekly_and_design_accept_language():
    llm = FakeLLMClient()
    weekly = await draft_weekly_summary(
        llm, week_start=date(2026, 6, 1), update_titles=["slab poured"], language="hi"
    )
    assert isinstance(weekly, str)

    profile = await generate_design_profile(
        llm,
        selection_pairs=[("flooring", "oak")],
        reference_tags=["warm", "minimal"],
        language="hi",
    )
    assert isinstance(profile, dict)
    assert "profile" in profile and "tone" in profile
