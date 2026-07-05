"""Homeowner AI drafting helpers (honest-AI: draft, never decide).

Every function here produces a *draft* the contractor (or homeowner) reviews and
edits before it is published or accepted — captions, the weekly summary, the
design profile, and the design consistency check. They reuse the project's
provider-agnostic :class:`LLMClient` (the same abstraction as extraction), so
the real Azure/OpenAI client is used in prod and :class:`FakeLLMClient` in tests
(no network).

The helpers are deliberately tolerant of the fake's default shape: the fake
echoes the prompt back under ``summary``, so when a provider omits the expected
key we fall back to that rather than crashing. Nothing here invents facts — the
prompts only rephrase the operational text they are given.

``get_llm`` is a FastAPI dependency so tests can override it with a seeded fake
via ``app.dependency_overrides``.
"""
from __future__ import annotations

from datetime import date

from app.extraction.llm import LLMClient, get_llm_client

# Module-level default language. The real per-call value is threaded from
# ``users.language`` at the call sites; ``en`` keeps the prompt unchanged.
DEFAULT_LANGUAGE = "en"

# Human-readable names for the languages we author drafts in. Used to weave the
# target language into the system prompt so the model drafts directly in the
# reader's language (Slice T). Unknown codes fall back to English (no-op).
_LANGUAGE_NAMES = {"en": "English", "hi": "Hindi"}


def get_llm() -> LLMClient:
    """FastAPI dependency: the env-selected LLM client (fake without creds)."""
    return get_llm_client()


def _language_directive(language: str) -> str:
    """A system-prompt clause asking the model to write in ``language``.

    Empty for the source language (``en``) so English prompts are unchanged. The
    numbers/dates/rupees rule is restated here because drafting directly in the
    reader's language must still preserve every numeral byte-for-byte.
    """
    if not language or language == DEFAULT_LANGUAGE:
        return ""
    name = _LANGUAGE_NAMES.get(language, language)
    return (
        f" Write in {name}. Keep every number, date, and rupee amount exactly as "
        "given — do not change, round, or localise any digit."
    )


def _first_str(result: dict, *keys: str) -> str | None:
    for key in keys:
        val = result.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _ranked_taste_block(ranked_taste: object) -> str:
    """Render the profiler's per-area top-3 ranked taste into plain fingerprint
    lines (D-5.5), or "" when there is none (legacy path stays byte-identical).

    ``ranked_taste`` is ``{area_key: [[dimension, value], ...]}`` — already
    reduced to the top-3 (dimension, value) pairs by the caller
    (:func:`app.homeowner.router._site_ranked_taste`), deterministically
    ordered (weight desc, then alpha on value). This function only formats;
    it invents nothing and never re-ranks.
    """
    if not isinstance(ranked_taste, dict) or not ranked_taste:
        return ""
    lines = []
    for area_key in sorted(ranked_taste):
        pairs = ranked_taste[area_key]
        if not isinstance(pairs, list) or not pairs:
            continue
        parts = []
        for pair in pairs:
            if not isinstance(pair, (list, tuple)) or len(pair) != 2:
                continue
            dim, value = pair
            parts.append(f"{dim} {value}")
        if parts:
            lines.append(f"ranked taste — {area_key}: {', '.join(parts)}")
    if not lines:
        return ""
    return "\n" + "\n".join(lines)


async def draft_caption(
    llm: LLMClient,
    *,
    summary: str,
    image_url: str | None = None,
    room_tag: str | None = None,
    language: str = DEFAULT_LANGUAGE,
) -> str:
    """Draft a warm, plain-language photo caption from an ops summary.

    The contractor edits this before publishing — the caption is ALWAYS a draft,
    never auto-published to the homeowner. Never adds facts beyond
    ``summary``/``room_tag`` (or what the image grounds).

    When ``image_url`` is set the caption is drafted from the REAL photo via
    :meth:`LLMClient.complete_vision` (Slice V); otherwise from the text note
    alone. ``language`` (Slice T) is woven into the prompt so a non-English reader
    gets a draft in her language, with numbers/dates/rupees preserved verbatim.
    """
    where = f" (room: {room_tag})" if room_tag else ""
    system = (
        "You write short, warm, jargon-free photo captions for a homeowner "
        "watching their house being built. One sentence. No site jargon, no "
        "headcounts, no vendor names. Only describe what the provided note says."
        + _language_directive(language)
    )
    if image_url:
        result = await llm.complete_vision(
            system,
            f"Site note{where}: {summary}",
            image_url,
            {"type": "object", "properties": {"caption": {"type": "string"}}},
        )
    else:
        result = await llm.complete(
            system,
            f"Site note{where}: {summary}",
            {"type": "object", "properties": {"caption": {"type": "string"}}},
        )
    return _first_str(result, "caption", "summary") or summary.strip()


