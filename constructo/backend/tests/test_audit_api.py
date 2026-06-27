"""Audit package (Labs) — AI-assisted site quality inspection.

Determinism: section scores and the finalized overall score are pure Python from
counts; the LLM only drafts a finding note (FakeLLMClient — no network).
"""
import pytest_asyncio

from app.audit.router import get_llm
from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import UserRole
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
    payload = {
        "site_id": str(site.id),
        "sections": kw.pop("sections", ["Civil", "Finishing"]),
    }
    payload.update(kw)
    return await client.post("/api/v1/audits", json=payload, headers=auth(owner))


async def test_add_finding_is_idempotent_on_title_location(client, world):
    # A retry / double-tap of the same defect must not create a duplicate
    # owner-visible finding.
    _company, owner, site = world
    audit = (await _create(client, owner, site)).json()
    body = {"title": "Cracked tile", "severity": "major", "location": "Kitchen"}

    f1 = await client.post(
        f"/api/v1/audits/{audit['id']}/findings", json=body, headers=auth(owner)
    )
    f2 = await client.post(
        f"/api/v1/audits/{audit['id']}/findings", json=body, headers=auth(owner)
    )
    assert f1.status_code == 201 and f2.status_code == 201
    assert f1.json()["id"] == f2.json()["id"]  # reused, not duplicated

    detail = (await client.get(f"/api/v1/audits/{audit['id']}", headers=auth(owner))).json()
    assert sum(1 for x in detail["findings"] if x["title"] == "Cracked tile") == 1


async def test_create_list_get(client, world):
    _, owner, site = world
    resp = await _create(client, owner, site)
    assert resp.status_code == 201, resp.text
    audit = resp.json()
    assert audit["status"] == "requested"
    assert audit["score"] is None
    assert audit["requested_by"] == str(owner.id)
    assert audit["scheduled_for"] == "today"

    listed = await client.get("/api/v1/audits", headers=auth(owner))
    assert listed.status_code == 200
    assert [a["id"] for a in listed.json()["items"]] == [audit["id"]]

    detail = await client.get(f"/api/v1/audits/{audit['id']}", headers=auth(owner))
    body = detail.json()
    assert [s["name"] for s in body["sections"]] == ["Civil", "Finishing"]
    assert [s["position"] for s in body["sections"]] == [0, 1]
    assert body["findings"] == []


async def test_company_scoping_isolation(client, factory, world):
    _, owner, site = world
    audit = (await _create(client, owner, site)).json()

    other_company = await factory.company(name="Rival Builders")
    other_owner = await factory.user(company=other_company, role=UserRole.owner)
    resp = await client.get(f"/api/v1/audits/{audit['id']}", headers=auth(other_owner))
    assert resp.status_code == 404


async def test_site_visibility_403_for_unassigned_nonowner(client, factory, world):
    company, owner, site = world
    audit = (await _create(client, owner, site)).json()
    sup = await factory.user(company=company, role=UserRole.supervisor)  # not assigned
    resp = await client.get(f"/api/v1/audits/{audit['id']}", headers=auth(sup))
    assert resp.status_code == 403


async def test_assigned_supervisor_can_see(client, db_session, factory, world):
    company, owner, site = world
    audit = (await _create(client, owner, site)).json()
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    resp = await client.get(f"/api/v1/audits/{audit['id']}", headers=auth(sup))
    assert resp.status_code == 200


async def test_section_score_math_is_deterministic(client, world):
    _, owner, site = world
    audit = (await _create(client, owner, site)).json()
    # 2 ok, 1 obs, 1 fail -> 100*(2 + 0.5)/4 = 62.5 -> round = 62
    resp = await client.post(
        f"/api/v1/audits/{audit['id']}/sections",
        json={
            "name": "Civil",
            "items": [
                {"label": "Footing", "status": "ok"},
                {"label": "Column", "status": "ok"},
                {"label": "Beam", "status": "obs"},
                {"label": "Slab", "status": "fail"},
            ],
        },
        headers=auth(owner),
    )
    sec = resp.json()
    assert sec["pass_count"] == 2
    assert sec["obs_count"] == 1
    assert sec["fail_count"] == 1
    assert sec["score"] == 62

    # Upsert matches by name (no duplicate section created).
    resp2 = await client.post(
        f"/api/v1/audits/{audit['id']}/sections",
        json={"name": "Civil", "items": [{"label": "Footing", "status": "ok"}]},
        headers=auth(owner),
    )
    assert resp2.json()["score"] == 100
    detail = await client.get(f"/api/v1/audits/{audit['id']}", headers=auth(owner))
    civil = [s for s in detail.json()["sections"] if s["name"] == "Civil"]
    assert len(civil) == 1


