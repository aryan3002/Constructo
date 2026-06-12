"""Nivaan numeric guard: an agent string may never introduce an ungrounded digit."""
from app.agent.nivaan_guard import numbers_are_grounded


def test_text_without_digits_always_passes():
    assert numbers_are_grounded("Delivery looks fine — no issues.", []) is True


def test_every_drafted_number_present_in_evidence_passes():
    assert numbers_are_grounded(
        "₹45,000 across 2 invoices.",
        ["invoice for 45000 rupees", "2 invoices recorded"],
    ) is True


def test_comma_grouping_is_normalized():
    # 45,000 and 45000 are the same token (reuses extract_numeric_tokens).
    assert numbers_are_grounded("₹45,000 billed.", ["amount 45000"]) is True


def test_an_invented_number_is_blocked():
    # The LLM said 450000 but the record only has 45000 → ungrounded → blocked.
    assert numbers_are_grounded("₹450,000 billed.", ["amount 45000"]) is False


def test_no_evidence_with_a_digit_is_blocked():
    assert numbers_are_grounded("90 bori cement.", []) is False
