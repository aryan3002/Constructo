"""Pure unit tests for attendance domain logic (no DB, no network)."""
from app.attendance.service import build_summary, classify_variance


def test_build_summary_singular_plural():
    assert build_summary(1, None, None) == "1 worker present"
    assert build_summary(24, None, None) == "24 workers present"


def test_build_summary_with_trade_and_note():
    s = build_summary(16, {"mason": 6, "helper": 10}, "  rain stopped at 3pm  ")
    assert s == "16 workers present (6 mason, 10 helper) — rain stopped at 3pm"


def test_classify_variance_no_baseline_is_info():
    assert classify_variance(None, 12) == (None, "info")


def test_classify_variance_meets_or_exceeds_is_ok():
    assert classify_variance(20, 20) == (0, "ok")
    assert classify_variance(20, 25) == (5, "ok")


def test_classify_variance_small_shortfall_is_warn():
    # 20 * 0.15 = 3 tolerance; short by 2 -> warn.
    assert classify_variance(20, 18) == (-2, "warn")


def test_classify_variance_large_shortfall_is_risk():
    assert classify_variance(20, 8) == (-12, "risk")


def test_classify_variance_small_baseline_tolerance_floor():
    # Expected 1, present 0: tolerance floors at 1, so a 1-short is warn not risk.
    assert classify_variance(1, 0) == (-1, "warn")
