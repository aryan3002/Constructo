"""Quality/compliance detectors — pure functions over EventRow lists."""
from datetime import date, timedelta

from app.intelligence.detectors.base import EventRow
from app.intelligence.detectors.quality import curing_violation, missing_approval

TODAY = date(2026, 6, 25)


def _ev(id, etype, days_ago, summary="", fields=None):
    return EventRow(
        id=id, event_type=etype, occurred_on=TODAY - timedelta(days=days_ago),
        summary=summary, fields=fields or {}, confidence=0.9,
    )


# ---- curing_violation ----

def test_curing_violation_when_loadwork_too_soon_after_slab():
    events = [
        _ev("s1", "progress_update", 10, summary="first floor slab casting done"),
        _ev("b1", "progress_update", 2, summary="brickwork started on first floor"),
    ]
    out = curing_violation(events, today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "curing_violation"
    assert out[0].severity == "critical"


def test_no_curing_violation_after_full_window():
    events = [
        _ev("s1", "progress_update", 30, summary="slab casting done"),
        _ev("b1", "progress_update", 2, summary="brickwork started"),
    ]
    assert curing_violation(events, today=TODAY) == []


def test_no_curing_violation_without_following_loadwork():
    events = [_ev("s1", "progress_update", 5, summary="slab casting done")]
    assert curing_violation(events, today=TODAY) == []


# ---- missing_approval ----

def test_missing_approval_when_gated_work_has_no_prior_approval():
    events = [_ev("p1", "progress_update", 3, summary="slab casting completed")]
    out = missing_approval(events, today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "missing_approval"
    assert out[0].severity == "high"


def test_no_missing_approval_when_approved_before_work():
    events = [
        _ev("a1", "approval", 5, summary="slab design approved"),
        _ev("p1", "progress_update", 3, summary="slab casting completed"),
    ]
    assert missing_approval(events, today=TODAY) == []


def test_ungated_work_needs_no_approval():
    events = [_ev("p1", "progress_update", 3, summary="painting completed")]
    assert missing_approval(events, today=TODAY) == []
