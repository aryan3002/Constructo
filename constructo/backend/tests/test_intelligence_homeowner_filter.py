"""Homeowner-safe findings filter — which findings cross the trust membrane and
how they're reframed. Pure, hand-computable."""
from datetime import date
from uuid import uuid4

from app.intelligence.homeowner_filter import homeowner_cards, to_card
from app.models import SiteFinding


def _f(ftype, *, status="open", phase="plastering"):
    return SiteFinding(
        id=uuid4(), site_id=uuid4(), finding_type=ftype, severity="high",
        status=status, headline="raw headline", detail="raw detail", phase=phase,
        dedupe_key=f"{ftype}:{phase}", evidence=[], detected_on=date(2026, 6, 25),
    )


def test_schedule_finding_becomes_gentle_card():
    card = to_card(_f("stale_milestone", phase="plastering"))
    assert card is not None
    assert card.category == "schedule"
    assert card.respondable is False
    assert "plastering" in card.headline.lower()
    # warm-reframed, not the raw contractor headline
    assert card.headline != "raw headline"


def test_design_finding_is_respondable():
    for t in ("photo_vs_theme", "material_theme_clash"):
        card = to_card(_f(t))
        assert card is not None
        assert card.category == "design"
        assert card.respondable is True


def test_operational_findings_are_hidden_from_homeowner():
    for t in (
        "material_work_mismatch", "attendance_erosion", "vendor_concentration",
        "missing_approval", "idle_gap", "repeat_issue_pattern",
        "phase_sequence_violation", "curing_violation",
    ):
        assert to_card(_f(t)) is None


def test_acknowledged_and_resolved_are_hidden():
    assert to_card(_f("stale_milestone", status="acknowledged")) is None
    assert to_card(_f("stale_milestone", status="resolved")) is None


def test_homeowner_cards_filters_mixed_list():
    findings = [_f("stale_milestone"), _f("attendance_erosion"), _f("photo_vs_theme")]
    cards = homeowner_cards(findings)
    assert len(cards) == 2
    assert {c.category for c in cards} == {"schedule", "design"}