async def draft_weekly_summary(
    llm: LLMClient,
    *,
    week_start: date,
    update_titles: list[str],
    language: str = DEFAULT_LANGUAGE,
) -> str:
    """Draft the flagship weekly digest from this week's published update titles.

    ``language`` is frozen in H6.1 (accepted and ignored); H6·5 threads it into
    the prompt.
    """
    bullets = "\n".join(f"- {t}" for t in update_titles) or "- (a quiet week)"
    system = (
        "You write a calm, reassuring weekly construction update for a homeowner. "
        "2-4 sentences, plain language, honest about slow weeks. Summarise ONLY "
        "the provided items; do not invent progress."
        + _language_directive(language)
    )
    result = await llm.complete(
        system,
        f"Week starting {week_start.isoformat()}. This week's items:\n{bullets}",
        {"type": "object", "properties": {"text": {"type": "string"}}},
    )
    return (
        _first_str(result, "text", "summary")
        or f"Week of {week_start.isoformat()}: " + "; ".join(update_titles)
    )


async def draft_quiet_reason(
    llm: LLMClient,
    *,
    phase: str | None,
    schedule: str | None = None,
    language: str = DEFAULT_LANGUAGE,
) -> str | None:
    """Draft the "nothing visible today, here's why" reason from a SOURCED phase.

    The abstain contract is the freeze's most load-bearing rule (README:65,
    risk R1): the reason is *never invented*. When ``phase`` is missing/blank the
    function ABSTAINS by returning ``None`` (no exception) — the H6·2 sweep
    branches on ``None`` to escalate to a contractor nudge rather than
    auto-publish. The LLM only *rephrases* a known ``phase``; it can never supply
    the reason itself.

    ``language`` is frozen in H6.1 (accepted; woven into the prompt in H6·5).
    """
    if not phase or not phase.strip():
        return None  # ABSTAIN — never invents a reason
    system = (
        "You write a short, calm, plain-language note for a homeowner explaining "
        "why there is nothing new to see on site today. Rephrase ONLY the given "
        "construction phase reason into one reassuring sentence. Do not invent a "
        "different reason, a date, or any progress."
        + _language_directive(language)
    )
    result = await llm.complete(
        system,
        f"Phase: {phase}\nSchedule: {schedule or ''}",
        {"type": "object", "properties": {"text": {"type": "string"}}},
    )
    return _first_str(result, "text", "summary") or phase.strip()


