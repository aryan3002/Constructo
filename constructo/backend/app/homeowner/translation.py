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


def get_translation_client() -> TranslationClient:
    """Return a :class:`TranslationClient` selected by environment
    (``TRANSLATION_PROVIDER``).

    Falls back to :class:`FakeTranslationClient` when no creds are present. The
    real ``SarvamTranslationClient`` body lands in H6.4.
    """
    # No real provider is wired in H6.1; always degrade to the Fake.
    return FakeTranslationClient()
