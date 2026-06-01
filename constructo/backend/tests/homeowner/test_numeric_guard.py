"""H6.1 numeric guard: digits/₹/dates must survive translation exactly.

The scariest failure is a 10x money error (45,000 -> 450,000); the pass+fail
cases below pin both the comma-normalization and the magnitude check.
"""
from app.homeowner.numeric_guard import numeric_guard


def test_fake_echo_passes():
    assert numeric_guard("Extra ₹45,000, 10 June", "[hi] Extra ₹45,000, 10 June") is True


def test_amount_tampered_fails():
    assert numeric_guard("₹45,000", "₹450,000") is False


def test_date_tampered_fails():
    assert numeric_guard("revised 10 June", "revised 11 June") is False


def test_comma_normalization_passes():
    assert numeric_guard("45,000", "45000") is True


def test_no_numbers_passes():
    assert numeric_guard("no numbers here", "[hi] koi number nahi") is True
