"""Deterministic numeral-repair tests (Hindi/Hinglish spoken numbers -> digits)."""
import pytest

from app.extraction.numeral_repair import repair_numerals


@pytest.mark.parametrize(
    "text,expected",
    [
        # The headline cases from the spec.
        ("do sau assi bori", "280 bori"),
        ("teen hazaar rupaye", "3000 rupaye"),
        ("paanch sau", "500"),
        # Mixed scales accumulate correctly.
        ("teen hazaar do sau assi", "3280"),
        ("ek lakh", "100000"),
        ("do lakh paanch hazaar", "205000"),
        # Spelling variants are handled.
        ("panch sau", "500"),
        ("teen hazar", "3000"),
    ],
)
def test_spoken_numbers_become_digits(text, expected):
    assert repair_numerals(text) == expected


def test_repair_in_a_full_hinglish_phrase():
    # A realistic supervisor utterance: only the number words are rewritten,
    # the jargon/nouns are preserved.
    out = repair_numerals("cement do sau assi bori aaya")
    assert out == "cement 280 bori aaya"


# ---- the guard: never corrupt clean text or clean digits -------------------


def test_clean_digit_string_is_untouched():
    assert repair_numerals("280") == "280"
    assert repair_numerals("45,000") == "45,000"
    assert repair_numerals("24 mazdoor aaye") == "24 mazdoor aaye"


def test_non_numeric_text_is_untouched():
    assert repair_numerals("cement aa gaya") == "cement aa gaya"
    assert repair_numerals("slab ka kaam chal raha hai") == "slab ka kaam chal raha hai"
    assert repair_numerals("") == ""


def test_punctuation_and_spacing_preserved():
    assert repair_numerals("do sau, teen hazaar!") == "200, 3000!"


# ---- the money-moment guard: ambiguity is left for clarification -----------


def test_ambiguous_run_left_as_words_for_clarification():
    # "do teen" (two bare units, no scale) is ambiguous — repair must NOT guess a
    # number; it leaves the whole run as words so the CLARIFY_THRESHOLD gate can
    # ask a human rather than emit a confident-but-wrong number (CA1/CA6).
    out = repair_numerals("do teen mazdoor")
    assert out == "do teen mazdoor"
    assert not any(ch.isdigit() for ch in out)
