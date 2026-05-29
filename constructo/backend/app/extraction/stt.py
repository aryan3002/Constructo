"""Speech-to-text for WhatsApp voice notes (Hindi / Hinglish / English).

Provider-abstracted behind :class:`STTClient`. :func:`transcribe` is the public
entry point; it uses an injected client or an env-selected one. A
:class:`FakeSTT` returns canned transcripts for tests (no network).

Providers:
  - :class:`OpenAISTT` — Whisper via the plain OpenAI SDK.
  - :class:`AzureWhisperSTT` — Whisper via Azure OpenAI (mirrors the Azure
    pattern in :mod:`app.extraction.llm`). Selected with ``STT_PROVIDER=azure``.
  - :class:`FakeSTT` — deterministic, network-free stand-in used in tests and as
    the no-credentials fallback.

NOTE on Hindi STT: Azure Whisper requires a Whisper *deployment* in a supported
Azure region (not every region offers Whisper). If a Whisper deployment is
unavailable — or if Hindi/Hinglish accuracy is insufficient — the team may swap
to Sarvam AI (Saaras), which is purpose-built for Indian-language STT. Adding a
``SarvamSTT`` later should be trivial: implement the same :class:`STTClient`
interface (``async def transcribe(self, audio_url, lang_hint="hi") -> str``) and
wire a ``STT_PROVIDER=sarvam`` branch into :func:`get_stt_client`. The
``lang_hint="hi"`` contract is intentionally provider-neutral so callers never
change.
"""
from __future__ import annotations

import os
from typing import Protocol, runtime_checkable


@runtime_checkable
class STTClient(Protocol):
    async def transcribe(self, audio_url: str, lang_hint: str = "hi") -> str: ...


class FakeSTT:
    """Network-free STT stand-in.

    Returns ``default`` for any URL, or a per-URL canned transcript supplied via
    the ``responses`` mapping.
    """

    def __init__(self, default: str = "", responses: dict[str, str] | None = None) -> None:
        self.default = default
        self.responses = responses or {}
        self.calls: list[tuple[str, str]] = []

    async def transcribe(self, audio_url: str, lang_hint: str = "hi") -> str:
        self.calls.append((audio_url, lang_hint))
        return self.responses.get(audio_url, self.default)


class OpenAISTT:
    """Whisper-based transcription via the OpenAI SDK (network at call time)."""

    def __init__(self, api_key: str, model: str = "whisper-1") -> None:
        self.api_key = api_key
        self.model = model

    async def transcribe(self, audio_url: str, lang_hint: str = "hi") -> str:  # pragma: no cover
        try:
            import httpx
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise RuntimeError("openai/httpx not installed; use FakeSTT in tests") from exc

        async with httpx.AsyncClient() as http:
            audio = (await http.get(audio_url)).content
        client = AsyncOpenAI(api_key=self.api_key)
        resp = await client.audio.transcriptions.create(
            model=self.model,
            file=("voice.ogg", audio),
            language=lang_hint,
        )
        return resp.text


class AzureWhisperSTT:
    """Whisper transcription via Azure OpenAI (network at call time).

    Mirrors :class:`app.extraction.llm.AzureOpenAILLMClient`. Azure differs from
    plain OpenAI: you call a *deployment name* (chosen when you deploy the
    Whisper model in the Azure portal) against a resource endpoint, with an
    explicit ``api_version``. The ``openai`` and ``httpx`` SDKs are imported
    lazily so importing this module never requires the dependency or network
    access.

    ``lang_hint`` (default ``"hi"`` for Hindi) is forwarded to Whisper's
    ``language`` parameter to improve Hindi/Hinglish accuracy.
    """

    def __init__(
        self, *, api_key: str, endpoint: str, deployment: str, api_version: str
    ) -> None:
        self.api_key = api_key
        self.endpoint = endpoint
        self.deployment = deployment  # used as the `model` arg on Azure
        self.api_version = api_version

    async def transcribe(self, audio_url: str, lang_hint: str = "hi") -> str:  # pragma: no cover
        try:
            import httpx
            from openai import AsyncAzureOpenAI
        except ImportError as exc:
            raise RuntimeError("openai/httpx not installed; use FakeSTT in tests") from exc

        async with httpx.AsyncClient() as http:
            audio = (await http.get(audio_url)).content
        client = AsyncAzureOpenAI(
            api_key=self.api_key,
            azure_endpoint=self.endpoint,
            api_version=self.api_version,
        )
        resp = await client.audio.transcriptions.create(
            model=self.deployment,  # Azure: this is the Whisper deployment name
            file=("voice.ogg", audio),
            language=lang_hint,
        )
        return resp.text


def get_stt_client() -> STTClient:
    """Return an :class:`STTClient` selected by environment.

    Reads ``STT_PROVIDER`` (default ``"openai"``):
      - ``openai``: needs ``OPENAI_API_KEY`` (+ optional ``STT_MODEL``).
      - ``azure``: needs ``AZURE_OPENAI_API_KEY``, ``AZURE_OPENAI_ENDPOINT``,
        ``AZURE_WHISPER_DEPLOYMENT`` (the Whisper deployment name), and
        ``AZURE_OPENAI_API_VERSION`` (optional; sensible default).

    If the required credentials are missing, returns a :class:`FakeSTT` so the
    pipeline degrades gracefully in dev/test without credentials (tests never
    hit the network).
    """
    provider = os.environ.get("STT_PROVIDER", "openai").lower()
    if provider == "azure":
        key = os.environ.get("AZURE_OPENAI_API_KEY")
        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        deployment = os.environ.get("AZURE_WHISPER_DEPLOYMENT")
        api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")
        if key and endpoint and deployment:
            return AzureWhisperSTT(
                api_key=key,
                endpoint=endpoint,
                deployment=deployment,
                api_version=api_version,
            )
    elif provider == "openai":
        key = os.environ.get("OPENAI_API_KEY")
        if key:
            return OpenAISTT(api_key=key, model=os.environ.get("STT_MODEL", "whisper-1"))
    return FakeSTT()


async def transcribe(
    audio_url: str, lang_hint: str = "hi", *, client: STTClient | None = None
) -> str:
    """Transcribe a voice note URL to text.

    ``client`` may be injected (e.g. a :class:`FakeSTT` in tests); otherwise the
    env-selected client is used.
    """
    client = client or get_stt_client()
    return await client.transcribe(audio_url, lang_hint=lang_hint)
