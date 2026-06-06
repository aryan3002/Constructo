"""AI action-item detector (2.7) — conservative, deterministic, due parsing."""
from datetime import date

from app.action_items.detector import detect_action_item

# A Wednesday, for deterministic weekday math.
TODAY = date(2026, 6, 3)


def test_detects_assignment_with_weekday_due():
    p = detect_action_item("Ramesh ko Friday tak bolo cement order karne", today=TODAY)
    assert p is not None
    assert "Ramesh" in p.title
    assert p.due_on == date(2026, 6, 5)  # the coming Friday


def test_detects_relative_due():
    p = detect_action_item("kal tak PO bhej do vendor ko", today=TODAY)
    assert p is not None
    assert p.due_on == date(2026, 6, 4)  # kal = tomorrow


def test_assignment_without_due_has_no_due():
    p = detect_action_item("supervisor ko bolo site clean karwa do", today=TODAY)
    assert p is not None
    assert p.due_on is None


def test_no_cue_returns_none():
    # A plain capture / chatter with no assignment cue.
    assert detect_action_item("50 bori cement aa gaya", today=TODAY) is None
    assert detect_action_item("good morning team", today=TODAY) is None
    assert detect_action_item("", today=TODAY) is None


def test_weekday_rolls_to_next_week_when_today():
    # On a Wednesday, "budhwar" (Wednesday) means next Wednesday, not today.
    p = detect_action_item("budhwar tak report bhej do", today=TODAY)
    assert p is not None
    assert p.due_on == date(2026, 6, 10)
