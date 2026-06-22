"""The membrane matrix — the most important Plan 3b tests.

Proves: homeowner owner approves; family/advisor are refused with a comment box;
the architect signs off; the contractor sees ONLY the contractor rendering of a
SHARED brief; a different-company user and a different-site homeowner get 404.

AppError envelope shape: {"error": {"code", "message", <extra merged in>}}.
"""
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, UserRole
from app.profiler.extraction import get_llm
from tests.test_profiler_api import auth


def _brief_llm() -> FakeLLMClient:
    return FakeLLMClient(canned={
        "headline": "h", "summary": "s", "sections": [],
        "themes": [
            {"name": "T", "palette": ["beige"], "materials": ["light oak"], "rationale": "r"},
        ],
        "questions": ["q?"], "colors": ["dark"], "style": "minimal", "confidence": 0.9,
    })


async def _member(db_session, site_id, user_id, sub_role):
    db_session.add(HomeownerMember(
        site_id=site_id, user_id=user_id, sub_role=sub_role, status=MemberStatus.active))
    await db_session.flush()


async def _world(client, factory, db_session):
    """A company with an architect (contractor-side), a site, a generated brief in
    homeowner_review, plus owner/co_owner/family/advisor homeowner members."""
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    created = await client.post("/api/v1/design/profiles",
        json={"site_id": str(site.id),
              "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 1}],
              "contributors": [{"role": "co_owner", "is_decision_owner": True}]},
        headers=auth(architect))
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    area_id = detail["areas"][0]["id"]
    contrib_id = detail["contributors"][0]["id"]
    # one ranked reference so the brief has signal
    r = await client.post("/api/v1/design/references",
        json={"area_id": area_id, "source_type": "upload", "source_url": "https://x.test/a.jpg"},
        headers=auth(architect))
    await client.post(f"/api/v1/design/references/{r.json()['id']}/rankings",
        json={"contributor_id": contrib_id, "stars": 5}, headers=auth(architect))
    brief = (
        await client.post(f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))
    ).json()

    owner = await factory.user(company=company, role=UserRole.homeowner)
    co = await factory.user(company=company, role=UserRole.homeowner)
    family = await factory.user(company=company, role=UserRole.homeowner)
    advisor = await factory.user(company=company, role=UserRole.homeowner)
    await _member(db_session, site.id, owner.id, HomeownerSubRole.primary_owner)
    await _member(db_session, site.id, co.id, HomeownerSubRole.co_owner)
    await _member(db_session, site.id, family.id, HomeownerSubRole.family)
    await _member(db_session, site.id, advisor.id, HomeownerSubRole.advisor)
    return dict(company=company, architect=architect, site=site, pid=pid, area_id=area_id,
                bid=brief["id"], owner=owner, co=co, family=family, advisor=advisor)


