"""Translation provider seam (H6.1 contracts-freeze).

A :class:`TranslationClient` Protocol sibling to
:class:`~app.extraction.llm.LLMClient`, a deterministic network-free
:class:`FakeTranslationClient`, and an env-selected :func:`get_translation_client`
factory that returns the Fake when no creds are present.

The fake echoes the source prefixed with the target tag (``[hi] …``). This is
deliberate: it preserves every numeral / ₹ / date verbatim, so the H6.4 numeric
guard is green-by-construction on the fake, and a *separate* test can feed a
hand-built tampered string to prove the guard *blocks*. Importing this module
never requires network access.
"""
from __future__ import annotations

import os
from typing import Protocol, runtime_checkable


@runtime_checkable
class TranslationClient(Protocol):
    """Translate a string into a target language with a house style."""

    async def translate(
        self, text: str, *, target_lang: str, style: str = "hinglish_warm"
    ) -> str: ...


class FakeTranslationClient:
    """Deterministic, network-free. Echoes the source prefixed with the target
    tag so the numeric guard still sees every digit/₹/date unchanged (the §5
    guard passes on the fake by construction)."""

    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def translate(
        self, text: str, *, target_lang: str, style: str = "hinglish_warm"
    ) -> str:
        self.calls.append({"text": text, "target_lang": target_lang, "style": style})
        # Numbers/dates preserved verbatim => numeric guard passes.
        return f"[{target_lang}] {text}"


def _bcp47(lang: str) -> str:
    """Map a bare language code to Sarvam's BCP-47 form ('hi' -> 'hi-IN')."""
    return lang if "-" in lang else f"{lang}-IN"


class SarvamTranslationClient:
    """Real translation via Sarvam AI (Mayura) — India-tuned EN<->Indic.

    Canonical published text is English, so we translate en-IN -> the reader's
    language. The numeric guard in :mod:`app.homeowner.render` still validates
    every digit/₹/date afterwards, so a bad translation can never reach the
    homeowner. Network errors raise; ``render_text`` falls back to canonical.
    """

    URL = "https://api.sarvam.ai/translate"

    def __init__(self, api_key: str, model: str = "mayura:v1") -> None:
        self._key = api_key
        self._model = model

    async def translate(
        self, text: str, *, target_lang: str, style: str = "hinglish_warm"
    ) -> str:  # pragma: no cover - network call, exercised via live smoke
        import httpx

        async with httpx.AsyncClient(timeout=20) as http:
            resp = await http.post(
                self.URL,
                headers={"api-subscription-key": self._key},
                json={
                    "input": text,
                    "source_language_code": "en-IN",
                    "target_language_code": _bcp47(target_lang),
                    "model": self._model,
                },
            )
            resp.raise_for_status()
            return resp.json()["translated_text"]


def get_translation_client() -> TranslationClient:
    """Return a :class:`TranslationClient` selected by environment.

    ``TRANSLATION_PROVIDER=sarvam`` (+ ``SARVAM_API_KEY``) uses Sarvam (Mayura);
    anything else — or missing creds — degrades to the network-free Fake, so dev
    and tests never hit the network.
    """
    provider = os.environ.get("TRANSLATION_PROVIDER", "fake").lower()
    if provider == "sarvam":
        key = os.environ.get("SARVAM_API_KEY")
        if key:
            return SarvamTranslationClient(api_key=key)
    return FakeTranslationClient()
