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


# Prompt asking the vision model for a faithful, verbatim transcription. The
# downstream LLM extractor turns this raw text into structured fields, so OCR
# only needs to surface the text it sees — no interpretation or summarisation.
_OCR_PROMPT = (
    "Transcribe all text visible in this document (a delivery challan, invoice, "
    "or delivery note) verbatim. Preserve line breaks, numbers, and labels as "
    "written. Do not summarise, translate, or add commentary — return only the "
    "raw text. If the image contains no legible text, return an empty string."
)


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
                        {"type": "text", "text": _OCR_PROMPT},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
        )
        return resp.choices[0].message.content or ""


class AzureVisionOCR:
    """Vision-model OCR via Azure OpenAI (network at call time).

    Azure differs from plain OpenAI: you call a *deployment name* (chosen when
    you deploy a model in the Azure portal) against a resource endpoint, with an
    explicit api_version. ``gpt-4o-mini`` is multimodal, so the same chat
    deployment used for the LLM extractor can also read images here.

    Network calls only happen when :meth:`ocr` is awaited, so importing this
    module is always safe (no credentials or network at import time).
    """

    def __init__(
        self, *, api_key: str, endpoint: str, deployment: str, api_version: str
    ) -> None:
        self.api_key = api_key
        self.endpoint = endpoint
        self.deployment = deployment  # used as the `model` arg on Azure
        self.api_version = api_version

    async def ocr(self, image_url: str) -> str:  # pragma: no cover - needs network/key
        try:
            from openai import AsyncAzureOpenAI
        except ImportError as exc:
            raise RuntimeError("openai not installed; use FakeOCR in tests") from exc

        client = AsyncAzureOpenAI(
            api_key=self.api_key,
            azure_endpoint=self.endpoint,
            api_version=self.api_version,
        )
        resp = await client.chat.completions.create(
            model=self.deployment,  # Azure: this is the deployment name
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": _OCR_PROMPT},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
        )
        return resp.choices[0].message.content or ""


def get_ocr_client() -> OCRClient:
    """Return an env-selected OCR client, falling back to :class:`FakeOCR`.

    Reads ``OCR_PROVIDER`` (default ``"openai"``):
      - ``openai``: needs ``OPENAI_API_KEY`` (+ optional ``OCR_MODEL``).
      - ``azure``: needs ``AZURE_OPENAI_API_KEY``, ``AZURE_OPENAI_ENDPOINT``,
        ``AZURE_OPENAI_DEPLOYMENT`` (a multimodal chat deployment such as
        gpt-4o-mini), and ``AZURE_OPENAI_API_VERSION``.

    If the required credentials are missing, returns a :class:`FakeOCR` so the
    pipeline degrades gracefully in dev/test without credentials (tests never
    hit the network).
    """
    provider = os.environ.get("OCR_PROVIDER", "openai").lower()
    if provider == "azure":
        key = os.environ.get("AZURE_OPENAI_API_KEY")
        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT")
        api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")
        if key and endpoint and deployment:
            return AzureVisionOCR(
                api_key=key,
                endpoint=endpoint,
                deployment=deployment,
                api_version=api_version,
            )
    elif provider == "openai":
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
