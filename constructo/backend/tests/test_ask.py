"""Ask-the-Project (2.2) — grounded deterministic totals, scoping, abstain."""
from datetime import date

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import SiteEventModel, UserRole
from app.sites.models import SiteAssignment


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


def _event(site_id, etype, fields, conf=1.0, on=None):
    return SiteEventModel(
        site_id=site_id,
        event_type=etype,
        occurred_on=on or date.today(),
        summary=etype,
        fields=fields,
        confidence=conf,
        needs_clarification=False,
        source_message_ids=[],
    )


def _md(site_id, material, qty, unit="bori"):
    """A material_delivery event (keeps test lines short)."""
    fields = {"material": material, "quantity": qty, "unit": unit}
    return _event(site_id, "material_delivery", fields)


@pytest_asyncio.fixture
async def world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company, name="Sunrise")
    return company, owner, site


async def test_ask_totals_cement(client, db_session, world):
    _, owner, site = world
    db_session.add_all([
        _md(site.id, "cement", 50, "bori"),
        _md(site.id, "cement", 40, "bag"),
        _md(site.id, "steel", 2, "ton"),
    ])
    await db_session.flush()
    resp = await client.post(
        "/api/v1/ask", json={"question": "how much cement"}, headers=auth(owner)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["answerable"]
    assert body["total"] == 90  # bori + bag canonicalised
    assert body["unit"] == "bori"
    assert len(body["evidence_event_ids"]) == 2


async def test_ask_attendance(client, db_session, world):
    _, owner, site = world
    db_session.add_all([
        _event(site.id, "attendance", {"headcount": 20}),
        _event(site.id, "attendance", {"headcount": 12}),
    ])
    await db_session.flush()
    resp = await client.post(
        "/api/v1/ask", json={"question": "how many workers"}, headers=auth(owner)
    )
    assert resp.json()["total"] == 32


async def test_ask_surfaces_unconfirmed(client, db_session, world):
    _, owner, site = world
    db_session.add_all([
        _md(site.id, "cement", 50, "bori"),
        _md(site.id, "cement", None, "bori"),
    ])
    await db_session.flush()
    resp = await client.post(
        "/api/v1/ask", json={"question": "cement delivered"}, headers=auth(owner)
    )
    body = resp.json()
    assert body["total"] == 50
    assert body["unconfirmed"] == 1
    assert "not recorded" in body["answer"]


async def test_ask_abstains_on_unroutable_question(client, world):
    _, owner, _ = world
    resp = await client.post(
        "/api/v1/ask", json={"question": "what is the weather"}, headers=auth(owner)
    )
    assert resp.json()["answerable"] is False


async def test_ask_scoping_excludes_other_sites(client, db_session, factory, world):
    """A supervisor only sees their assigned site's totals (no cross-site leak)."""
    company, _, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    other = await factory.site(company, name="Other")
    db_session.add_all([
        _md(site.id, "cement", 50, "bori"),
        _md(other.id, "cement", 999, "bori"),
    ])
    await db_session.flush()
    resp = await client.post("/api/v1/ask", json={"question": "how much cement"}, headers=auth(sup))
    assert resp.json()["total"] == 50  # the other site's 999 is not visible
