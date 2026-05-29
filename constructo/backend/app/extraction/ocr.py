"""OCR for document/photo attachments (challans, invoices, delivery notes).

Provider-abstracted behind :class:`OCRClient`. :func:`ocr` is the public entry
point. A :class:`FakeOCR` returns canned text for tests (no network).
"""
from __future__ import annotations

import os
from typing import Protocol, runtime_checkable


@runtime_checkable
class OCRClient(Protocol):
    async def ocr(self, image_url: str) -> str: ...


class FakeOCR:
    """Network-free OCR stand-in.

    Returns ``default`` for any URL, or a per-URL canned string from
    ``responses``.
    """

    def __init__(self, default: str = "", responses: dict[str, str] | None = None) -> None:
        self.default = default
        self.responses = responses or {}
        self.calls: list[str] = []

    async def ocr(self, image_url: str) -> str:
        self.calls.append(image_url)
        return self.responses.get(image_url, self.default)


class OpenAIVisionOCR:
    """Vision-model OCR via the OpenAI SDK (network at call time)."""

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self.api_key = api_key
        self.model = model

    async def ocr(self, image_url: str) -> str:  # pragma: no cover - needs network/key
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise RuntimeError("openai not installed; use FakeOCR in tests") from exc

        client = AsyncOpenAI(api_key=self.api_key)
        resp = await client.chat.completions.create(
            model=self.model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Transcribe all text in this document verbatim."},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
        )
        return resp.choices[0].message.content or ""


def get_ocr_client() -> OCRClient:
    """Return an env-selected OCR client, falling back to :class:`FakeOCR`."""
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return OpenAIVisionOCR(api_key=key, model=os.environ.get("OCR_MODEL", "gpt-4o-mini"))
    return FakeOCR()


async def ocr(image_url: str, *, client: OCRClient | None = None) -> str:
    """Extract text from a document/photo URL.

    ``client`` may be injected (e.g. a :class:`FakeOCR` in tests); otherwise the
    env-selected client is used.
    """
    client = client or get_ocr_client()
    return await client.ocr(image_url)
