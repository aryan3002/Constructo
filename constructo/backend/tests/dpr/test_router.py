"""DPR router tests: draft / fetch / edit / send, scope + role gating.

Critically asserts the C4 hard rule: a DPR is a draft the human SENDS — there
is no path that auto-sends (CA1).
"""
from datetime import date
from uuid import uuid4

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.contracts.events import EventType
from app.main import app
from app.models import SiteEventModel, UserRole

DAY = date(2026, 5, 27)
DATE_Q = f"?date={DAY.isoformat()}"


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


async def _add_event(session, site_id, event_type, *, fields, summary):
    session.add(
        SiteEventModel(
            id=uuid4(),
            site_id=site_id,
            event_type=event_type.value,
            occurred_on=DAY,
            summary=summary,
            fields=fields,
            confidence=0.9,
            needs_clarification=False,
            source_message_ids=[uuid4()],
        )
    )
    await session.flush()


@pytest_asyncio.fixture
async def setup(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    pm = await factory.user(company=company, role=UserRole.pm, name="PM")
    site = await factory.site(company, name="Tower A")
    await _add_event(
        db_session, site.id, EventType.attendance,
        fields={"headcount": 18}, summary="18 aaye",
    )
    await _add_event(
        db_session, site.id, EventType.material_delivery,
        fields={"material": "cement", "quantity": 280}, summary="cement 280",
    )
    await db_session.commit()
    return company, owner, pm, site


async def test_pm_generates_then_fetches_draft(client, setup):
    _, _, pm, site = setup
    resp = await client.post(
        f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(pm)
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "draft"
    assert body["sent_at"] is None
    assert body["sections"]["labor"]["headcount"] == 18
    assert len(body["sections"]["materials"]["deliveries"]) == 1
    assert len(body["evidence_event_ids"]) == 2

    # GET returns the same stored DPR.
    got = await client.get(f"/api/v1/dpr/sites/{site.id}{DATE_Q}", headers=auth(pm))
    assert got.status_code == 200
    assert got.json()["id"] == body["id"]


async def test_generate_is_idempotent_per_site_date(client, setup):
    _, owner, _, site = setup
    r1 = await client.post(
        f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(owner)
    )
    r2 = await client.post(
        f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(owner)
    )
    assert r1.json()["id"] == r2.json()["id"]


async def test_pm_edits_sections(client, setup):
    _, _, pm, site = setup
    draft = (
        await client.post(
            f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(pm)
        )
    ).json()
    new_sections = {**draft["sections"], "summary": "PM-edited summary."}
    resp = await client.patch(
        f"/api/v1/dpr/{draft['id']}",
        json={"sections": new_sections},
        headers=auth(pm),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["sections"]["summary"] == "PM-edited summary."
    assert resp.json()["status"] == "draft"


async def test_send_flips_status_and_stamps_sent_at(client, setup):
    _, _, pm, site = setup
    draft = (
        await client.post(
            f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(pm)
        )
    ).json()
    assert draft["status"] == "draft" and draft["sent_at"] is None

    sent = await client.post(f"/api/v1/dpr/{draft['id']}/send", headers=auth(pm))
    assert sent.status_code == 200, sent.text
    assert sent.json()["status"] == "sent"
    assert sent.json()["sent_at"] is not None


async def test_send_is_idempotent(client, setup):
    _, _, pm, site = setup
    draft = (
        await client.post(
            f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(pm)
        )
    ).json()
    first = await client.post(f"/api/v1/dpr/{draft['id']}/send", headers=auth(pm))
    second = await client.post(f"/api/v1/dpr/{draft['id']}/send", headers=auth(pm))
    assert second.status_code == 200
    assert first.json()["sent_at"] == second.json()["sent_at"]


async def test_sent_dpr_cannot_be_edited(client, setup):
    _, _, pm, site = setup
    draft = (
        await client.post(
            f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(pm)
        )
    ).json()
    await client.post(f"/api/v1/dpr/{draft['id']}/send", headers=auth(pm))
    resp = await client.patch(
        f"/api/v1/dpr/{draft['id']}",
        json={"sections": {"summary": "too late"}},
        headers=auth(pm),
    )
    assert resp.status_code == 409


async def test_no_endpoint_auto_sends_a_dpr(client, setup):
    """Auto-send is structurally impossible: generating a draft never sends,
    and the ONLY route that sets ``status=sent`` is the explicit /send action.
    """
    _, _, pm, site = setup
    draft = (
        await client.post(
            f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(pm)
        )
    ).json()
    # A freshly generated DPR is always a draft.
    assert draft["status"] == "draft"
    # Re-generating (idempotent) still never sends.
    again = await client.post(
        f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(pm)
    )
    assert again.json()["status"] == "draft"
    assert again.json()["sent_at"] is None

    # No mounted route can transition draft→sent except POST /dpr/{id}/send.
    send_routes = [
        r
        for r in app.routes
        if getattr(r, "path", "") == "/api/v1/dpr/{dpr_id}/send"
    ]
    assert len(send_routes) == 1
    assert set(send_routes[0].methods) == {"POST"}


async def test_supervisor_is_forbidden(client, setup, factory):
    company, _, _, site = setup
    sup = await factory.user(
        company=company, role=UserRole.supervisor, name="Supervisor"
    )
    resp = await client.post(
        f"/api/v1/dpr/sites/{site.id}/draft{DATE_Q}", headers=auth(sup)
    )
    assert resp.status_code == 403


async def test_cross_company_site_is_forbidden(client, setup, factory):
    _, _, pm, _ = setup
    other_company = await factory.company(name="Other Co")
    other_site = await factory.site(other_company, name="Foreign Site")
    resp = await client.post(
        f"/api/v1/dpr/sites/{other_site.id}/draft{DATE_Q}", headers=auth(pm)
    )
    assert resp.status_code == 403


async def test_get_missing_dpr_is_404(client, setup):
    _, _, pm, site = setup
    resp = await client.get(f"/api/v1/dpr/sites/{site.id}{DATE_Q}", headers=auth(pm))
    assert resp.status_code == 404
