"""Action Items — Phase 1.6 (chat → tracked to-do, audit-logged)."""

import pytest_asyncio
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.models import ActionItem, ActionItemEvent, UserRole
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise Heights")
    return company, owner, site


async def _create(client, owner, site, **kw):
    payload = {"site_id": str(site.id), "title": kw.pop("title", "Order cement")}
    payload.update(kw)
    return await client.post("/api/v1/action-items", json=payload, headers=auth(owner))


async def test_create_logs_created_event(client, db_session, world):
    _, owner, site = world
    resp = await _create(client, owner, site)
    assert resp.status_code == 201, resp.text
    item = resp.json()
    assert item["status"] == "open"
    assert item["created_by"] == str(owner.id)
    assert item["created_by_ai"] is False
    events = (
        await db_session.execute(
            select(ActionItemEvent).where(ActionItemEvent.action_item_id == item["id"])
        )
    ).scalars().all()
    assert [e.kind.value for e in events] == ["created"]


async def test_create_with_assignee_logs_assigned(client, db_session, factory, world):
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    resp = await _create(client, owner, site, assignee_id=str(sup.id), due_on="2026-06-20")
    item = resp.json()
    assert item["assignee_id"] == str(sup.id)
    assert item["due_on"] == "2026-06-20"
    kinds = {
        e.kind.value
        for e in (
            await db_session.execute(
                select(ActionItemEvent).where(ActionItemEvent.action_item_id == item["id"])
            )
        ).scalars()
    }
    assert kinds == {"created", "assigned"}


async def test_complete_and_reopen(client, db_session, world):
    _, owner, site = world
    item = (await _create(client, owner, site)).json()
    done = await client.patch(
        f"/api/v1/action-items/{item['id']}", json={"status": "done"}, headers=auth(owner)
    )
    assert done.json()["status"] == "done"
    assert done.json()["completed_at"] is not None
    reopened = await client.patch(
        f"/api/v1/action-items/{item['id']}", json={"status": "open"}, headers=auth(owner)
    )
    assert reopened.json()["status"] == "open"
    assert reopened.json()["completed_at"] is None
    kinds = [
        e.kind.value
        for e in (
            await db_session.execute(
                select(ActionItemEvent)
                .where(ActionItemEvent.action_item_id == item["id"])
                .order_by(ActionItemEvent.created_at)
            )
        ).scalars()
    ]
    assert kinds == ["created", "completed", "reopened"]


async def test_edit_title_logs_edited(client, db_session, world):
    _, owner, site = world
    item = (await _create(client, owner, site)).json()
    resp = await client.patch(
        f"/api/v1/action-items/{item['id']}",
        json={"title": "Order 200 bori cement"},
        headers=auth(owner),
    )
    assert resp.json()["title"] == "Order 200 bori cement"
    kinds = {
        e.kind.value
        for e in (
            await db_session.execute(
                select(ActionItemEvent).where(ActionItemEvent.action_item_id == item["id"])
            )
        ).scalars()
    }
    assert "edited" in kinds


async def test_delete_soft_cancels_and_keeps_audit(client, db_session, world):
    _, owner, site = world
    item = (await _create(client, owner, site)).json()
    resp = await client.delete(f"/api/v1/action-items/{item['id']}", headers=auth(owner))
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"
    # The row + its audit trail survive (a task's history is never lost).
    assert await db_session.get(ActionItem, item["id"]) is not None
    n = await db_session.scalar(
        select(func.count()).select_from(ActionItemEvent).where(
            ActionItemEvent.action_item_id == item["id"]
        )
    )
    assert n == 2  # created + deleted


async def test_get_returns_audit_log(client, world):
    _, owner, site = world
    item = (await _create(client, owner, site)).json()
    await client.patch(
        f"/api/v1/action-items/{item['id']}", json={"status": "done"}, headers=auth(owner)
    )
    resp = await client.get(f"/api/v1/action-items/{item['id']}", headers=auth(owner))
    log_kinds = [e["kind"] for e in resp.json()["log"]]
    assert log_kinds == ["created", "completed"]


async def test_list_and_mine_filter(client, db_session, factory, world):
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    await _create(client, owner, site, title="unassigned")
    await _create(client, owner, site, title="for sup", assignee_id=str(sup.id))
    all_items = await client.get(
        f"/api/v1/action-items?site_id={site.id}", headers=auth(owner)
    )
    assert len(all_items.json()) == 2
    mine = await client.get(
        f"/api/v1/action-items?site_id={site.id}&mine=true", headers=auth(owner)
    )
    assert mine.json() == []  # owner has none assigned to them


async def test_scoping_unassigned_and_homeowner_forbidden(client, db_session, factory, world):
    company, _, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)  # not assigned
    resp = await _create(client, sup, site)
    assert resp.status_code == 403

    ho = await factory.user(company=company, role=UserRole.homeowner)
    resp2 = await _create(client, ho, site)
    assert resp2.status_code == 403


async def test_assigned_supervisor_can_create(client, db_session, factory, world):
    company, _, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    resp = await _create(client, sup, site)
    assert resp.status_code == 201
