"""Schedule detectors — pure functions over milestone rows. Hand-computable.

stale_milestone: a phase running far past its industry-typical duration.
phase_sequence_violation: a later phase active/done while an earlier one isn't.
"""
from datetime import date, timedelta

from app.intelligence.detectors.base import MilestoneRow
from app.intelligence.detectors.schedule import (
    phase_sequence_violation,
    stale_milestone,
)

TODAY = date(2026, 6, 25)


def _ms(name, status, started=None, **kw):
    return MilestoneRow(
        id=kw.get("id", name), name=name, status=status,
        started_on=started, expected_on=kw.get("expected_on"),
        completed_on=kw.get("completed_on"),
    )


# ---- stale_milestone ----

def test_stale_milestone_flags_phase_far_past_typical():
    # Plastering typical (10,18); 40 days in > 18*1.5 (27) -> stale, and > 18*2 -> high
    ms = [_ms("Plastering", "now", started=TODAY - timedelta(days=40))]
    out = stale_milestone(ms, today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "stale_milestone"
    assert out[0].severity == "high"
    assert out[0].phase == "plastering"
    assert out[0].evidence_event_ids == ["Plastering"]


def test_stale_milestone_quiet_within_typical_window():
    ms = [_ms("Plastering", "now", started=TODAY - timedelta(days=12))]
    assert stale_milestone(ms, today=TODAY) == []


def test_stale_milestone_ignores_done_and_unknown_phases():
    ms = [
        _ms("Plastering", "done", started=TODAY - timedelta(days=99)),
        _ms("Some custom step", "now", started=TODAY - timedelta(days=99)),
    ]
    assert stale_milestone(ms, today=TODAY) == []


# ---- phase_sequence_violation ----

def test_sequence_violation_when_later_phase_done_before_earlier():
    ms = [
        _ms("Brickwork", "now", started=TODAY - timedelta(days=5)),
        _ms("Plastering", "done", completed_on=TODAY),
    ]
    out = phase_sequence_violation(ms, today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "phase_sequence_violation"
    assert out[0].severity == "high"


def test_no_violation_when_phases_in_order():
    ms = [
        _ms("Brickwork", "done", completed_on=TODAY - timedelta(days=10)),
        _ms("Plastering", "now", started=TODAY - timedelta(days=3)),
    ]
    assert phase_sequence_violation(ms, today=TODAY) == []