async def generate_design_profile_v2(
    llm: LLMClient,
    *,
    fingerprint: dict,
    language: str = DEFAULT_LANGUAGE,
) -> dict:
    """Draft the household's design profile from a deterministic fingerprint.

    The fingerprint (from :mod:`app.homeowner.design_fingerprint`) is the trust
    firewall: the LLM only *rephrases* the authoritative facts it carries — it can
    never exceed them, and it NEVER resolves a conflict ([[05]] §5.5-5.6, Hard
    Rule 5). Returns a jsonb-ready DRAFT the primary/owner confirms:
    ``{profile, tone, per_room, contributors, conflicts, source}``.

    ``selection_pairs`` are the BLENDED, non-conflicted authoritative choices;
    conflicted ``(item, room)`` pairs are deliberately excluded (they live in
    ``conflicts`` until a human picks one), so the prose never asserts a choice
    the household has not actually agreed on.
    """
    selection_pairs = [
        (str(p[0]), str(p[1]))
        for p in fingerprint.get("selection_pairs", [])
        if isinstance(p, (list, tuple)) and len(p) == 2
    ]
    reference_tags = [t for t in fingerprint.get("reference_tags", []) if isinstance(t, str)]
    conflicts = fingerprint.get("conflicts", []) or []

    picks = "; ".join(f"{item}={choice}" for item, choice in selection_pairs) or "(none yet)"
    refs = ", ".join(t for t in reference_tags if t) or "(no references)"
    # Name open questions neutrally; the model must NOT pick a side.
    open_qs = (
        "; ".join(
            f"{c.get('item', 'a choice')} in {c.get('room') or 'the home'}"
            for c in conflicts
        )
        or "(none)"
    )
    ranked_taste_block = _ranked_taste_block(fingerprint.get("ranked_taste"))

    conflict_rule = (
        " When 'Open questions' lists an item the household has not agreed on, "
        "state it in ONE warm sentence as a shared decision still to make and do "
        "NOT pick a side."
        if conflicts
        else ""
    )
    system = (
        "You are an interior design assistant for a household. From the agreed "
        "selections and reference tags ONLY, write a short design profile: a "
        "one-paragraph 'profile' describing their shared taste, and a 'tone' of "
        "3-5 keywords. Do not invent specific products they did not choose."
        + conflict_rule
        + _language_directive(language)
    )
    result = await llm.complete(
        system,
        (
            f"Agreed selections: {picks}\nReference tags: {refs}\n"
            f"Open questions: {open_qs}{ranked_taste_block}"
        ),
        {
            "type": "object",
            "properties": {
                "profile": {"type": "string"},
                "tone": {"type": "array", "items": {"type": "string"}},
            },
        },
    )
    text = _first_str(result, "profile", "summary") or (
        f"A design leaning towards {refs}, based on {picks}."
    )
    tone = result.get("tone")
    if not isinstance(tone, list):
        tone = reference_tags[:5]
    return {
        "profile": text,
        "tone": tone,
        "per_room": fingerprint.get("per_room", {}),
        "contributors": fingerprint.get("contributors", []),
        "conflicts": conflicts,
        "source": {"selections": picks, "references": refs},
    }


async def generate_design_profile(
    llm: LLMClient,
    *,
    selection_pairs: list[tuple[str, str]],
    reference_tags: list[str],
    language: str = DEFAULT_LANGUAGE,
) -> dict:
    """Backward-compatible wrapper around :func:`generate_design_profile_v2`.

    Builds a minimal single-member fingerprint (no attribution, no conflicts) from
    the raw pairs/tags so existing callers keep compiling. New multi-member
    callers should build a real fingerprint via
    :mod:`app.homeowner.design_fingerprint` and call ``generate_design_profile_v2``.
    """
    fingerprint = {
        "selection_pairs": [list(p) for p in selection_pairs],
        "reference_tags": list(reference_tags),
        "per_room": {},
        "contributors": [],
        "conflicts": [],
    }
    return await generate_design_profile_v2(llm, fingerprint=fingerprint, language=language)


async def consistency_check(
    llm: LLMClient, *, profile_text: str, item: str, choice: str
) -> dict:
    """Advisory (NOT gatekeeping) feedback on whether a choice fits the profile.

    Returns ``{"fits": bool, "feedback": str}``. Defaults to fits=True so the
    homeowner is never blocked — this seeks feedback, it does not approve.
    """
    system = (
        "You are a friendly design advisor. Given a homeowner's design profile and "
        "a new selection, give brief, encouraging feedback on whether it fits their "
        "taste. You NEVER block a choice — you only offer a perspective. Reply with "
        "'fits' (boolean, lean true) and one-sentence 'feedback'."
    )
    result = await llm.complete(
        system,
        f"Profile: {profile_text}\nNew selection: {item} = {choice}",
        {
            "type": "object",
            "properties": {
                "fits": {"type": "boolean"},
                "feedback": {"type": "string"},
            },
        },
    )
    fits = result.get("fits")
    feedback = _first_str(result, "feedback", "summary") or (
        f"{choice} for {item} looks like a reasonable fit — worth a look in your space."
    )
    return {"fits": True if not isinstance(fits, bool) else fits, "feedback": feedback}
