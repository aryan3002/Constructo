"""Portfolio exact-math Q&A (Phase 3.4) — per-site + portfolio totals, scoped."""
from datetime import date

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import SiteEventModel, UserRole
from app.sites.models import SiteAssignment


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _ev(site_id, etype, fields):
    return SiteEventModel(
        site_id=site_id, event_type=etype, occurred_on=date.today(), summary=etype,
        fields=fields, confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site_a = await factory.site(company, name="Alpha")
    site_b = await factory.site(company, name="Bravo")
    return company, owner, site_a, site_b


async def test_portfolio_rolls_up_across_sites(client, db_session, world):
    _, owner, a, b = world
    db_session.add_all([
        _ev(a.id, "attendance", {"headcount": 10}),
        _ev(a.id, "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        _ev(a.id, "invoice_received", {"amount": 40000}),
        _ev(b.id, "attendance", {"headcount": 5}),
        _ev(b.id, "material_delivery", {"material": "cement", "quantity": 30, "unit": "bag"}),
        _ev(b.id, "invoice_received", {"amount": 10000}),
    ])
    await db_session.flush()
    resp = await client.get(
        "/api/v1/portfolio/summary?days=1&material=cement", headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["site_count"] == 2
    # busiest site (Alpha, 10 worker-days) sorts first
    assert body["sites"][0]["site_name"] == "Alpha"
    assert body["totals"]["worker_days"] == 15
    assert body["totals"]["amount_total"] == 50000
    assert body["totals"]["deliveries"] == 2
    # bag + bori canonicalise to one unit → portfolio total sums
    assert body["totals"]["material_qty"] == 80
    assert body["totals"]["material_unit"] == "bori"


async def test_portfolio_scoped_to_assigned_sites(client, factory, db_session, world):
    company, _, a, b = world
    # A supervisor assigned only to site B sees only B in the portfolio.
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=b.id, user_id=sup.id))
    db_session.add_all([
        _ev(a.id, "attendance", {"headcount": 10}),
        _ev(b.id, "attendance", {"headcount": 5}),
    ])
    await db_session.flush()
    resp = await client.get("/api/v1/portfolio/summary?days=1", headers=auth(sup))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["site_count"] == 1
    assert body["sites"][0]["site_name"] == "Bravo"
    assert body["totals"]["worker_days"] == 5


async def test_portfolio_homeowner_blocked(client, factory, world):
    company, _, _, _ = world
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    resp = await client.get("/api/v1/portfolio/summary", headers=auth(homeowner))
    assert resp.status_code == 403
