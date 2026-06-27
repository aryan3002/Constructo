"""Consistency detector: material delivered but no work follows. Pure, hand-computable."""
from datetime import date, timedelta

from app.intelligence.detectors.base import EventRow
from app.intelligence.detectors.consistency import material_work_mismatch

TODAY = date(2026, 6, 25)


def _ev(id, etype, days_ago, fields=None, summary=""):
    return EventRow(
        id=id, event_type=etype, occurred_on=TODAY - timedelta(days=days_ago),
        summary=summary, fields=fields or {}, confidence=0.9,
    )


def test_flags_delivery_with_no_progress_after_it():
    events = [_ev("d1", "material_delivery", 15, {"material": "cement", "quantity": 50})]
    out = material_work_mismatch(events, today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "material_work_mismatch"
    assert out[0].severity == "medium"  # 15 days, < 2x window(10)
    assert out[0].evidence_event_ids == ["d1"]
    assert out[0].phase in ("foundation", "plinth", "structure", "brickwork", "plastering")


def test_cleared_when_progress_logged_after_delivery():
    events = [
        _ev("d1", "material_delivery", 15, {"material": "cement"}),
        _ev("p1", "progress_update", 5, summary="brickwork going on"),
    ]
    assert material_work_mismatch(events, today=TODAY) == []


def test_quiet_within_window():
    events = [_ev("d1", "material_delivery", 3, {"material": "cement"})]
    assert material_work_mismatch(events, today=TODAY) == []


def test_high_severity_when_long_idle():
    events = [_ev("d1", "material_delivery", 25, {"material": "tiles"})]
    out = material_work_mismatch(events, today=TODAY)
    assert len(out) == 1
    assert out[0].severity == "high"  # 25 >= 2x window(10)


def test_progress_before_delivery_does_not_clear():
    events = [
        _ev("p1", "progress_update", 20, summary="earlier work"),
        _ev("d1", "material_delivery", 14, {"material": "cement"}),
    ]
    assert len(material_work_mismatch(events, today=TODAY)) == 1
