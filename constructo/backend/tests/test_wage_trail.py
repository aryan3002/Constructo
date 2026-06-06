"""The mukadam wage-trail (1.9) — attendance → worker-days, scoped, with evidence."""
from datetime import date, timedelta

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import SiteEventModel, UserRole
from app.sites.models import SiteAssignment


def auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _att(site_id, headcount, on):
    return SiteEventModel(
        site_id=site_id, event_type="attendance", occurred_on=on, summary="att",
        fields={"headcount": headcount}, confidence=1.0, needs_clarification=False,
        source_message_ids=[],
    )


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    mukadam = await factory.user(company=company, role=UserRole.labor_contractor)
    site = await factory.site(company, name="Sunrise")
    db_session.add(SiteAssignment(site_id=site.id, user_id=mukadam.id))
    await db_session.flush()
    return company, mukadam, site


async def test_wage_trail_aggregates_worker_days(client, db_session, world):
    _, mukadam, site = world
    today = date.today()
    db_session.add_all([
        _att(site.id, 12, today),
        _att(site.id, 8, today - timedelta(days=1)),
    ])
    await db_session.flush()
    resp = await client.get("/api/v1/me/wage-trail?days=30", headers=auth(mukadam))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_worker_days"] == 20
    assert body["days_logged"] == 2
    assert len(body["evidence_event_ids"]) == 2
    assert body["by_date"][today.isoformat()] == 12


async def test_wage_trail_excludes_unassigned_sites(client, db_session, factory, world):
    company, mukadam, site = world
    other = await factory.site(company, name="Other")
    db_session.add_all([
        _att(site.id, 10, date.today()),
        _att(other.id, 999, date.today()),  # not the mukadam's site
    ])
    await db_session.flush()
    resp = await client.get("/api/v1/me/wage-trail", headers=auth(mukadam))
    assert resp.json()["total_worker_days"] == 10  # the other site's 999 never leaks


async def test_wage_trail_empty_when_no_sites(client, factory):
    company = await factory.company()
    stranger = await factory.user(company=company, role=UserRole.labor_contractor)  # unassigned
    resp = await client.get("/api/v1/me/wage-trail", headers=auth(stranger))
    assert resp.json()["total_worker_days"] == 0
    assert resp.json()["days_logged"] == 0
