"""Image-description provider seam (H6.1 contracts-freeze).

A :class:`VisionClient` Protocol mirroring :class:`~app.extraction.llm.LLMClient`,
plus a deterministic network-free :class:`FakeVisionClient` and an env-selected
:func:`get_vision_client` factory that returns the Fake when no creds are
present.

This is the *describe-image* seam (palette / materials / mood), frozen for the
H9 design-fingerprinting work. The H6 *captioning* path uses
``LLMClient.complete_vision`` instead, so this Protocol stays separate and H9 can
land without touching H6. Importing this module never requires network access.
"""
from __future__ import annotations

import hashlib
from typing import Protocol, runtime_checkable


@runtime_checkable
class VisionClient(Protocol):
    """Read a photo and return a structured TEXT description (never an image)."""

    async def describe_image(self, image_url: str, json_schema: dict) -> dict: ...


class FakeVisionClient:
    """Deterministic, network-free. Ignores pixels; derives a stable fingerprint
    from a hash of ``image_url`` so the same URL always yields the same
    palette/tags."""

    def __init__(self, canned: dict | None = None) -> None:
        self.canned = canned
        self.calls: list[dict] = []

    async def describe_image(self, image_url: str, json_schema: dict) -> dict:
        self.calls.append({"image_url": image_url, "json_schema": json_schema})
        if self.canned is not None:
            return self.canned
        # Deterministic from the URL hash — no randomness, no network.
        h = hashlib.sha256((image_url or "").encode()).hexdigest()
        return {
            "usable": True,
            "palette": [{"hex": "#" + h[:6], "name": "tone"}],
            "materials": [],
            "mood": [],
            "room": None,
        }


def get_vision_client() -> VisionClient:
    """Return a :class:`VisionClient` selected by environment (``VISION_PROVIDER``).

    Falls back to :class:`FakeVisionClient` when no creds are present. The real
    provider is wired in H9.
    """
    # No real provider is wired in H6.1; always degrade to the Fake.
    return FakeVisionClient()
