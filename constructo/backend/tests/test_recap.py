"""Thread recap / Catch-me-up (2.6) — deterministic distillation, scoped."""
from datetime import date

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import SiteEventModel, UserRole


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _ev(site_id, etype, fields):
    return SiteEventModel(
        site_id=site_id, event_type=etype, occurred_on=date.today(), summary=etype,
        fields=fields, confidence=1.0, needs_clarification=False, source_message_ids=[],
    )


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_recap_distills_thread(client, db_session, world):
    _, owner, site = world
    db_session.add_all([
        _ev(site.id, "attendance", {"headcount": 20}),
        _ev(site.id, "attendance", {"headcount": 12}),
        _ev(site.id, "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        _ev(site.id, "invoice_received", {"amount": 85000}),
    ])
    await db_session.flush()
    resp = await client.get(f"/api/v1/recap?site_id={site.id}&days=1", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["event_counts"]["attendance"] == 2
    assert body["worker_days"] == 32
    assert body["material_totals"]["cement: bori"] == 50
    assert body["amount_total"] == 85000
    assert "worker-days" in body["summary"]


async def test_recap_empty_window(client, world):
    _, owner, site = world
    resp = await client.get(f"/api/v1/recap?site_id={site.id}", headers=auth(owner))
    assert resp.json()["summary"] == "Nothing logged in this window."


async def test_recap_scoped(client, factory, world):
    company, _, site = world
    other = await factory.user(company=company, role=UserRole.supervisor)  # unassigned
    resp = await client.get(f"/api/v1/recap?site_id={site.id}", headers=auth(other))
    assert resp.status_code == 403
