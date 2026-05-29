"""Brief router tests: run + list, permissions, company scoping."""
from datetime import date
from uuid import uuid4

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.contracts.events import EventType
from app.models import SiteEventModel, UserRole

DAY = date(2026, 5, 27)


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def setup(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Tower A")
    db_session.add(
        SiteEventModel(
            id=uuid4(),
            site_id=site.id,
            event_type=EventType.payment_request.value,
            occurred_on=DAY,
            summary="pay vendor",
            fields={"amount": 5000},
            confidence=0.9,
            needs_clarification=False,
            source_message_ids=[uuid4()],
        )
    )
    await db_session.commit()
    return company, owner, site


async def test_owner_can_run_brief(client, setup):
    company, owner, site = setup
    resp = await client.post(
        "/api/v1/briefs/run",
        json={"company_id": str(company.id), "date": DAY.isoformat()},
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body.keys()) == {"payload", "text", "brief_id"}
    assert body["payload"]["brief_date"] == DAY.isoformat()
    names = {s["name"] for s in body["payload"]["sites"]}
    assert "Tower A" in names


async def test_run_brief_defaults_to_yesterday_when_no_date(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    resp = await client.post(
        "/api/v1/briefs/run", json={"company_id": str(company.id)}, headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    assert "brief_date" in resp.json()["payload"]


async def test_pm_can_run_brief(client, factory):
    company = await factory.company()
    pm = await factory.user(company=company, role=UserRole.pm)
    resp = await client.post(
        "/api/v1/briefs/run",
        json={"company_id": str(company.id), "date": DAY.isoformat()},
        headers=auth(pm),
    )
    assert resp.status_code == 200, resp.text


async def test_supervisor_cannot_run_brief(client, factory):
    company = await factory.company()
    sup = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.post(
        "/api/v1/briefs/run",
        json={"company_id": str(company.id), "date": DAY.isoformat()},
        headers=auth(sup),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


async def test_run_brief_requires_auth(client, setup):
    company, _, _ = setup
    resp = await client.post("/api/v1/briefs/run", json={"company_id": str(company.id)})
    assert resp.status_code == 401


async def test_cannot_run_brief_for_other_company(client, factory):
    company_a = await factory.company(name="A")
    company_b = await factory.company(name="B")
    owner_a = await factory.user(company=company_a, role=UserRole.owner)
    resp = await client.post(
        "/api/v1/briefs/run",
        json={"company_id": str(company_b.id), "date": DAY.isoformat()},
        headers=auth(owner_a),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "forbidden"


async def test_run_then_list_returns_brief(client, setup):
    company, owner, _ = setup
    run = await client.post(
        "/api/v1/briefs/run",
        json={"company_id": str(company.id), "date": DAY.isoformat()},
        headers=auth(owner),
    )
    assert run.status_code == 200, run.text
    brief_id = run.json()["brief_id"]

    listed = await client.get(f"/api/v1/briefs?date={DAY.isoformat()}", headers=auth(owner))
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert "items" in body and "next_cursor" in body
    ids = {item["brief_id"] for item in body["items"]}
    assert brief_id in ids
    item = next(i for i in body["items"] if i["brief_id"] == brief_id)
    assert item["brief_date"] == DAY.isoformat()
    assert "text" in item and "payload" in item


async def test_list_scoped_to_company(client, factory):
    company_a = await factory.company(name="A")
    company_b = await factory.company(name="B")
    owner_a = await factory.user(company=company_a, role=UserRole.owner)
    owner_b = await factory.user(company=company_b, role=UserRole.owner)

    await client.post(
        "/api/v1/briefs/run",
        json={"company_id": str(company_a.id), "date": DAY.isoformat()},
        headers=auth(owner_a),
    )
    # owner_b lists their own company's briefs for that date -> empty
    listed = await client.get(f"/api/v1/briefs?date={DAY.isoformat()}", headers=auth(owner_b))
    assert listed.status_code == 200
    assert listed.json()["items"] == []


async def test_list_filters_by_date(client, setup):
    company, owner, _ = setup
    await client.post(
        "/api/v1/briefs/run",
        json={"company_id": str(company.id), "date": DAY.isoformat()},
        headers=auth(owner),
    )
    other = date(2026, 1, 1)
    listed = await client.get(f"/api/v1/briefs?date={other.isoformat()}", headers=auth(owner))
    assert listed.status_code == 200
    assert listed.json()["items"] == []
