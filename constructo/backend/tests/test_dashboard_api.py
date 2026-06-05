"""Owner Home API tests + brief-rendering integration (DB, no network).

Exercises the read-only ``/dashboard/home`` aggregation through the HTTP layer
and the ``/dashboard/decisions`` inline write path, and confirms the
exceptions-first brief generation (FakeLLM, network-free) agrees with the home
risk surface so the two stay coherent.
"""
from __future__ import annotations

from datetime import date

import pytest_asyncio
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.brief.generate import build_brief
from app.extraction.llm import FakeLLMClient
from app.models import Decision, Site, SiteBaseline, SiteEventModel, UserRole

DAY = date(2026, 5, 28)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _add_event(db_session, site_id, event_type, *, fields=None, on=DAY, confidence=0.95):
    ev = SiteEventModel(
        site_id=site_id,
        event_type=event_type,
        occurred_on=on,
        summary=f"{event_type}",
        fields=fields or {},
        confidence=confidence,
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


async def _site(db_session, company_id, name="Tower B"):
    site = Site(company_id=company_id, name=name)
    db_session.add(site)
    await db_session.flush()
    return site


async def test_home_requires_auth(client):
    resp = await client.get("/api/v1/dashboard/home")
    assert resp.status_code == 401


async def test_home_cold_start_for_owner_with_no_sites(client, owner):
    resp = await client.get(f"/api/v1/dashboard/home?date={DAY.isoformat()}", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["cold_start"] is True
    assert body["sites_total"] == 0
    assert body["needs_attention_count"] == 0
    assert {s["key"] for s in body["setup_checklist"]} == {
        "add_site",
        "connect_whatsapp",
        "set_baseline",
    }


async def test_home_surfaces_labor_shortfall_wired_to_baseline(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    db_session.add(SiteBaseline(site_id=site.id, expected_daily_headcount=10))
    await _add_event(db_session, site.id, "attendance", fields={"headcount": 3})

    resp = await client.get(f"/api/v1/dashboard/home?date={DAY.isoformat()}", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["cold_start"] is False
    assert body["needs_attention_count"] >= 1
    card = body["sites"][0]
    kinds = {r["kind"] for r in card["top_risks"]}
    assert "labor_shortfall" in kinds
    assert card["expected_headcount"] == 10
    labor_tile = next(t for t in card["pulse"] if t["kind"] == "labor")
    assert labor_tile["status"] in {"risk", "warn"}


async def test_home_risk_evidence_carries_event_summary(client, db_session, owner):
    """P1-12: each risk's evidence resolves to real proof rows (id + summary),
    not just a bare event UUID — so 'Show proof' can render '32 mazdoor aaye'
    instead of 'Event 48c24754'."""
    site = await _site(db_session, owner.company_id)
    db_session.add(SiteBaseline(site_id=site.id, expected_daily_headcount=10))
    ev = await _add_event(db_session, site.id, "attendance", fields={"headcount": 3})

    resp = await client.get(f"/api/v1/dashboard/home?date={DAY.isoformat()}", headers=auth(owner))
    card = resp.json()["sites"][0]
    risk = next(r for r in card["top_risks"] if r["kind"] == "labor_shortfall")
    # Back-compat ids still present...
    assert str(ev.id) in risk["evidence_event_ids"]
    # ...plus the resolved proof rows.
    proof = {p["id"]: p for p in risk["evidence"]}
    assert str(ev.id) in proof
    assert proof[str(ev.id)]["summary"] == "attendance"
    assert proof[str(ev.id)]["event_type"] == "attendance"
    assert proof[str(ev.id)]["occurred_on"] == DAY.isoformat()


async def test_home_scopes_to_company(client, db_session, factory, owner):
    # Another company's site must not leak into this owner's home.
    other_company = await factory.company(name="Other Co")
    other_site = await _site(db_session, other_company.id, name="Secret Site")
    await _add_event(db_session, other_site.id, "attendance", fields={"headcount": 1})

    mine = await _site(db_session, owner.company_id, name="My Site")
    await _add_event(db_session, mine.id, "attendance", fields={"headcount": 5})

    resp = await client.get(f"/api/v1/dashboard/home?date={DAY.isoformat()}", headers=auth(owner))
    names = {s["name"] for s in resp.json()["sites"]}
    assert names == {"My Site"}


async def test_create_decision_from_approve_chip(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    ev = await _add_event(db_session, site.id, "payment_request", fields={"amount": 20000})

    resp = await client.post(
        "/api/v1/dashboard/decisions",
        headers=auth(owner),
        json={
            "site_id": str(site.id),
            "action": "approve",
            "title": "Approve mason advance",
            "evidence_event_ids": [str(ev.id)],
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["kind"] == "approval"
    assert body["state"] == "pending"
    assert body["evidence_event_ids"] == [str(ev.id)]


async def test_create_decision_rejects_unknown_action(client, db_session, owner):
    site = await _site(db_session, owner.company_id)
    resp = await client.post(
        "/api/v1/dashboard/decisions",
        headers=auth(owner),
        json={"site_id": str(site.id), "action": "delete", "title": "x"},
    )
    assert resp.status_code == 422


async def test_create_decision_rejects_other_company_site(client, db_session, factory, owner):
    other = await factory.company(name="Other Co")
    other_site = await _site(db_session, other.id, name="Theirs")
    resp = await client.post(
        "/api/v1/dashboard/decisions",
        headers=auth(owner),
        json={"site_id": str(other_site.id), "action": "hold", "title": "x"},
    )
    assert resp.status_code == 404


async def _count_decisions(db_session, company_id) -> int:
    return (
        await db_session.execute(
            select(func.count()).select_from(Decision).where(
                Decision.company_id == company_id
            )
        )
    ).scalar_one()


async def test_create_decision_is_idempotent_on_client_decision_id(
    client, db_session, owner
):
    site = await _site(db_session, owner.company_id)
    payload = {
        "site_id": str(site.id),
        "action": "approve",
        "title": "Approve extra cement",
        "client_decision_id": "cd-abc-123",
    }

    first = await client.post(
        "/api/v1/dashboard/decisions", headers=auth(owner), json=payload
    )
    assert first.status_code == 201
    first_id = first.json()["id"]

    # A replay of the SAME client_decision_id reconciles to the existing row
    # (200), never creates a second decision.
    second = await client.post(
        "/api/v1/dashboard/decisions", headers=auth(owner), json=payload
    )
    assert second.status_code == 200
    assert second.json()["id"] == first_id
    assert await _count_decisions(db_session, owner.company_id) == 1


async def test_same_client_decision_id_isolated_per_company(
    client, db_session, factory, owner
):
    # The idempotency key is company-scoped: an identical key from another
    # company creates its own row (no cross-company collision).
    site = await _site(db_session, owner.company_id)
    await client.post(
        "/api/v1/dashboard/decisions",
        headers=auth(owner),
        json={
            "site_id": str(site.id),
            "action": "approve",
            "title": "Mine",
            "client_decision_id": "shared-key",
        },
    )

    other_company = await factory.company(name="Other Co")
    other_owner = await factory.user(company=other_company, role=UserRole.owner)
    resp = await client.post(
        "/api/v1/dashboard/decisions",
        headers=auth(other_owner),
        json={"action": "approve", "title": "Theirs", "client_decision_id": "shared-key"},
    )
    assert resp.status_code == 201
    assert await _count_decisions(db_session, owner.company_id) == 1
    assert await _count_decisions(db_session, other_company.id) == 1


async def test_create_decision_without_client_id_still_creates_each_time(
    client, db_session, owner
):
    # Keyless decisions (the bulk) are unaffected — two posts → two rows, even
    # with identical content (NULL keys are distinct).
    site = await _site(db_session, owner.company_id)
    payload = {"site_id": str(site.id), "action": "hold", "title": "Hold payment"}
    await client.post("/api/v1/dashboard/decisions", headers=auth(owner), json=payload)
    await client.post("/api/v1/dashboard/decisions", headers=auth(owner), json=payload)
    assert await _count_decisions(db_session, owner.company_id) == 2


async def test_brief_rendering_is_exceptions_first_and_network_free(db_session, factory):
    """The generated brief (FakeLLM) leads with the same risk the home shows."""
    company = await factory.company()
    site = await _site(db_session, company.id, name="Tower B")
    await _add_event(db_session, site.id, "attendance", fields={"headcount": 2})
    await _add_event(db_session, site.id, "invoice_received", fields={"vendor": "Shree"})

    fake = FakeLLMClient(canned={"text": "Subah ka brief: dekhiye exceptions."})
    result = await build_brief(db_session, company.id, DAY, llm=fake)

    payload = result["payload"]
    assert payload["sites"], "brief should include the active site"
    top = payload["sites"][0]["top_risks"]
    assert top, "brief leads with risks, not an activity dump"
    # unverified invoice (no matching delivery) must be among the exceptions
    assert any(r["kind"] == "unverified_invoice" for r in top)
    assert isinstance(result["text"], str) and result["text"].strip()
