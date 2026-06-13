"""Profiler -> Spec engine bridge: pure deterministic planning (no LLM, no DB)."""
from app.main import app
from app.models import (
    Component,
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    Space,
    SpaceKind,
    UserRole,
)
from app.profiler.bridge import bridge_id, plan_proposals
from app.profiler.extraction import get_llm
from tests.test_profiler_api import auth
from tests.test_profiler_brief import _brief_llm


def test_plan_proposals_enumerates_one_per_area_material_family():
    payload = {"areas": [
        {"area_key": "kitchen", "material_families": ["light oak", "quartz"]},
        {"area_key": "bath", "material_families": []},
    ]}
    out = plan_proposals(payload)
    assert out == [
        {"area_key": "kitchen", "material_name": "light oak", "label": "light oak"},
        {"area_key": "kitchen", "material_name": "quartz", "label": "quartz"},
    ]
    assert plan_proposals({}) == []
    assert plan_proposals({"areas": []}) == []


def test_bridge_id_is_deterministic_and_distinct():
    a = bridge_id("material", "c1", "oak")
    assert a == bridge_id("material", "c1", "oak")  # stable across calls
    assert bridge_id("material", "c1", "teak") != a  # distinct inputs -> distinct id
    assert bridge_id("spec", "c1", "oak") != a       # namespace prefix matters


async def _shared_brief_with_component(client, factory, db_session, *, with_component=True):
    """Build a profile whose kitchen area is (optionally) bound to a real Component,
    approve a theme so 'light oak' flows into the brief, generate it, and drive it
    to contractor_brief_ready. Returns (architect, site, pid, bid, comp_id|None)."""
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    comp_id = None
    area_payload = {"area_kind": "interior", "area_key": "kitchen", "recommended_count": 1}
    if with_component:
        space = Space(site_id=site.id, name="Kitchen", kind=SpaceKind.room)
        db_session.add(space)
        await db_session.flush()
        comp = Component(space_id=space.id, name="Cabinets")
        db_session.add(comp)
        await db_session.flush()
        comp_id = comp.id
        area_payload["component_id"] = str(comp.id)

    created = await client.post("/api/v1/design/profiles", json={
        "site_id": str(site.id), "areas": [area_payload],
        "contributors": [{"role": "co_owner", "is_decision_owner": True}],
    }, headers=auth(architect))
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    area_id = detail["areas"][0]["id"]
    contrib_id = detail["contributors"][0]["id"]

    r = await client.post("/api/v1/design/references", json={
        "area_id": area_id, "source_type": "upload", "source_url": "https://x.test/a.jpg",
    }, headers=auth(architect))
    await client.post(f"/api/v1/design/references/{r.json()['id']}/rankings",
        json={"contributor_id": contrib_id, "stars": 5}, headers=auth(architect))
    await client.post(f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes",
        headers=auth(architect))
    themes = (await client.get(
        f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes",
        headers=auth(architect))).json()
    await client.post(f"/api/v1/design/themes/{themes[0]['id']}/decision",
        json={"action": "approve"}, headers=auth(architect))
    bid = (await client.post(
        f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))).json()["id"]

    owner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=owner.id,
        sub_role=HomeownerSubRole.primary_owner, status=MemberStatus.active))
    await db_session.flush()
    await client.post(f"/api/v1/design/briefs/{bid}/approval",
        json={"action": "send_to_architect"}, headers=auth(owner))
    await client.post(f"/api/v1/design/briefs/{bid}/approval",
        json={"action": "architect_sign_off"}, headers=auth(architect))
    return architect, site, pid, bid, comp_id


async def test_materialize_creates_pending_specs_and_is_idempotent(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, site, pid, bid, comp_id = await _shared_brief_with_component(
            client, factory, db_session)
        mat = await client.post(f"/api/v1/design/briefs/{bid}/materialize",
            headers=auth(architect))
        assert mat.status_code == 201
        body = mat.json()
        assert body["materials_created"] >= 1
        assert body["specs_created"] >= 1
        assert body["skipped_areas"] == []
        spec = next(s for s in body["specs"] if s["label"] == "light oak")
        assert spec["approval_status"] == "pending"
        assert spec["component_id"] == str(comp_id)
        assert spec["qty"] is None and spec["unit_rate"] is None  # never fabricated
        again = (await client.post(
            f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))).json()
        assert again["specs_created"] == 0 and again["materials_created"] == 0
        assert again["specs_reused"] >= 1
        specs = (await client.get(
            f"/api/v1/specs?site_id={site.id}", headers=auth(architect))).json()
        assert any(
            s["label"] == "light oak" and s["approval_status"] == "pending" for s in specs
        )
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_materialize_skips_areas_without_a_component(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, site, pid, bid, _ = await _shared_brief_with_component(
            client, factory, db_session, with_component=False)
        body = (await client.post(
            f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))).json()
        assert body["materials_created"] >= 1
        assert body["specs_created"] == 0
        assert "kitchen" in body["skipped_areas"]
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_materialize_rejects_unshared_brief(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        created = await client.post("/api/v1/design/profiles", json={
            "site_id": str(site.id),
            "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 1}],
            "contributors": [{"role": "co_owner"}]}, headers=auth(architect))
        pid = created.json()["id"]
        bid = (await client.post(
            f"/api/v1/design/profiles/{pid}/brief",
            headers=auth(architect))).json()["id"]
        resp = await client.post(
            f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "brief_not_ready"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_contractor_trigger_to_materialize_e2e(client, factory, db_session):
    """The full contractor seam: POST /profiles (the 'Build Design Profile' trigger)
    -> rank -> approve theme -> brief -> homeowner+architect sign-off -> materialize
    -> a pending Spec lands in the Spec engine ready for human confirmation."""
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, site, pid, bid, comp_id = await _shared_brief_with_component(
            client, factory, db_session)
        assert pid and bid and comp_id  # the trigger created a usable profile
        body = (await client.post(
            f"/api/v1/design/briefs/{bid}/materialize", headers=auth(architect))).json()
        assert body["specs_created"] >= 1
        spec_id = body["specs"][0]["id"]
        approved = await client.post(f"/api/v1/specs/{spec_id}/approve",
            json={"status": "approved"}, headers=auth(architect))
        assert approved.status_code == 200 and approved.json()["approval_status"] == "approved"
    finally:
        app.dependency_overrides.pop(get_llm, None)