async def test_empty_section_score_is_null(client, world):
    _, owner, site = world
    audit = (await _create(client, owner, site)).json()
    resp = await client.post(
        f"/api/v1/audits/{audit['id']}/sections",
        json={"name": "Civil", "items": []},
        headers=auth(owner),
    )
    assert resp.json()["score"] is None


async def test_finalize_score_is_deterministic_weighted_mean(client, world):
    _, owner, site = world
    audit = (await _create(client, owner, site)).json()
    # Civil: all ok -> 100
    await client.post(
        f"/api/v1/audits/{audit['id']}/sections",
        json={"name": "Civil", "items": [{"label": "a", "status": "ok"}]},
        headers=auth(owner),
    )
    # Finishing: 1 ok, 1 fail -> 50
    await client.post(
        f"/api/v1/audits/{audit['id']}/sections",
        json={
            "name": "Finishing",
            "items": [
                {"label": "b", "status": "ok"},
                {"label": "c", "status": "fail"},
            ],
        },
        headers=auth(owner),
    )
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient()
    try:
        resp = await client.post(f"/api/v1/audits/{audit['id']}/score", headers=auth(owner))
    finally:
        app.dependency_overrides.pop(get_llm, None)
    body = resp.json()
    assert body["status"] == "completed"
    assert body["conducted_at"] is not None
    # mean(100, 50) = 75
    assert body["score"] == 75


async def test_finalize_with_no_scored_sections_keeps_null(client, world):
    _, owner, site = world
    audit = (await _create(client, owner, site)).json()
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient()
    try:
        resp = await client.post(f"/api/v1/audits/{audit['id']}/score", headers=auth(owner))
    finally:
        app.dependency_overrides.pop(get_llm, None)
    assert resp.json()["score"] is None
    assert resp.json()["status"] == "completed"


async def test_finalize_drafts_note_for_noteless_finding(client, world):
    _, owner, site = world
    audit = (await _create(client, owner, site)).json()
    # finding without a note
    f1 = await client.post(
        f"/api/v1/audits/{audit['id']}/findings",
        json={"title": "Honeycomb in column", "severity": "major"},
        headers=auth(owner),
    )
    # finding WITH a note (must be preserved)
    f2 = await client.post(
        f"/api/v1/audits/{audit['id']}/findings",
        json={"title": "Crack", "severity": "minor", "note": "keep me"},
        headers=auth(owner),
    )
    canned = FakeLLMClient(canned={"note": "Patch and re-inspect."})
    app.dependency_overrides[get_llm] = lambda: canned
    try:
        await client.post(f"/api/v1/audits/{audit['id']}/score", headers=auth(owner))
    finally:
        app.dependency_overrides.pop(get_llm, None)
    detail = (await client.get(f"/api/v1/audits/{audit['id']}", headers=auth(owner))).json()
    by_id = {f["id"]: f for f in detail["findings"]}
    assert by_id[f1.json()["id"]]["note"] == "Patch and re-inspect."
    assert by_id[f2.json()["id"]]["note"] == "keep me"


async def test_finding_assignment(client, factory, world):
    company, owner, site = world
    audit = (await _create(client, owner, site)).json()
    sup = await factory.user(company=company, role=UserRole.supervisor)
    finding = (
        await client.post(
            f"/api/v1/audits/{audit['id']}/findings",
            json={"title": "Loose railing", "severity": "critical"},
            headers=auth(owner),
        )
    ).json()
    assert finding["status"] == "open"

    resp = await client.patch(
        f"/api/v1/audits/findings/{finding['id']}",
        json={"status": "assigned", "assignee_id": str(sup.id)},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "assigned"
    assert resp.json()["assignee_id"] == str(sup.id)

    resolved = await client.patch(
        f"/api/v1/audits/findings/{finding['id']}",
        json={"status": "resolved", "note": "fixed"},
        headers=auth(owner),
    )
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["note"] == "fixed"


async def test_patch_audit_status(client, world):
    _, owner, site = world
    audit = (await _create(client, owner, site)).json()
    resp = await client.patch(
        f"/api/v1/audits/{audit['id']}",
        json={"status": "in_progress"},
        headers=auth(owner),
    )
    assert resp.json()["status"] == "in_progress"
