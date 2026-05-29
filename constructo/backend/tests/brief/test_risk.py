"""Risk-detection unit tests (pure functions over SiteEvent lists)."""
from datetime import date
from uuid import uuid4

from app.brief.risk import detect_risks
from app.contracts.events import EventType, SiteEvent

DAY = date(2026, 5, 27)
SITE = uuid4()


def _event(event_type: EventType, *, fields=None, confidence=0.9,
           needs_clarification=False, occurred_on=DAY, summary="x") -> SiteEvent:
    return SiteEvent(
        site_id=SITE,
        event_type=event_type,
        occurred_on=occurred_on,
        summary=summary,
        fields=fields or {},
        confidence=confidence,
        needs_clarification=needs_clarification,
        source_message_ids=[uuid4()],
    )


def _kinds(risks):
    return {r["kind"] for r in risks}


def _by_kind(risks, kind):
    return [r for r in risks if r["kind"] == kind]


# ---- labor shortfall -------------------------------------------------------


def test_labor_shortfall_below_expected_threshold():
    ev = _event(EventType.attendance, fields={"headcount": 8})
    risks = detect_risks([ev], site_id=SITE, expected_headcount=20)
    shortfalls = _by_kind(risks, "labor_shortfall")
    assert len(shortfalls) == 1
    r = shortfalls[0]
    assert r["site_id"] == SITE
    assert r["evidence_event_ids"] == [ev.id]
    assert r["severity"] in {"low", "medium", "high"}
    # 8/20 = 40% present -> a serious shortfall
    assert r["severity"] == "high"


def test_no_labor_shortfall_when_at_or_above_threshold():
    ev = _event(EventType.attendance, fields={"headcount": 20})
    risks = detect_risks([ev], site_id=SITE, expected_headcount=20)
    assert _by_kind(risks, "labor_shortfall") == []


def test_labor_shortfall_day_over_day_drop_without_baseline():
    today = _event(EventType.attendance, fields={"headcount": 5})
    yesterday = _event(
        EventType.attendance, fields={"headcount": 20}, occurred_on=date(2026, 5, 26)
    )
    risks = detect_risks([today], site_id=SITE, prev_events=[yesterday])
    shortfalls = _by_kind(risks, "labor_shortfall")
    assert len(shortfalls) == 1
    assert shortfalls[0]["evidence_event_ids"] == [today.id]


def test_no_labor_shortfall_without_baseline_or_prev():
    ev = _event(EventType.attendance, fields={"headcount": 5})
    risks = detect_risks([ev], site_id=SITE)
    assert _by_kind(risks, "labor_shortfall") == []


def test_no_labor_shortfall_on_small_day_over_day_drop():
    today = _event(EventType.attendance, fields={"headcount": 18})
    yesterday = _event(
        EventType.attendance, fields={"headcount": 20}, occurred_on=date(2026, 5, 26)
    )
    risks = detect_risks([today], site_id=SITE, prev_events=[yesterday])
    assert _by_kind(risks, "labor_shortfall") == []


# ---- unverified invoice ----------------------------------------------------


def test_unverified_invoice_no_matching_delivery():
    inv = _event(EventType.invoice_received, fields={"vendor": "Acme", "amount": 45000})
    risks = detect_risks([inv], site_id=SITE)
    flagged = _by_kind(risks, "unverified_invoice")
    assert len(flagged) == 1
    assert flagged[0]["evidence_event_ids"] == [inv.id]


def test_invoice_with_matching_delivery_is_verified():
    inv = _event(EventType.invoice_received, fields={"vendor": "Acme", "amount": 45000})
    delivery = _event(EventType.material_delivery, fields={"vendor": "Acme", "material": "cement"})
    risks = detect_risks([inv, delivery], site_id=SITE)
    assert _by_kind(risks, "unverified_invoice") == []


def test_invoice_with_different_vendor_delivery_is_unverified():
    inv = _event(EventType.invoice_received, fields={"vendor": "Acme", "amount": 45000})
    delivery = _event(EventType.material_delivery, fields={"vendor": "Other", "material": "steel"})
    risks = detect_risks([inv, delivery], site_id=SITE)
    flagged = _by_kind(risks, "unverified_invoice")
    assert len(flagged) == 1
    assert flagged[0]["evidence_event_ids"] == [inv.id]


# ---- pending approvals -----------------------------------------------------


def test_pending_payment_request_flagged():
    pr = _event(EventType.payment_request, fields={"amount": 12000})
    risks = detect_risks([pr], site_id=SITE)
    flagged = _by_kind(risks, "pending_approval")
    assert len(flagged) == 1
    assert pr.id in flagged[0]["evidence_event_ids"]


def test_pending_approval_event_flagged():
    ap = _event(EventType.approval, fields={"description": "need sign-off"})
    risks = detect_risks([ap], site_id=SITE)
    assert _by_kind(risks, "pending_approval")


# ---- data quality ----------------------------------------------------------


def test_data_quality_needs_clarification():
    ev = _event(EventType.progress_update, needs_clarification=True)
    risks = detect_risks([ev], site_id=SITE)
    flagged = _by_kind(risks, "data_quality")
    assert len(flagged) == 1
    assert ev.id in flagged[0]["evidence_event_ids"]


def test_data_quality_low_confidence():
    ev = _event(EventType.progress_update, confidence=0.4)
    risks = detect_risks([ev], site_id=SITE)
    flagged = _by_kind(risks, "data_quality")
    assert len(flagged) == 1
    assert ev.id in flagged[0]["evidence_event_ids"]


def test_no_data_quality_for_confident_clear_event():
    ev = _event(EventType.progress_update, confidence=0.9)
    risks = detect_risks([ev], site_id=SITE)
    assert _by_kind(risks, "data_quality") == []


# ---- combined --------------------------------------------------------------


def test_multiple_risks_detected_together():
    attendance = _event(EventType.attendance, fields={"headcount": 5})
    inv = _event(EventType.invoice_received, fields={"vendor": "V", "amount": 9000})
    pr = _event(EventType.payment_request, fields={"amount": 3000})
    lowconf = _event(EventType.issue, confidence=0.3)
    risks = detect_risks(
        [attendance, inv, pr, lowconf], site_id=SITE, expected_headcount=20
    )
    assert {"labor_shortfall", "unverified_invoice", "pending_approval", "data_quality"} <= _kinds(
        risks
    )
    # every risk references evidence ids present in the input
    input_ids = {attendance.id, inv.id, pr.id, lowconf.id}
    for r in risks:
        assert r["evidence_event_ids"]
        assert set(r["evidence_event_ids"]) <= input_ids