async def test_family_and_advisor_cannot_approve_get_comment_box(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        for actor in (w["family"], w["advisor"]):
            resp = await client.post(f"/api/v1/design/briefs/{w['bid']}/approval",
                json={"action": "send_to_architect"}, headers=auth(actor))
            assert resp.status_code == 403
            assert resp.json()["error"]["code"] == "approve_forbidden"
            assert resp.json()["error"]["can_comment"] is True
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_owner_drives_full_approval_chain(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        bid = w["bid"]
        resp1 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["owner"]))
        assert resp1.json()["state"] == "architect_review"
        resp2 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(w["architect"]))
        assert resp2.json()["state"] == "contractor_brief_ready"
        resp3 = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "approve"}, headers=auth(w["co"]))
        assert resp3.json()["state"] == "approved"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_architect_cannot_do_owner_action(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        resp = await client.post(f"/api/v1/design/briefs/{w['bid']}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["architect"]))
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "approve_forbidden"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_contractor_sees_only_contractor_rendering_of_shared_brief(
    client, factory, db_session
):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        pid, bid = w["pid"], w["bid"]
        contractor = await factory.user(company=w["company"], role=UserRole.pm)
        # draft (homeowner_review): contractor cannot see it at all
        early = await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=contractor",
            headers=auth(contractor))
        assert early.status_code == 403 and early.json()["error"]["code"] == "brief_not_shared"
        # contractor cannot peek at the homeowner rendering
        peek = await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=homeowner",
            headers=auth(contractor))
        assert peek.status_code == 403 and peek.json()["error"]["code"] == "audience_forbidden"
        # drive the brief to shared (contractor_brief_ready)
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["owner"]))
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(w["architect"]))
        # now the contractor sees the contractor rendering
        ok = await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=contractor",
            headers=auth(contractor))
        assert ok.status_code == 200 and ok.json()["audience"] == "contractor"
        # homeowner can read their own rendering throughout
        ho = await client.get(f"/api/v1/design/profiles/{pid}/brief?audience=homeowner",
            headers=auth(w["owner"]))
        assert ho.status_code == 200 and ho.json()["audience"] == "homeowner"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_cross_company_and_cross_site_get_404(client, factory, db_session):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        pid = w["pid"]
        # different company contractor -> 404
        other = await factory.user(role=UserRole.architect)
        r_other = await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(other))
        assert r_other.status_code == 404
        # a homeowner of a DIFFERENT site in the SAME company -> 404 (the loader fix)
        other_site = await factory.site(w["company"], name="Other")
        stranger = await factory.user(company=w["company"], role=UserRole.homeowner)
        await _member(db_session, other_site.id, stranger.id, HomeownerSubRole.primary_owner)
        r_stranger = await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(stranger))
        assert r_stranger.status_code == 404
        r_brief = await client.get(
            f"/api/v1/design/profiles/{pid}/brief?audience=homeowner",
            headers=auth(stranger),
        )
        assert r_brief.status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_list_profiles_homeowner_scoped_to_their_sites(client, factory, db_session):
    """GET /design/profiles must not leak other clients' profiles to a homeowner.

    Homeowners share the contractor's company_id, so company-scope alone is too
    permissive (Vuln 3). A homeowner who is a member of a DIFFERENT site (same
    company) must see no rows; the profiled site's own owner still sees it.
    """
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        pid = w["pid"]
        # the profiled site's primary owner is a legitimate member
        owner_list = await client.get("/api/v1/design/profiles", headers=auth(w["owner"]))
        assert owner_list.status_code == 200
        assert {p["id"] for p in owner_list.json()} == {pid}

        # a homeowner of a DIFFERENT site in the SAME company must see nothing
        other_site = await factory.site(w["company"], name="Other")
        stranger = await factory.user(company=w["company"], role=UserRole.homeowner)
        await _member(db_session, other_site.id, stranger.id, HomeownerSubRole.primary_owner)
        stranger_list = await client.get("/api/v1/design/profiles", headers=auth(stranger))
        assert stranger_list.status_code == 200
        assert stranger_list.json() == []
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_cross_site_homeowner_cannot_act_on_brief(client, factory, db_session):
    """A primary_owner of a DIFFERENT site (same company) cannot even load the
    brief to act on it — the loader 404s before any authority check."""
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        other_site = await factory.site(w["company"], name="Other")
        stranger = await factory.user(company=w["company"], role=UserRole.homeowner)
        await _member(db_session, other_site.id, stranger.id, HomeownerSubRole.primary_owner)
        resp = await client.post(f"/api/v1/design/briefs/{w['bid']}/approval",
            json={"action": "send_to_architect"}, headers=auth(stranger))
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_contractor_side_cannot_do_owner_or_architect_actions(client, factory, db_session):
    """A contractor-side pm is neither a homeowner owner nor the architect: it is
    refused the owner action (approve_forbidden) and the sign-off (architect_only)."""
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        bid = w["bid"]
        pm = await factory.user(company=w["company"], role=UserRole.pm)
        # owner action from homeowner_review -> valid transition, fails authority
        owner_act = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(pm))
        assert owner_act.status_code == 403
        assert owner_act.json()["error"]["code"] == "approve_forbidden"
        # move to architect_review (owner), then pm attempts architect sign-off
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["owner"]))
        signoff = await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(pm))
        assert signoff.status_code == 403
        assert signoff.json()["error"]["code"] == "architect_only"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_answer_clarification_is_membrane_scoped(client, factory, db_session):
    """A cross-site stranger cannot answer a clarification on a profile they
    cannot access; the site owner can."""
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        pid, area_id = w["pid"], w["area_id"]
        gen = await client.post(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/clarifications",
            headers=auth(w["architect"]))
        assert gen.status_code == 201 and gen.json()
        qid = gen.json()[0]["id"]
        # cross-site stranger -> 404
        other_site = await factory.site(w["company"], name="Other")
        stranger = await factory.user(company=w["company"], role=UserRole.homeowner)
        await _member(db_session, other_site.id, stranger.id, HomeownerSubRole.primary_owner)
        blocked = await client.post(f"/api/v1/design/clarifications/{qid}/answer",
            json={"answer": "no"}, headers=auth(stranger))
        assert blocked.status_code == 404
        # the site owner can answer
        ok = await client.post(f"/api/v1/design/clarifications/{qid}/answer",
            json={"answer": "Matte."}, headers=auth(w["owner"]))
        assert ok.status_code == 200 and ok.json()["answer"] == "Matte."
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_approval_timeline_attributes_actor_scoped(client, factory, db_session):
    """The approval timeline records each action with the actor's role, and is only
    visible to someone who can access the profile."""
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        w = await _world(client, factory, db_session)
        bid = w["bid"]
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"}, headers=auth(w["owner"]))
        await client.post(f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"}, headers=auth(w["architect"]))
        timeline = (await client.get(
            f"/api/v1/design/briefs/{bid}/approvals", headers=auth(w["owner"]))).json()
        assert [(a["action"], a["actor_role"]) for a in timeline] == [
            ("send_to_architect", "primary_owner"), ("architect_sign_off", "architect")]
        # cross-site stranger cannot read the timeline
        other_site = await factory.site(w["company"], name="Other")
        stranger = await factory.user(company=w["company"], role=UserRole.homeowner)
        await _member(db_session, other_site.id, stranger.id, HomeownerSubRole.primary_owner)
        blocked = await client.get(
            f"/api/v1/design/briefs/{bid}/approvals", headers=auth(stranger))
        assert blocked.status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)
