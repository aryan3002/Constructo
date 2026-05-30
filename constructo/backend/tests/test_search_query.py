"""Unit tests for plain-language query parsing (network-free, no DB)."""
from datetime import date, timedelta

from app.contracts.events import EventType
from app.search.query import parse_query


def test_parses_event_type_date_and_site_hint():
    today = date(2026, 5, 29)  # a Friday
    p = parse_query("show cement deliveries Site A this week", today=today)

    assert p.event_type is EventType.material_delivery
    # "this week" -> Monday..today
    assert p.date_from == today - timedelta(days=today.weekday())
    assert p.date_to == today
    assert p.site_name_hint == "a"
    # residual semantic text drops scaffolding + consumed filter tokens
    assert "cement" in p.semantic_text
    assert "show" not in p.semantic_text
    assert "week" not in p.semantic_text


def test_labor_below_plan_maps_to_attendance():
    p = parse_query("which sites had labor below plan")
    assert p.event_type is EventType.attendance
    # the discriminating words survive for the vector search
    assert "below" in p.semantic_text and "plan" in p.semantic_text


def test_relative_dates():
    today = date(2026, 5, 29)
    assert parse_query("issues today", today=today).date_from == today
    assert parse_query("issues yesterday", today=today).date_from == today - timedelta(days=1)
    last7 = parse_query("deliveries last 7 days", today=today)
    assert last7.date_from == today - timedelta(days=7)
    assert last7.date_to == today


def test_no_filters_keeps_full_query_as_semantic_text():
    p = parse_query("anything unusual at the foundation")
    assert p.event_type is None
    assert p.date_from is None
    # never empty — vector search always has something to embed
    assert p.semantic_text.strip()


def test_site_hint_does_not_swallow_stopwords():
    # "site events" is not a name hint
    p = parse_query("site events")
    assert p.site_name_hint is None
