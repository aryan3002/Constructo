"""Unit tests for the pure Owner Home aggregation (no DB, no network)."""
from __future__ import annotations

from datetime import date, datetime
from types import SimpleNamespace
from uuid import uuid4

from app.dashboard.aggregate import (
    MAX_TOP_RISKS,
    PULSE_KINDS,
    build_home,
    build_site_card,
)

TODAY = date(2026, 5, 28)
YESTERDAY = date(2026, 5, 27)


def _site(name="Tower B"):
    return SimpleNamespace(id=uuid4(), name=name)


def _baseline(site_id, expected):
    return SimpleNamespace(site_id=site_id, expected_daily_headcount=expected)


def _event(site_id, event_type, *, fields=None, confidence=0.95, needs=False, on=TODAY):
    return SimpleNamespace(
        id=uuid4(),
        site_id=site_id,
        event_type=event_type,
        occurred_on=on,
        summary=f"{event_type} summary",
        fields=fields or {},
        confidence=confidence,
        needs_clarification=needs,
        source_message_ids=[],
        version=1,
        supersedes_event_id=None,
        created_at=datetime(2026, 5, 28, 9, 0, 0),
    )


def test_labor_shortfall_fires_against_baseline():
    site = _site()
    events = [_event(site.id, "attendance", fields={"headcount": 4})]
    baseline = _baseline(site.id, expected=10)

    card = build_site_card(site, events, baseline)

    labor = [r for r in card["top_risks"] if r["kind"] == "labor_shortfall"]
    assert labor, "labor shortfall should fire when headcount < expected"
    assert labor[0]["severity"] == "high"  # 4/10 <= 0.5
    assert labor[0]["status"] == "risk"
    assert card["expected_headcount"] == 10
    # every risk carries evidence that exists among the events
    event_ids = {str(e.id) for e in events}
    assert set(labor[0]["evidence_event_ids"]).issubset(event_ids)


def test_no_labor_risk_when_at_or_above_baseline():
    site = _site()
    events = [_event(site.id, "attendance", fields={"headcount": 12})]
    card = build_site_card(site, events, _baseline(site.id, expected=10))
    assert not [r for r in card["top_risks"] if r["kind"] == "labor_shortfall"]
    # labor pulse tile reports the headcount and stays ok
    labor_tile = next(t for t in card["pulse"] if t["kind"] == "labor")
    assert labor_tile["status"] == "ok"
    assert labor_tile["value"] == 12


def test_pulse_grid_has_four_tiles_in_fixed_order():
    site = _site()
    card = build_site_card(site, [], None)
    kinds = [t["kind"] for t in card["pulse"]]
    assert tuple(kinds) == PULSE_KINDS
    assert len(card["pulse"]) == 4


def test_unverified_invoice_lights_cash_and_material_tiles():
    site = _site()
    events = [_event(site.id, "invoice_received", fields={"vendor": "Shree Cement"})]
    card = build_site_card(site, events, None)

    cash = next(t for t in card["pulse"] if t["kind"] == "cash")
    material = next(t for t in card["pulse"] if t["kind"] == "material")
    assert cash["status"] == "risk"
    assert material["status"] == "risk"
    # tile evidence deep-links to the offending event
    assert str(events[0].id) in cash["evidence_event_ids"]


def test_risk_overflow_caps_top_risks_at_three():
    site = _site()
    # 4 distinct risk kinds -> only 3 shown, 1 overflow
    events = [
        _event(site.id, "attendance", fields={"headcount": 1}),  # labor_shortfall
        _event(site.id, "invoice_received", fields={"vendor": "X"}),  # unverified
        _event(site.id, "payment_request"),  # pending_approval
        _event(site.id, "issue", confidence=0.2, needs=True),  # data_quality
    ]
    card = build_site_card(site, events, _baseline(site.id, expected=10))
    assert len(card["top_risks"]) == MAX_TOP_RISKS
    assert card["risk_overflow"] == 1


def test_day_over_day_drop_when_no_baseline():
    site = _site()
    today = [_event(site.id, "attendance", fields={"headcount": 4})]
    prev = [_event(site.id, "attendance", fields={"headcount": 10}, on=YESTERDAY)]
    card = build_site_card(site, today, None, prev_event_rows=prev)
    assert [r for r in card["top_risks"] if r["kind"] == "labor_shortfall"]


def test_build_home_headline_and_ordering():
    calm = _site("Calm Site")
    busy = _site("Busy Site")
    sites = [calm, busy]
    events = {
        busy.id: [_event(busy.id, "attendance", fields={"headcount": 2})],
        calm.id: [_event(calm.id, "attendance", fields={"headcount": 15})],
    }
    baselines = {
        busy.id: _baseline(busy.id, 10),
        calm.id: _baseline(calm.id, 10),
    }
    home = build_home(sites, events, baselines)

    assert home["sites_total"] == 2
    assert home["needs_attention_count"] >= 1
    assert home["sites_needing_attention"] == 1
    assert home["cold_start"] is False
    # exceptions-first: the at-risk site sorts ahead of the calm one
    assert home["sites"][0]["name"] == "Busy Site"


def test_cold_start_checklist_when_no_sites():
    home = build_home([], {}, {})
    assert home["cold_start"] is True
    assert home["needs_attention_count"] == 0
    keys = {step["key"] for step in home["setup_checklist"]}
    assert keys == {"add_project", "invite_team", "start_chat"}
    assert all(step["done"] is False for step in home["setup_checklist"])


def test_warmed_up_as_soon_as_a_site_exists_even_without_baseline():
    # The setup checklist is an activity-first cold-start gate: once a project
    # (site) exists, the owner is past cold-start regardless of whether a
    # baseline is configured yet — baselines are a risk-detection input, not a
    # setup-completion gate.
    site = _site()
    events = {site.id: [_event(site.id, "attendance", fields={"headcount": 5})]}
    home = build_home([site], events, {})
    assert home["cold_start"] is False
    assert home["setup_checklist"] == []


def test_warmed_up_once_site_has_events_and_baseline():
    site = _site()
    events = {site.id: [_event(site.id, "attendance", fields={"headcount": 5})]}
    baselines = {site.id: _baseline(site.id, 10)}
    home = build_home([site], events, baselines)
    assert home["cold_start"] is False
    assert home["setup_checklist"] == []
