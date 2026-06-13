"""Homeowner intake access: by-site lookup + homeowner-contributor ranking."""
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, UserRole
from app.profiler.extraction import get_llm
from tests.test_profiler_api import auth


def _llm() -> FakeLLMClient:
    return FakeLLMClient(canned={"colors": ["warm"], "style": "minimal", "confidence": 0.9})


async def _profile_with_homeowner_contributor(client, factory, db_session):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    owner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=owner.id,
        sub_role=HomeownerSubRole.primary_owner, status=MemberStatus.active))
    await db_session.flush()
    created = await client.post("/api/v1/design/profiles", json={
        "site_id": str(site.id),
        "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 2}],
        "contributors": [{"role": "owner", "user_id": str(owner.id), "is_decision_owner": True}],
    }, headers=auth(architect))
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    area_id = detail["areas"][0]["id"]
    contrib_id = detail["contributors"][0]["id"]
    return architect, owner, site, pid, area_id, contrib_id


async def test_get_profile_by_site_resolves_for_member_and_404s_for_stranger(
    client, factory, db_session
):
    app.dependency_overrides[get_llm] = _llm
    try:
        architect, owner, site, pid, _area, _c = await _profile_with_homeowner_contributor(
            client, factory, db_session)
        got = await client.get(f"/api/v1/design/profiles/by-site/{site.id}", headers=auth(owner))
        assert got.status_code == 200 and got.json()["id"] == pid
        other = await factory.user(role=UserRole.architect)
        assert (await client.get(
            f"/api/v1/design/profiles/by-site/{site.id}", headers=auth(other))).status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_homeowner_can_add_reference_and_rank_as_self(client, factory, db_session):
    app.dependency_overrides[get_llm] = _llm
    try:
        architect, owner, site, pid, area_id, contrib_id = (
            await _profile_with_homeowner_contributor(client, factory, db_session)
        )
        ref = await client.post("/api/v1/design/references", json={
            "area_id": area_id, "contributor_id": contrib_id, "source_type": "upload",
            "source_url": "https://x.test/insp.jpg"}, headers=auth(owner))
        assert ref.status_code == 201
        rid = ref.json()["id"]
        rk = await client.post(f"/api/v1/design/references/{rid}/rankings",
            json={"contributor_id": contrib_id, "stars": 5}, headers=auth(owner))
        assert rk.status_code == 201
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_homeowner_cannot_rank_as_another_contributor(client, factory, db_session):
    app.dependency_overrides[get_llm] = _llm
    try:
        architect, owner, site, pid, area_id, contrib_id = (
            await _profile_with_homeowner_contributor(client, factory, db_session)
        )
        other_c = (await client.post(f"/api/v1/design/profiles/{pid}/contributors",
            json={"role": "family"}, headers=auth(architect))).json()["id"]
        ref = await client.post("/api/v1/design/references", json={
            "area_id": area_id, "source_type": "upload", "source_url": "https://x.test/a.jpg"},
            headers=auth(owner))
        rid = ref.json()["id"]
        bad = await client.post(f"/api/v1/design/references/{rid}/rankings",
            json={"contributor_id": other_c, "stars": 1}, headers=auth(owner))
        assert bad.status_code == 403
        assert bad.json()["error"]["code"] == "not_your_contributor"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_ranking_unknown_contributor_is_404(client, factory, db_session):
    from uuid import uuid4
    app.dependency_overrides[get_llm] = _llm
    try:
        architect, owner, site, pid, area_id, contrib_id = (
            await _profile_with_homeowner_contributor(client, factory, db_session)
        )
        ref = await client.post("/api/v1/design/references", json={
            "area_id": area_id, "source_type": "upload", "source_url": "https://x.test/a.jpg"},
            headers=auth(architect))
        rid = ref.json()["id"]
        bad = await client.post(f"/api/v1/design/references/{rid}/rankings",
            json={"contributor_id": str(uuid4()), "stars": 3}, headers=auth(architect))
        assert bad.status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)
