"""Operational detectors — pure functions over EventRow lists. Hand-computable."""
from datetime import date, timedelta

from app.intelligence.detectors.base import EventRow
from app.intelligence.detectors.operational import (
    attendance_erosion,
    idle_gap,
    repeat_issue_pattern,
    vendor_concentration,
)

TODAY = date(2026, 6, 25)


def _ev(id, etype, days_ago, fields=None, summary=""):
    return EventRow(
        id=id, event_type=etype, occurred_on=TODAY - timedelta(days=days_ago),
        summary=summary, fields=fields or {}, confidence=0.9,
    )


# ---- idle_gap ----

def test_idle_gap_flags_silent_site():
    out = idle_gap([_ev("e1", "progress_update", 7)], today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "idle_gap"
    assert out[0].severity == "medium"  # 7 < 2x gap(5)


def test_idle_gap_quiet_when_recent_activity():
    assert idle_gap([_ev("e1", "attendance", 2)], today=TODAY) == []


def test_idle_gap_empty_site_not_flagged():
    assert idle_gap([], today=TODAY) == []


# ---- attendance_erosion ----

def test_attendance_erosion_flags_sustained_decline():
    events = [
        _ev("a5", "attendance", 4, {"headcount": 20}),
        _ev("a4", "attendance", 3, {"headcount": 18}),
        _ev("a3", "attendance", 2, {"headcount": 15}),
        _ev("a2", "attendance", 1, {"headcount": 12}),
        _ev("a1", "attendance", 0, {"headcount": 10}),
    ]
    out = attendance_erosion(events, today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "attendance_erosion"


def test_attendance_erosion_quiet_when_not_monotonic():
    events = [
        _ev("a5", "attendance", 4, {"headcount": 20}),
        _ev("a4", "attendance", 3, {"headcount": 18}),
        _ev("a3", "attendance", 2, {"headcount": 20}),
        _ev("a2", "attendance", 1, {"headcount": 15}),
        _ev("a1", "attendance", 0, {"headcount": 12}),
    ]
    assert attendance_erosion(events, today=TODAY) == []


# ---- vendor_concentration ----

def test_vendor_concentration_flags_single_vendor_dominance():
    events = [
        _ev("d1", "material_delivery", 5, {"vendor": "ACC"}),
        _ev("d2", "material_delivery", 4, {"vendor": "ACC"}),
        _ev("d3", "material_delivery", 3, {"vendor": "ACC"}),
        _ev("d4", "material_delivery", 2, {"vendor": "ACC"}),
        _ev("d5", "material_delivery", 1, {"vendor": "Local"}),
    ]
    out = vendor_concentration(events, today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "vendor_concentration"
    assert out[0].severity == "low"


def test_vendor_concentration_quiet_when_diversified():
    events = [
        _ev("d1", "material_delivery", 5, {"vendor": "ACC"}),
        _ev("d2", "material_delivery", 4, {"vendor": "ACC"}),
        _ev("d3", "material_delivery", 3, {"vendor": "Local"}),
        _ev("d4", "material_delivery", 2, {"vendor": "Other"}),
        _ev("d5", "material_delivery", 1, {"vendor": "Three"}),
    ]
    assert vendor_concentration(events, today=TODAY) == []


def test_vendor_concentration_needs_minimum_volume():
    events = [_ev("d1", "material_delivery", 1, {"vendor": "ACC"})]
    assert vendor_concentration(events, today=TODAY) == []


# ---- repeat_issue_pattern ----

def test_repeat_issue_flags_recurring_keyword():
    events = [
        _ev("i1", "issue", 20, summary="paani leak ho raha hai"),
        _ev("i2", "issue", 10, summary="leak again in bathroom"),
        _ev("i3", "issue", 2, summary="leakage near pipe"),
    ]
    out = repeat_issue_pattern(events, today=TODAY)
    assert len(out) == 1
    assert out[0].finding_type == "repeat_issue_pattern"
    assert out[0].severity == "high"


def test_repeat_issue_quiet_below_threshold():
    events = [
        _ev("i1", "issue", 10, summary="leak in bathroom"),
        _ev("i2", "issue", 2, summary="crack in wall"),
    ]
    assert repeat_issue_pattern(events, today=TODAY) == []
