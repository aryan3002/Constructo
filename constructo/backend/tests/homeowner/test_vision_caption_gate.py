"""Slice V (real-photo vision captions) + the red-team publish/review gate.

Two honest-AI invariants:

* **Slice V** — when a photo is published, ``draft_caption`` reads the REAL image
  via ``complete_vision`` (FakeLLMClient records the image_url, network-free). The
  caption is a DRAFT (returned in ``draft_caption``) and is never auto-written to
  the homeowner-visible ``caption`` field.
* **Red-team (hard gate)** — a hallucinating FakeLLMClient that emits an
  ungrounded "your slab was poured today" caption must be BLOCKED from the
  homeowner read result. The publish/review gate keeps it out of ``caption``, so
  the homeowner feed never serves it.
"""
from app.extraction.llm import FakeLLMClient
from app.homeowner.ai import draft_caption, get_llm
from app.main import app

from .conftest import auth


async def test_draft_caption_uses_real_image_via_complete_vision():
    """When an image_url is present, the draft is grounded on the real photo."""
    fake = FakeLLMClient()
    out = await draft_caption(
        fake,
        summary="slab poured",
        image_url="http://cdn/slab.jpg",
        room_tag="kitchen",
    )
    assert isinstance(out, str) and out.strip()
    # complete_vision was used (it records image_url); the plain path would not.
    assert any(call.get("image_url") == "http://cdn/slab.jpg" for call in fake.calls)


async def test_no_image_uses_plain_complete():
    """Without an image, draft_caption stays on the text-only path (no image_url)."""
    fake = FakeLLMClient()
    await draft_caption(fake, summary="plastering done", room_tag="hall")
    assert all(call.get("image_url") is None for call in fake.calls)


async def test_image_caption_is_draft_not_auto_published(client, ctx, fake_llm):
    """A caption drafted from an image stays a DRAFT until reviewed/published."""
    pub = await client.post(
        "/api/v1/publish/photo",
        json={
            "site_id": str(ctx.site.id),
            "image_url": "http://cdn/from_image.jpg",
            "room_tag": "bedroom",
            "event_summary": "tiling in progress",
        },
        headers=auth(ctx.owner),
    )
    assert pub.status_code == 201, pub.text
    body = pub.json()
    assert body["draft_caption"]  # AI drafted from the image
    assert body["caption"] is None  # but NOT auto-published

    # Homeowner feed: photo visible, caption still null (the draft never crossed).
    feed = await client.get("/api/v1/homeowner/photos", headers=auth(ctx.homeowner))
    items = feed.json()["items"]
    assert len(items) == 1
    assert items[0]["caption"] is None


async def test_redteam_hallucinated_caption_is_blocked_from_homeowner(client, ctx):
    """Hard gate: a hallucinating LLM emits an ungrounded caption — it must NOT
    reach the homeowner read result."""
    HALLUCINATION = "Your slab was poured today!"
    # Seed a FakeLLM whose every completion returns the ungrounded caption.
    poisoned = FakeLLMClient(canned={"caption": HALLUCINATION})
    app.dependency_overrides[get_llm] = lambda: poisoned
    try:
        pub = await client.post(
            "/api/v1/publish/photo",
            json={
                "site_id": str(ctx.site.id),
                "image_url": "http://cdn/x.jpg",
                "event_summary": "site was quiet today",
            },
            headers=auth(ctx.owner),
        )
        assert pub.status_code == 201, pub.text
        body = pub.json()
        # The hallucination is exposed to the CONTRACTOR for review only.
        assert body["draft_caption"] == HALLUCINATION
        # ...and is BLOCKED from the homeowner-visible field.
        assert body["caption"] is None

        # The homeowner read result never contains the ungrounded caption.
        feed = await client.get("/api/v1/homeowner/photos", headers=auth(ctx.homeowner))
        captions = [it["caption"] for it in feed.json()["items"]]
        assert HALLUCINATION not in captions
        assert captions == [None]
        # The homeowner feed never carries a drafted (unreviewed) caption value.
        assert all(it.get("draft_caption") is None for it in feed.json()["items"])
    finally:
        app.dependency_overrides.pop(get_llm, None)
