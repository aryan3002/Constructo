"""POST /api/v1/design/profiles/self-serve — homeowner self-serve profile start.

Homeowner owner/co-owner only (contractor-side architect keeps POST /profiles).
Behavior (task-8-brief):
1. resolve_site + can_approve gate -> 403 approve_forbidden for non-approvers.
2. Existing profile on the site -> 409 profile_exists with its id (no dup).
3. Areas seeded from the site's Space rows (interior/area_key=name/space_id);
   no spaces -> default kitchen/living room/master bedroom.
4. Contributors: every active HomeownerMember on the site (co_owner role +
   is_decision_owner for approvers, family otherwise).
5. Response uses the same serializer as GET /profiles/{id} (my_contributor_id
   etc. populated).
"""
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, Space, SpaceKind, UserRole
from tests.test_profiler_api import auth


async def _homeowner_member(db_session, site_id, user_id, sub_role):
    m = HomeownerMember(
        site_id=site_id, user_id=user_id, sub_role=sub_role, status=MemberStatus.active
    )
    db_session.add(m)
    await db_session.flush()
    return m


async def _world_no_profile(client, factory, db_session, *, with_spaces=True):
    """Company + site + homeowner members, but NO design profile yet."""
    company = await factory.company()
    site = await factory.site(company)
    owner = await factory.user(company=company, role=UserRole.homeowner)
    family = await factory.user(company=company, role=UserRole.homeowner)
    architect = await factory.user(company=company, role=UserRole.architect)
    await _homeowner_member(db_session, site.id, owner.id, HomeownerSubRole.primary_owner)
    await _homeowner_member(db_session, site.id, family.id, HomeownerSubRole.family)
    if with_spaces:
        db_session.add(Space(site_id=site.id, name="Kitchen", kind=SpaceKind.room))
        db_session.add(Space(site_id=site.id, name="Living Room", kind=SpaceKind.room))
        await db_session.flush()
    return dict(company=company, site=site, owner=owner, family=family, architect=architect)


async def test_owner_creates_self_serve_profile_with_areas_and_contributor(
    client, factory, db_session
):
    w = await _world_no_profile(client, factory, db_session)
    resp = await client.post(
        "/api/v1/design/profiles/self-serve",
        json={"site_id": str(w["site"].id)},
        headers=auth(w["owner"]),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["site_id"] == str(w["site"].id)
    assert body["company_id"] == str(w["company"].id)

    area_keys = sorted(a["area_key"] for a in body["areas"])
    assert area_keys == ["kitchen", "living room"]
    for a in body["areas"]:
        assert a["area_kind"] == "interior"

    # self is a contributor with is_decision_owner True
    assert body["my_contributor_id"] is not None
    my = next(c for c in body["contributors"] if c["id"] == body["my_contributor_id"])
    assert my["is_decision_owner"] is True
    assert my["role"] == "co_owner"

    # both members (owner + family) are contributors
    assert len(body["contributors"]) == 2
    roles = sorted(c["role"] for c in body["contributors"])
    assert roles == ["co_owner", "family"]


async def test_no_spaces_defaults_to_three_areas(client, factory, db_session):
    w = await _world_no_profile(client, factory, db_session, with_spaces=False)
    resp = await client.post(
        "/api/v1/design/profiles/self-serve",
        json={"site_id": str(w["site"].id)},
        headers=auth(w["owner"]),
    )
    assert resp.status_code == 201
    area_keys = sorted(a["area_key"] for a in resp.json()["areas"])
    assert area_keys == ["kitchen", "living room", "master bedroom"]


async def test_second_call_returns_409_with_same_profile_id(client, factory, db_session):
    w = await _world_no_profile(client, factory, db_session)
    first = await client.post(
        "/api/v1/design/profiles/self-serve",
        json={"site_id": str(w["site"].id)},
        headers=auth(w["owner"]),
    )
    assert first.status_code == 201
    profile_id = first.json()["id"]

    second = await client.post(
        "/api/v1/design/profiles/self-serve",
        json={"site_id": str(w["site"].id)},
        headers=auth(w["owner"]),
    )
    assert second.status_code == 409
    err = second.json()["error"]
    assert err["code"] == "profile_exists"
    assert err["profile_id"] == profile_id


async def test_family_member_forbidden(client, factory, db_session):
    w = await _world_no_profile(client, factory, db_session)
    resp = await client.post(
        "/api/v1/design/profiles/self-serve",
        json={"site_id": str(w["site"].id)},
        headers=auth(w["family"]),
    )
    assert resp.status_code == 403
    err = resp.json()["error"]
    assert err["code"] == "approve_forbidden"
    assert err["can_comment"] is True


async def test_contractor_side_architect_forbidden(client, factory, db_session):
    """The architect holds no HomeownerMember row anywhere -> resolve_site's
    membership gate rejects them (403 no_membership) before authority is even
    checked. This route is homeowner-only by construction; architects keep using
    POST /profiles. (A contractor-side user with SOME unrelated membership would
    instead fail the can_approve check with 403 approve_forbidden — either way,
    a non-approving caller never gets past this route.)"""
    w = await _world_no_profile(client, factory, db_session)
    resp = await client.post(
        "/api/v1/design/profiles/self-serve",
        json={"site_id": str(w["site"].id)},
        headers=auth(w["architect"]),
    )
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "no_membership"
