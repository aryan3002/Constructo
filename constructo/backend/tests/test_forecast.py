"""Deterministic forecasting (Phase 3.3) — cadence reorder + cash-flow run-rate.

Math is deterministic; thin history abstains; projections carry assumptions.
"""
from datetime import date, timedelta

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.forecast.forecast import cashflow_forecast, material_reorder_forecasts
from app.models import SiteEventModel, UserRole

TODAY = date(2026, 6, 1)


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


# --- pure functions -------------------------------------------------------


def test_reorder_cadence_and_overdue():
    # cement every 5 days, last one 12 days ago → overdue (12 > 5*1.15).
    rows = [
        (TODAY - timedelta(days=22), "cement", 50, "bori"),
        (TODAY - timedelta(days=17), "cement", 50, "bag"),  # alias → same unit
        (TODAY - timedelta(days=12), "cement", 50, "bori"),
    ]
    out = material_reorder_forecasts(rows, today=TODAY)
    assert len(out) == 1
    f = out[0]
    assert f.material == "cement"
    assert f.unit == "bori"
    assert f.deliveries == 3
    assert f.avg_interval_days == 5.0
    assert f.avg_qty_per_delivery == 50.0
    assert f.days_since_last == 12
    assert f.overdue is True
    assert f.assumptions  # carries its working


def test_reorder_not_overdue_when_within_cadence():
    # steel every 10 days, last one only 5 days ago → not overdue (5 < 10*1.15).
    rows = [
        (TODAY - timedelta(days=25), "steel", 2, "ton"),
        (TODAY - timedelta(days=15), "steel", 2, "ton"),
        (TODAY - timedelta(days=5), "steel", 2, "ton"),
    ]
    out = material_reorder_forecasts(rows, today=TODAY)
    assert out[0].avg_interval_days == 10.0
    assert out[0].days_since_last == 5
    assert out[0].overdue is False


def test_reorder_abstains_on_thin_history():
    rows = [
        (TODAY - timedelta(days=5), "sand", 1, "trip"),
        (TODAY - timedelta(days=2), "sand", 1, "trip"),
    ]
    assert material_reorder_forecasts(rows, today=TODAY) == []  # <3 deliveries


def test_cashflow_runrate():
    rows = [
        (TODAY - timedelta(days=30), 30000),
        (TODAY - timedelta(days=20), 30000),
        (TODAY - timedelta(days=10), 30000),
    ]
    c = cashflow_forecast(rows, today=TODAY, window_days=60)
    assert c.answerable
    assert c.total_spend == 90000
    assert c.spend_days == 3
    # 90000 over 30 elapsed days = 3000/day → 90000 next 30d
    assert c.daily_run_rate == 3000.0
    assert c.projected_next_30d == 90000.0


def test_cashflow_abstains_thin():
    c = cashflow_forecast([(TODAY, 5000)], today=TODAY, window_days=60)
    assert c.answerable is False
    assert c.spend_days == 1


# --- API ------------------------------------------------------------------


def _delivery(site_id, days_ago, material, qty, unit):
    return SiteEventModel(
        site_id=site_id, event_type="material_delivery",
        occurred_on=date.today() - timedelta(days=days_ago), summary="delivery",
        fields={"material": material, "quantity": qty, "unit": unit},
        confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


def _spend(site_id, days_ago, amount):
    return SiteEventModel(
        site_id=site_id, event_type="invoice_received",
        occurred_on=date.today() - timedelta(days=days_ago), summary="invoice",
        fields={"amount": amount}, confidence=1.0, needs_clarification=False,
        source_message_ids=[],
    )


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_forecast_endpoint(client, db_session, world):
    _, owner, site = world
    db_session.add_all([
        _delivery(site.id, 22, "cement", 50, "bori"),
        _delivery(site.id, 17, "cement", 50, "bori"),
        _delivery(site.id, 12, "cement", 50, "bori"),
        _spend(site.id, 30, 30000),
        _spend(site.id, 20, 30000),
        _spend(site.id, 10, 30000),
    ])
    await db_session.flush()
    url = f"/api/v1/forecast?site_id={site.id}&window_days=60"
    resp = await client.get(url, headers=auth(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["reorder"]) == 1
    assert body["reorder"][0]["material"] == "cement"
    assert body["reorder"][0]["overdue"] is True
    assert body["cashflow"]["answerable"] is True
    assert body["overdue_count"] == 1
    assert "overdue" in body["summary"]


async def test_forecast_homeowner_blocked(client, factory, world):
    company, _, site = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    resp = await client.get(f"/api/v1/forecast?site_id={site.id}", headers=auth(homeowner))
    assert resp.status_code == 403
