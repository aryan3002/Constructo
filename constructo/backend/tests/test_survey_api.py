"""Survey package (Labs) — SiteSync first-visit intake.

Determinism: risk_score from per-risk weights and filled_pct from non-empty core
fields are pure Python; the LLM only drafts ai_analysis (FakeLLMClient).
"""
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import Site, UserRole
from app.survey.router import get_llm


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    return company, owner


async def _create(client, owner, **kw):
    payload = {"name": kw.pop("name", "Plot 14, Indira Nagar")}
    payload.update(kw)
    return await client.post("/api/v1/surveys", json=payload, headers=auth(owner))


async def test_create_list_get(client, world):
    _, owner = world
    resp = await _create(client, owner)
    assert resp.status_code == 201, resp.text
    survey = resp.json()
    assert survey["status"] == "draft"
    assert survey["site_id"] is None
    assert survey["created_by"] == str(owner.id)
    assert survey["risk_score"] is None

    listed = await client.get("/api/v1/surveys", headers=auth(owner))
    assert [s["id"] for s in listed.json()["items"]] == [survey["id"]]

    detail = await client.get(f"/api/v1/surveys/{survey['id']}", headers=auth(owner))
    assert detail.json()["name"] == "Plot 14, Indira Nagar"


async def test_company_scoping_isolation(client, factory, world):
    _, owner = world
    survey = (await _create(client, owner)).json()
    other = await factory.company(name="Rival")
    other_owner = await factory.user(company=other, role=UserRole.owner)
    resp = await client.get(f"/api/v1/surveys/{survey['id']}", headers=auth(other_owner))
    assert resp.status_code == 404


async def test_update_intake_fields(client, world):
    _, owner = world
    survey = (await _create(client, owner)).json()
    resp = await client.patch(
        f"/api/v1/surveys/{survey['id']}",
        json={"area": "2400 sqft", "client_name": "Sharma", "plot": {"no": "14", "corner": True}},
        headers=auth(owner),
    )
    body = resp.json()
    assert body["area"] == "2400 sqft"
    assert body["client_name"] == "Sharma"
    assert body["plot"] == {"no": "14", "corner": True}


async def test_analyze_risk_score_math_is_deterministic(client, world):
    _, owner = world
    survey = (
        await _create(
            client,
            owner,
            risks=[
                {"name": "Soil", "level": "High", "tone": "warn"},
                {"name": "Access", "level": "Low", "tone": "ok"},
            ],
        )
    ).json()
    canned = FakeLLMClient(canned={"analysis": "Soil risk dominates; plan piling."})
    app.dependency_overrides[get_llm] = lambda: canned
    try:
        resp = await client.post(f"/api/v1/surveys/{survey['id']}/analyze", headers=auth(owner))
    finally:
        app.dependency_overrides.pop(get_llm, None)
    body = resp.json()
    assert body["status"] == "submitted"
    assert body["submitted_at"] is not None
    # mean(High=60, Low=10) = 35
    assert body["risk_score"] == 35
    assert body["ai_analysis"] == "Soil risk dominates; plan piling."
    # filled_pct: only "risks" of 10 core fields is non-empty -> 10
    assert body["filled_pct"] == 10


async def test_analyze_empty_risks_yields_null_score(client, world):
    _, owner = world
    survey = (await _create(client, owner)).json()
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned={"analysis": "ok"})
    try:
        resp = await client.post(f"/api/v1/surveys/{survey['id']}/analyze", headers=auth(owner))
    finally:
        app.dependency_overrides.pop(get_llm, None)
    assert resp.json()["risk_score"] is None
    assert resp.json()["filled_pct"] == 0


async def test_analyze_filled_pct_counts_core_fields(client, world):
    _, owner = world
    survey = (
        await _create(
            client,
            owner,
            area="2400",
            client_name="Sharma",
            project_type="Residential",
            address="Indira Nagar",
            requirement="3BHK duplex",
        )
    ).json()
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned={"analysis": "ok"})
    try:
        resp = await client.post(f"/api/v1/surveys/{survey['id']}/analyze", headers=auth(owner))
    finally:
        app.dependency_overrides.pop(get_llm, None)
    # 5 of 10 core fields filled -> 50
    assert resp.json()["filled_pct"] == 50


async def test_onboard_creates_and_links_site(client, db_session, world):
    _, owner = world
    survey = (await _create(client, owner, name="Plot 22")).json()
    assert survey["site_id"] is None
    resp = await client.post(f"/api/v1/surveys/{survey['id']}/onboard", headers=auth(owner))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "onboarded"
    assert body["site_id"] is not None
    site = await db_session.get(Site, body["site_id"])
    assert site is not None
    assert site.name == "Plot 22"
    assert site.company_id == owner.company_id


async def test_onboard_keeps_existing_site(client, factory, world):
    company, owner = world
    site = await factory.site(company, name="Existing")
    survey = (await _create(client, owner, site_id=str(site.id))).json()
    resp = await client.post(f"/api/v1/surveys/{survey['id']}/onboard", headers=auth(owner))
    assert resp.json()["site_id"] == str(site.id)
    assert resp.json()["status"] == "onboarded"


async def test_onboard_is_owner_pm_gated(client, factory, world):
    company, _ = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    survey = (await _create(client, sup)).json()
    resp = await client.post(f"/api/v1/surveys/{survey['id']}/onboard", headers=auth(sup))
    assert resp.status_code == 403

    pm = await factory.user(company=company, role=UserRole.pm)
    survey2 = (await _create(client, pm)).json()
    resp2 = await client.post(f"/api/v1/surveys/{survey2['id']}/onboard", headers=auth(pm))
    assert resp2.status_code == 200


async def test_list_filters_by_status(client, world):
    _, owner = world
    s1 = (await _create(client, owner, name="Draft one")).json()
    s2 = (await _create(client, owner, name="To submit")).json()
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned={"analysis": "ok"})
    try:
        await client.post(f"/api/v1/surveys/{s2['id']}/analyze", headers=auth(owner))
    finally:
        app.dependency_overrides.pop(get_llm, None)
    drafts = await client.get("/api/v1/surveys?status=draft", headers=auth(owner))
    assert [s["id"] for s in drafts.json()["items"]] == [s1["id"]]
    submitted = await client.get("/api/v1/surveys?status=submitted", headers=auth(owner))
    assert [s["id"] for s in submitted.json()["items"]] == [s2["id"]]
