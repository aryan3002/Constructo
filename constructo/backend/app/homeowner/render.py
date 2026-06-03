"""Slice T — homeowner-language rendering of PUBLISHED text (H6.5).

The contractor authors the homeowner feed in ONE source language (English, as
captured). The homeowner reads it in HER language (``users.language``). This
module is the read-path seam that bridges the two: it takes a published
canonical string and returns the homeowner-language variant, going through the
content-addressed :class:`~app.models.translation_cache.TranslationCache` so a
second render of identical text is a cache HIT (no second provider call).

Three honest-AI invariants run through every render:

* **Translation is rephrasing inside the guardrail.** The source is never
  re-authored; we only restate it in the reader's language.
* **Numbers/dates/rupees are byte-identical.** Every variant is checked by
  :func:`app.homeowner.numeric_guard.numeric_guard`; a variant that altered a
  numeral is REJECTED (``numeric_guard_ok=false``) and we fall back to the
  canonical source so a 10x money error can never reach the homeowner.
* **No-op for the source language.** When the homeowner reads the source
  language (or no language is set) we return the canonical unchanged and never
  touch a provider or the cache.

The cache key is ``(source_table, source_id, source_field, lang)`` (one variant
per field); ``content_hash = sha256(canonical + lang + glossary_version + style)``
content-addresses the variant so a stale canonical (edited after caching) misses
and re-translates rather than serving the wrong text.
"""
from __future__ import annotations

import hashlib
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.homeowner.numeric_guard import numeric_guard
from app.homeowner.translation import TranslationClient, get_translation_client
from app.models import TranslationCache

# The source language the contractor authors in. Reading this language is a
# no-op (no translation, no cache row).
SOURCE_LANG = "en"
# Bump to invalidate every cached variant (e.g. a glossary/style change). Part of
# the content-address so old variants miss after a bump.
GLOSSARY_VERSION = 0
DEFAULT_STYLE = "hinglish_warm"
ENGINE = "fake"


def get_translation() -> TranslationClient:
    """FastAPI dependency: the env-selected translation client (fake w/o creds)."""
    return get_translation_client()


def _content_hash(canonical: str, lang: str, style: str) -> str:
    """sha256(canonical + lang + glossary_version + style) — the content-address."""
    payload = f"{canonical}\x00{lang}\x00{GLOSSARY_VERSION}\x00{style}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _needs_translation(canonical: str | None, lang: str | None) -> bool:
    return bool(canonical) and bool(canonical.strip()) and bool(lang) and lang != SOURCE_LANG


async def render_text(
    session: AsyncSession,
    client: TranslationClient,
    *,
    canonical: str | None,
    lang: str | None,
    source_table: str,
    source_id: UUID,
    source_field: str,
    style: str = DEFAULT_STYLE,
) -> str | None:
    """Return ``canonical`` rendered into ``lang`` (or unchanged), cache-backed.

    The flow:

    1. No-op when the reader is on the source language (or text/lang is empty).
    2. **Cache lookup** on the unique ``(table, id, field, lang)`` key. A hit
       whose ``content_hash`` still matches the current canonical is served
       straight from the cache (the second-call cache hit) — but only if its
       ``numeric_guard_ok`` is true; a guard-failed variant is never served.
    3. **Translate** via the provider, run the numeric guard. On PASS we cache and
       return the variant; on FAIL we cache the failure (``numeric_guard_ok=false``)
       and fall back to the canonical so altered numbers never reach the homeowner.

    The translation provider is called at most once per (key, content) — re-reads
    of identical published text hit the cache.
    """
    if not _needs_translation(canonical, lang):
        return canonical
    assert canonical is not None and lang is not None  # narrowed by _needs_translation

    chash = _content_hash(canonical, lang, style)

    existing = (
        await session.execute(
            select(TranslationCache).where(
                TranslationCache.source_table == source_table,
                TranslationCache.source_id == source_id,
                TranslationCache.source_field == source_field,
                TranslationCache.lang == lang,
            )
        )
    ).scalar_one_or_none()

    if existing is not None and existing.content_hash == chash:
        # Cache HIT for the current content. Serve the variant only if it passed
        # the guard; otherwise fall back to the canonical source.
        if existing.numeric_guard_ok:
            return existing.translated
        return canonical

    try:
        translated = await client.translate(canonical, target_lang=lang, style=style)
    except Exception:
        # A translation-provider hiccup (network/quota) must NEVER break the
        # homeowner read path — serve the canonical source and retry next read
        # (no cache write, so a transient failure isn't sticky).
        return canonical
    guard_ok = numeric_guard(canonical, translated)

    if existing is None:
        session.add(
            TranslationCache(
                source_table=source_table,
                source_id=source_id,
                source_field=source_field,
                lang=lang,
                content_hash=chash,
                canonical=canonical,
                translated=translated,
                engine=ENGINE,
                glossary_version=GLOSSARY_VERSION,
                style=style,
                numeric_guard_ok=guard_ok,
            )
        )
    else:
        # Canonical changed (content_hash drift): refresh the single variant row.
        existing.content_hash = chash
        existing.canonical = canonical
        existing.translated = translated
        existing.engine = ENGINE
        existing.glossary_version = GLOSSARY_VERSION
        existing.style = style
        existing.numeric_guard_ok = guard_ok
    await session.commit()

    return translated if guard_ok else canonical
