"""Phone normalization for tolerant login lookup (app/auth/phone.py)."""
from app.auth.phone import normalize_phone, phone_candidates

SEED = "+919800000001"  # the form the demo seed stores the owner as


def test_normalize_canonicalizes_indian_forms():
    assert normalize_phone("9800000001") == SEED
    assert normalize_phone("09800000001") == SEED
    assert normalize_phone("919800000001") == SEED
    assert normalize_phone("+919800000001") == SEED
    assert normalize_phone("+91 98000 00001") == SEED
    assert normalize_phone("98000-00001") == SEED


def test_candidates_always_include_the_seed_form():
    # However the returning owner types it, the stored +91… row is a candidate,
    # so login finds the existing user instead of creating a new owner.
    for raw in ["9800000001", "09800000001", "919800000001", "+91 98000-00001", SEED]:
        assert SEED in phone_candidates(raw)


def test_candidates_include_the_raw_input():
    assert "919999999999" in phone_candidates("919999999999")
    assert "+919999999999" in phone_candidates("919999999999")


def test_empty_is_safe():
    assert normalize_phone("") == ""
    assert phone_candidates("") == []
