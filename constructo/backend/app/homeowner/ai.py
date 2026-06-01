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
# ``users.language`` at the call sites in H6·5; until then every helper accepts
# the kwarg (keyword-only, default below) without changing behavior.
DEFAULT_LANGUAGE = "en"


def get_llm() -> LLMClient:
    """FastAPI dependency: the env-selected LLM client (fake without creds)."""
    return get_llm_client()


def _first_str(result: dict, *keys: str) -> str | None:
    for key in keys:
        val = result.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


async def draft_caption(
    llm: LLMClient,
    *,
    summary: str,
    image_url: str | None = None,
    room_tag: str | None = None,
    language: str = DEFAULT_LANGUAGE,
) -> str:
    """Draft a warm, plain-language photo caption from an ops summary.

    The contractor edits this before publishing. Never adds facts beyond
    ``summary``/``room_tag``.

    ``image_url`` and ``language`` are frozen in H6.1 (keyword-only, defaulted)
    so callers can pass them today; the body is otherwise unchanged. H6·6 swaps
    the inner ``llm.complete`` for ``llm.complete_vision(..., image_url, ...)``
    when an image is present, and H6·5 weaves ``language`` into the prompt.
    """
    where = f" (room: {room_tag})" if room_tag else ""
    system = (
        "You write short, warm, jargon-free photo captions for a homeowner "
        "watching their house being built. One sentence. No site jargon, no "
        "headcounts, no vendor names. Only describe what the provided note says."
    )
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
    )
    result = await llm.complete(
        system,
        f"Phase: {phase}\nSchedule: {schedule or ''}",
        {"type": "object", "properties": {"text": {"type": "string"}}},
    )
    return _first_str(result, "text", "summary") or phase.strip()


async def generate_design_profile(
    llm: LLMClient,
    *,
    selection_pairs: list[tuple[str, str]],
    reference_tags: list[str],
    language: str = DEFAULT_LANGUAGE,
) -> dict:
    """Draft the homeowner's design profile (a text profile + tone) from intake.

    Returns a jsonb-ready dict. The homeowner confirms / adjusts it ("this feels
    right / adjust"). Tolerant of the fake provider's default shape.

    ``language`` is frozen in H6.1 (accepted and ignored); H6·5 threads it into
    the prompt.
    """
    picks = "; ".join(f"{item}={choice}" for item, choice in selection_pairs) or "(none yet)"
    refs = ", ".join(t for t in reference_tags if t) or "(no references)"
    system = (
        "You are an interior design assistant. From the homeowner's selections and "
        "reference tags, write a short design profile: a one-paragraph 'profile' "
        "describing their taste, and a 'tone' of 3-5 keywords. Do not invent "
        "specific products they did not choose."
    )
    result = await llm.complete(
        system,
        f"Selections: {picks}\nReference tags: {refs}",
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
    return {"profile": text, "tone": tone, "source": {"selections": picks, "references": refs}}


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
