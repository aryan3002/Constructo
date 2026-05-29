"""Site events read endpoint: happy path, permission scoping, pagination."""
from datetime import date

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import SiteEventModel, UserRole


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


async def _add_event(
    db_session, site_id, *, event_type="attendance", occurred_on=date(2026, 5, 28), summary="x"
):
    ev = SiteEventModel(
        site_id=site_id,
        event_type=event_type,
        occurred_on=occurred_on,
        summary=summary,
        fields={"headcount": 24},
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    db_session.add(ev)
    await db_session.flush()
    return ev


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


async def test_owner_lists_site_events(client, factory, db_session, owner):
    company_id = owner.company_id
    site = await factory.site(company=await _company(db_session, company_id))
    await _add_event(db_session, site.id, summary="24 mazdoor aaye")

    resp = await client.get(f"/api/v1/sites/{site.id}/events", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["event_type"] == "attendance"
    assert item["summary"] == "24 mazdoor aaye"
    assert item["fields"] == {"headcount": 24}
    assert "created_at" in item


async def test_events_filtered_by_date(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    await _add_event(db_session, site.id, occurred_on=date(2026, 5, 28), summary="today")
    await _add_event(db_session, site.id, occurred_on=date(2026, 5, 27), summary="yesterday")

    resp = await client.get(
        f"/api/v1/sites/{site.id}/events?date=2026-05-28", headers=auth(owner)
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["summary"] == "today"


async def test_supervisor_only_sees_assigned_site_events(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    assigned = await factory.site(company=company, name="Assigned")
    other = await factory.site(company=company, name="Other")
    await _add_event(db_session, assigned.id, summary="assigned ev")
    await _add_event(db_session, other.id, summary="other ev")

    sup = await factory.user(company=company, role=UserRole.supervisor)
    # not assigned yet -> forbidden on the assigned site too
    before = await client.get(f"/api/v1/sites/{assigned.id}/events", headers=auth(sup))
    assert before.status_code == 403

    await client.post(
        f"/api/v1/sites/{assigned.id}/assign",
        json={"user_id": str(sup.id)},
        headers=auth(owner),
    )

    ok = await client.get(f"/api/v1/sites/{assigned.id}/events", headers=auth(sup))
    assert ok.status_code == 200
    assert {i["summary"] for i in ok.json()["items"]} == {"assigned ev"}

    forbidden = await client.get(f"/api/v1/sites/{other.id}/events", headers=auth(sup))
    assert forbidden.status_code == 403


async def test_events_pagination(client, factory, db_session, owner):
    site = await factory.site(company=await _company(db_session, owner.company_id))
    for i in range(5):
        await _add_event(db_session, site.id, summary=f"ev{i}")

    page1 = await client.get(f"/api/v1/sites/{site.id}/events?limit=2", headers=auth(owner))
    b1 = page1.json()
    assert len(b1["items"]) == 2
    assert b1["next_cursor"] is not None

    seen = {i["id"] for i in b1["items"]}
    cursor = b1["next_cursor"]
    while cursor:
        p = await client.get(
            f"/api/v1/sites/{site.id}/events?limit=2&cursor={cursor}", headers=auth(owner)
        )
        pb = p.json()
        seen |= {i["id"] for i in pb["items"]}
        cursor = pb["next_cursor"]
    assert len(seen) == 5


async def test_events_missing_site_is_404(client, owner):
    from uuid import uuid4

    resp = await client.get(f"/api/v1/sites/{uuid4()}/events", headers=auth(owner))
    assert resp.status_code == 404


async def _company(db_session, company_id):
    """Load the Company row for a known id (factory.site needs a Company obj)."""
    from app.models import Company

    return await db_session.get(Company, company_id)
