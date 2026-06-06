"""The agent turn (2.1) — terminal-tool result, scoping, audit row."""
from datetime import date

import pytest_asyncio
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.models import AgentTurn, SiteEventModel, UserRole


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


async def test_question_returns_answer_and_audits(client, db_session, world):
    company, owner, site = world
    db_session.add_all([
        _ev(site.id, "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        _ev(site.id, "material_delivery", {"material": "cement", "quantity": 40, "unit": "bag"}),
    ])
    await db_session.flush()
    resp = await client.post(
        "/api/v1/agent/turn", json={"utterance": "how much cement"}, headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["kind"] == "answer"
    assert body["total"] == 90
    assert body["tool"] == "aggregate"
    assert len(body["evidence_event_ids"]) == 2
    # Exactly one audit row was written.
    n = await db_session.scalar(
        select(func.count()).select_from(AgentTurn).where(AgentTurn.company_id == company.id)
    )
    assert n == 1


async def test_ungroundable_returns_clarify_never_prose(client, world):
    _, owner, _ = world
    resp = await client.post(
        "/api/v1/agent/turn", json={"utterance": "tell me a joke"}, headers=auth(owner)
    )
    assert resp.json()["kind"] == "clarify"


async def test_scoping_excludes_other_sites(client, db_session, factory, world):
    company, _, site = world
    from app.sites.models import SiteAssignment

    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    other = await factory.site(company, name="Other")
    db_session.add_all([
        _ev(site.id, "material_delivery", {"material": "cement", "quantity": 50, "unit": "bori"}),
        _ev(other.id, "material_delivery", {"material": "cement", "quantity": 999, "unit": "bori"}),
    ])
    await db_session.flush()
    resp = await client.post(
        "/api/v1/agent/turn", json={"utterance": "how much cement"}, headers=auth(sup)
    )
    assert resp.json()["total"] == 50  # the other site's 999 never leaks
