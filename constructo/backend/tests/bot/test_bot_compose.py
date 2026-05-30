"""Compose layer — Guest Rule reaction/clarification, query evidence, brief render."""
from __future__ import annotations

from datetime import date
from uuid import uuid4

from app.bot.compose import (
    ReplyKind,
    compose_brief,
    compose_capture,
    compose_query_answer,
    is_sensitive,
    resolve_reply_target,
)


def test_capture_high_confidence_reacts_silently():
    r = compose_capture("aaj 10 bori cement aa gaya", confidence=0.9)
    assert r.kind is ReplyKind.reaction
    assert r.emoji == "✅"
    assert r.text is None


def test_capture_low_confidence_money_asks_one_clarification_via_dm():
    r = compose_capture("payment ka kuch karna hai shayad", confidence=0.4)
    # Sensitive + ambiguous → ONE numbered clarification, and it goes to DM.
    assert r.dm is True
    assert r.kind is ReplyKind.dm
    assert "1." in r.text and "2." in r.text
    # exactly one question
    assert r.text.count("?") <= 1


def test_capture_low_confidence_schedule_clarifies_in_group():
    r = compose_capture("slab ka schedule pakka karna hai", confidence=0.4)
    assert r.kind is ReplyKind.text
    assert r.dm is False
    assert "1." in r.text


def test_capture_low_confidence_but_routine_still_reacts():
    # Low confidence but no money/schedule ambiguity → still just react (no spam).
    r = compose_capture("theek hai", confidence=0.3)
    assert r.kind is ReplyKind.reaction


def test_query_answer_carries_evidence():
    hits = [
        {"summary": "10 mazdoor aaye", "site_name": "Site A",
         "occurred_on": date(2026, 5, 28), "event_type": "attendance"},
    ]
    r = compose_query_answer("kitne mazdoor aaye?", hits, answerable=True)
    assert r.kind is ReplyKind.text
    assert "10 mazdoor aaye" in r.text
    assert "Site A" in r.text  # which site
    assert "2026-05-28" in r.text  # when


def test_query_unanswerable_says_so_honestly():
    r = compose_query_answer("kuch bhi", [], answerable=False)
    assert r.kind is ReplyKind.text
    assert "nahi" in r.text.lower()  # honest "don't have data"


def test_query_sensitive_answer_goes_to_dm():
    hits = [
        {"summary": "advance payment Rs 50000 bheja", "site_name": "Site A",
         "occurred_on": date(2026, 5, 28), "event_type": "payment_request"},
    ]
    r = compose_query_answer("payment kitna bheja?", hits, answerable=True)
    assert r.kind is ReplyKind.dm
    assert r.dm is True


def test_is_sensitive():
    assert is_sensitive("advance payment Rs 50000")
    assert is_sensitive("tankhwah kab milegi")
    assert not is_sensitive("10 bori cement aaya")


def test_compose_brief_builds_numbered_reply_map():
    d1, d2 = uuid4(), uuid4()
    render = compose_brief(
        "Morning brief — Site A theek hai.",
        [{"id": d1, "title": "Cement advance approve karna hai"},
         {"id": d2, "title": "Mistri ka payment"}],
    )
    assert render.reply_map == {"1": str(d1), "2": str(d2)}
    assert "1. Cement advance" in render.text
    assert "2. Mistri" in render.text


def test_compose_brief_no_decisions_has_empty_map():
    render = compose_brief("Sab theek.", [])
    assert render.reply_map == {}
    assert "Sab theek." in render.text


def test_resolve_reply_target_bare_number_is_approve():
    d1 = uuid4()
    rmap = {"1": str(d1)}
    verb, did = resolve_reply_target("1", rmap)
    assert verb == "approve"
    assert did == d1


def test_resolve_reply_target_hold_n():
    d1, d2 = uuid4(), uuid4()
    rmap = {"1": str(d1), "2": str(d2)}
    verb, did = resolve_reply_target("hold 2", rmap)
    assert verb == "hold"
    assert did == d2


def test_resolve_reply_target_proof():
    d1 = uuid4()
    verb, did = resolve_reply_target("show proof 1", {"1": str(d1)})
    assert verb == "proof"
    assert did == d1


def test_resolve_reply_target_bare_verb_single_item():
    d1 = uuid4()
    verb, did = resolve_reply_target("approve", {"1": str(d1)})
    assert verb == "approve"
    assert did == d1


def test_resolve_reply_target_bare_verb_ambiguous_returns_none():
    rmap = {"1": str(uuid4()), "2": str(uuid4())}
    assert resolve_reply_target("approve", rmap) is None


def test_resolve_reply_target_unknown_returns_none():
    assert resolve_reply_target("hello", {"1": str(uuid4())}) is None
    assert resolve_reply_target("5", {"1": str(uuid4())}) is None
