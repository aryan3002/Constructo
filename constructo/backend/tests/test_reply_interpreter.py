"""Deterministic reply-interpreter (1.4) — approve lexicon + numeric correction."""
from app.chat.reply_interpreter import (
    Correction,
    apply_correction,
    is_approval,
    parse_correction,
)


def test_is_approval_lexicon():
    assert is_approval("haan")
    assert is_approval("theek hai")
    assert is_approval("haan theek hai")
    assert is_approval("ok done")
    assert is_approval("✓")


def test_is_approval_rejects_ambiguous_or_numeric():
    assert not is_approval("haan but 54 karo")  # has a number → a correction
    assert not is_approval("45 nahi 54")
    assert not is_approval("kya hua")
    assert not is_approval("")


def test_parse_correction_x_nahi_y():
    assert parse_correction("45 nahi 54") == Correction(old=45.0, new=54.0)
    assert parse_correction("12 nahin 10") == Correction(old=12.0, new=10.0)


def test_parse_correction_single_value():
    assert parse_correction("nahi 54") == Correction(old=None, new=54.0)
    assert parse_correction("54 karo") == Correction(old=None, new=54.0)


def test_parse_correction_none_when_no_intent():
    assert parse_correction("looks good") is None
    assert parse_correction("haan theek hai") is None


def test_apply_correction_matches_old_value():
    fields = {"quantity": 45, "unit": "bori", "material": "cement"}
    out = apply_correction(fields, Correction(old=45.0, new=54.0))
    assert out is not None
    new_fields, key = out
    assert key == "quantity"
    assert new_fields["quantity"] == 54
    assert new_fields["material"] == "cement"  # untouched


def test_apply_correction_single_numeric_field():
    fields = {"headcount": 12}
    out = apply_correction(fields, Correction(old=None, new=10.0))
    assert out == ({"headcount": 10}, "headcount")


def test_apply_correction_ambiguous_returns_none():
    # old value not present, and >1 numeric field → don't guess.
    fields = {"quantity": 45, "rate": 8}
    assert apply_correction(fields, Correction(old=None, new=54.0)) is None
    assert apply_correction(fields, Correction(old=99.0, new=54.0)) is None
