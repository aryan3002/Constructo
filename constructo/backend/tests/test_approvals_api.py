"""Approval Inbox API tests (auth'd, company-scoped, idempotent)."""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import UserRole
from app.notifications import store


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(autouse=True)
async def _clean_store():
    store.reset()
    yield
    store.reset()


@pytest_asyncio.fixture
async def owner(factory):
    company = await factory.company()
    return await factory.user(company=company, role=UserRole.owner)


async def test_create_and_list_decision(client, owner):
    resp = await client.post(
        "/api/v1/approvals",
        json={"title": "Approve extra cement order", "kind": "approval"},
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    created = resp.json()
    assert created["state"] == "pending"

    listed = await client.get("/api/v1/approvals", headers=auth(owner))
    assert listed.status_code == 200
    ids = [d["id"] for d in listed.json()["items"]]
    assert created["id"] in ids


async def test_approve_resolves_and_is_idempotent(client, owner):
    created = (
        await client.post(
            "/api/v1/approvals",
            json={"title": "Approve PO #12"},
            headers=auth(owner),
        )
    ).json()
    did = created["id"]

    r1 = await client.post(
        f"/api/v1/approvals/{did}/approve",
        json={"note": "ok"},
        headers=auth(owner),
    )
    assert r1.status_code == 200
    assert r1.json()["state"] == "resolved"
    assert r1.json()["resolved_at"] is not None

    # Idempotent: approving again is a no-op 200 (one ledger).
    r2 = await client.post(f"/api/v1/approvals/{did}/approve", headers=auth(owner))
    assert r2.status_code == 200
    assert r2.json()["state"] == "resolved"


async def test_reject_after_resolve_is_conflict(client, owner):
    created = (
        await client.post(
            "/api/v1/approvals", json={"title": "X"}, headers=auth(owner)
        )
    ).json()
    did = created["id"]
    await client.post(f"/api/v1/approvals/{did}/approve", headers=auth(owner))
    resp = await client.post(f"/api/v1/approvals/{did}/reject", headers=auth(owner))
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "invalid_transition"


async def test_decision_scoped_to_company(client, factory, owner):
    created = (
        await client.post(
            "/api/v1/approvals", json={"title": "Secret"}, headers=auth(owner)
        )
    ).json()
    other = await factory.user(role=UserRole.owner)  # different company
    resp = await client.get(f"/api/v1/approvals/{created['id']}", headers=auth(other))
    assert resp.status_code == 404


async def test_batch_approve(client, owner):
    ids = []
    for i in range(3):
        d = (
            await client.post(
                "/api/v1/approvals", json={"title": f"PO {i}"}, headers=auth(owner)
            )
        ).json()
        ids.append(d["id"])

    resp = await client.post(
        "/api/v1/approvals/batch/resolve",
        json={"ids": ids, "note": "bulk ok"},
        headers=auth(owner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body["updated"]) == set(ids)
    assert body["skipped"] == []


async def test_assign_decision(client, db_session, factory, owner):
    from app.models import Company

    company = await db_session.get(Company, owner.company_id)
    pm = await factory.user(company=company, role=UserRole.pm)
    created = (
        await client.post(
            "/api/v1/approvals", json={"title": "Route to PM"}, headers=auth(owner)
        )
    ).json()
    resp = await client.post(
        f"/api/v1/approvals/{created['id']}/assign",
        json={"assigned_to": str(pm.id)},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    assert resp.json()["assigned_to"] == str(pm.id)


async def test_sla_sweep_endpoint(client, db_session, factory, owner):
    from datetime import UTC, datetime, timedelta

    from app.models import Company, Decision, DecisionKind, DecisionState

    company = await db_session.get(Company, owner.company_id)
    site = await factory.site(company)
    d = Decision(
        company_id=owner.company_id,
        site_id=site.id,
        kind=DecisionKind.homeowner_question,
        title="When is handover?",
        assigned_to=owner.id,
        state=DecisionState.pending,
        sla_due_at=datetime.now(UTC) - timedelta(hours=1),
    )
    db_session.add(d)
    await db_session.flush()

    resp = await client.post("/api/v1/approvals/sla/sweep", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    assert str(d.id) in resp.json()["escalated"]
