"""Contested-truth state machine (1.7) — raise / list / resolve / withdraw, the
authority rules, the append-only superseding resolution, and the chat card's
contested flag.
"""
from datetime import date
from uuid import uuid4

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import SiteEventModel, UserRole
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    sup = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company, name="Sunrise Heights")
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    event = SiteEventModel(
        site_id=site.id,
        event_type="attendance",
        occurred_on=date.today(),
        summary="12 mason",
        fields={"headcount": 12},
        confidence=1.0,
        needs_clarification=False,
        source_message_ids=[],
    )
    db_session.add(event)
    await db_session.flush()
    return company, owner, sup, site, event


async def test_supervisor_can_raise_and_list(client, world):
    _, _, sup, _, event = world
    resp = await client.post(
        f"/api/v1/events/{event.id}/disputes",
        json={"reason": "sirf 10 the", "proposed_fields": {"headcount": 10}},
        headers=auth(sup),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "open"
    listed = await client.get(f"/api/v1/events/{event.id}/disputes", headers=auth(sup))
    assert len(listed.json()) == 1
    assert listed.json()[0]["proposed_fields"] == {"headcount": 10}


async def test_unassigned_cannot_raise(client, factory, world):
    company, _, _, _, event = world
    other = await factory.user(company=company, role=UserRole.supervisor)  # unassigned
    resp = await client.post(
        f"/api/v1/events/{event.id}/disputes",
        json={"reason": "x"},
        headers=auth(other),
    )
    assert resp.status_code == 403


async def test_duplicate_open_dispute_rejected(client, world):
    _, _, sup, _, event = world
    body = {"reason": "again"}
    first = await client.post(f"/api/v1/events/{event.id}/disputes", json=body, headers=auth(sup))
    assert first.status_code == 201
    second = await client.post(f"/api/v1/events/{event.id}/disputes", json=body, headers=auth(sup))
    assert second.status_code == 409


async def test_resolve_requires_authority(client, world):
    _, owner, sup, _, event = world
    d = (
        await client.post(
            f"/api/v1/events/{event.id}/disputes", json={"reason": "10 the"}, headers=auth(sup)
        )
    ).json()
    # Supervisor cannot resolve.
    bad = await client.post(f"/api/v1/disputes/{d['id']}/resolve", json={}, headers=auth(sup))
    assert bad.status_code == 403
    # Owner can.
    ok = await client.post(f"/api/v1/disputes/{d['id']}/resolve", json={}, headers=auth(owner))
    assert ok.status_code == 200
    assert ok.json()["status"] == "resolved"


async def test_resolve_with_value_supersedes_append_only(client, db_session, world):
    _, owner, sup, site, event = world
    d = (
        await client.post(
            f"/api/v1/events/{event.id}/disputes",
            json={"reason": "10 the", "proposed_fields": {"headcount": 10}},
            headers=auth(sup),
        )
    ).json()
    resolved = await client.post(
        f"/api/v1/disputes/{d['id']}/resolve",
        json={"resolved_fields": {"headcount": 10}, "resolution_note": "both agreed at 10"},
        headers=auth(owner),
    )
    assert resolved.status_code == 200
    new_event_id = resolved.json()["resolved_event_id"]
    assert new_event_id is not None
    # The original is NOT mutated; a new superseding version exists.
    await db_session.refresh(event)
    assert event.fields == {"headcount": 12}
    superseding = await db_session.get(SiteEventModel, new_event_id)
    assert superseding.fields == {"headcount": 10}
    assert superseding.supersedes_event_id == event.id
    assert superseding.version == event.version + 1


async def test_withdraw_by_raiser_only(client, world):
    _, owner, sup, _, event = world
    d = (
        await client.post(
            f"/api/v1/events/{event.id}/disputes", json={"reason": "x"}, headers=auth(sup)
        )
    ).json()
    # Owner (not the raiser) cannot withdraw.
    assert (
        await client.post(f"/api/v1/disputes/{d['id']}/withdraw", headers=auth(owner))
    ).status_code == 403
    # The raiser can.
    ok = await client.post(f"/api/v1/disputes/{d['id']}/withdraw", headers=auth(sup))
    assert ok.status_code == 200
    assert ok.json()["status"] == "withdrawn"


async def test_chat_card_shows_contested(client, db_session, factory):
    """An open dispute marks the linked chat card contested; resolving clears it."""
    from contextlib import asynccontextmanager

    from app.extraction.llm import FakeLLMClient
    from app.extraction.worker import handle_ingested

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Site A")

    sent = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "12 mason",
            "capture_type": "attendance",
            "fields": {"headcount": 12},
        },
        headers=auth(owner),
    )
    from app.models import ChatMessage
    raw_id = (await db_session.get(ChatMessage, sent.json()["id"])).raw_message_id

    @asynccontextmanager
    async def factory_session():
        yield db_session

    ids = await handle_ingested(raw_id, session_factory=factory_session, llm=FakeLLMClient())
    event_id = ids[0]

    d = await client.post(
        f"/api/v1/events/{event_id}/disputes", json={"reason": "10 the"}, headers=auth(owner)
    )
    assert d.status_code == 201

    listed = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    ev = listed.json()[0]["events"][0]
    assert ev["contested"] is True

    await client.post(f"/api/v1/disputes/{d.json()['id']}/resolve", json={}, headers=auth(owner))
    listed2 = await client.get(f"/api/v1/chat/messages?site_id={site.id}", headers=auth(owner))
    assert listed2.json()[0]["events"][0]["contested"] is False
