"""Speech-to-text for WhatsApp voice notes (Hindi / Hinglish / English).

Provider-abstracted behind :class:`STTClient`. :func:`transcribe` is the public
entry point; it uses an injected client or an env-selected one. A
:class:`FakeSTT` returns canned transcripts for tests (no network).
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


def get_stt_client() -> STTClient:
    """Return an env-selected STT client, falling back to :class:`FakeSTT`."""
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
