"""Intent classification — Hinglish fast-paths + LLM fallback (network-free)."""
from __future__ import annotations

import pytest

from app.bot.intents import Intent, classify, fastpath
from app.extraction.llm import FakeLLMClient


def test_fastpath_bare_number_is_brief_reply_when_brief_pending():
    r = fastpath("1", brief_pending=True)
    assert r is not None
    assert r.intent is Intent.brief_reply
    assert r.slots["number"] == 1


def test_fastpath_bare_number_is_clarification_when_no_brief():
    r = fastpath("2", brief_pending=False)
    assert r is not None
    assert r.intent is Intent.clarification_answer
    assert r.slots["number"] == 2


@pytest.mark.parametrize(
    "text,verb",
    [
        ("approve", "approve"),
        ("ok kar do", "approve"),
        ("haan approve", "approve"),
        ("hold", "hold"),
        ("abhi ruk jao", "hold"),
        ("reject karo", "reject"),
    ],
)
def test_fastpath_brief_reply_verbs_hinglish(text, verb):
    r = fastpath(text, brief_pending=True)
    assert r is not None
    assert r.intent is Intent.brief_reply
    assert r.slots["verb"] == verb


def test_fastpath_show_proof():
    r = fastpath("show proof 3", brief_pending=True)
    assert r is not None
    assert r.intent is Intent.brief_reply
    assert r.slots == {"verb": "proof", "number": 3}


def test_fastpath_latest_drawing_query():
    r = fastpath("latest slab drawing bhejo", brief_pending=False)
    assert r is not None
    assert r.intent is Intent.query


def test_fastpath_help():
    assert fastpath("help").intent is Intent.help
    assert fastpath("madad").intent is Intent.help


def test_fastpath_question_with_lead_is_query():
    r = fastpath("kitne mazdoor aaye Site A?")
    assert r is not None
    assert r.intent is Intent.query


def test_fastpath_returns_none_for_routine_text():
    # A routine site update with no question/verb falls through to the LLM.
    assert fastpath("aaj 10 bori cement aa gaya") is None


@pytest.mark.asyncio
async def test_classify_routine_capture_via_llm_defaults_to_capture():
    # The extraction FakeLLM returns an event shape (no "intent" key), so the
    # classifier must default to a silent capture rather than crashing.
    llm = FakeLLMClient()
    r = await classify("aaj 10 bori cement aa gaya", llm=llm)
    assert r.intent is Intent.capture


@pytest.mark.asyncio
async def test_classify_uses_llm_intent_when_provided():
    llm = FakeLLMClient(canned={"intent": "query", "confidence": 0.8})
    r = await classify("kuch toh poochna tha", llm=llm)
    assert r.intent is Intent.query
    assert r.via == "llm"


@pytest.mark.asyncio
async def test_classify_clarification_requires_pending():
    llm = FakeLLMClient(canned={"intent": "clarification_answer", "confidence": 0.7})
    # No clarification pending → downgraded to capture.
    r = await classify("haan", clarification_pending=False, llm=llm)
    assert r.intent is Intent.capture
