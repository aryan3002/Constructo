"""Homeowner multi-member management (proposal A).

Owner-minted members share the same ``homeowner_members`` row + join_code as the
contractor-mint path, distinguished only by ``invited_by_member_id``. These tests
cover the founder decisions baked into the backend:

* MEMBER_CAP = 6 active+invited rows per site, hard-gated on invite.
* Managers (primary/co-owner) manage members; family/advisor cannot.
* The last active primary_owner can never be demoted or removed.
* A non-design member is blocked from writing a selection (DEGRADE-copy 403).
* /me/capabilities reflects can_manage_members / can_design / design_space_id.
"""
from types import SimpleNamespace

import pytest_asyncio

from app.homeowner.router import MEMBER_CAP
from app.models import (
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    Space,
    SpaceKind,
    UserRole,
)

from .conftest import auth


async def _member(db_session, ctx, sub_role, *, user=None, status=MemberStatus.active,
                  can_design=False, design_space_id=None):
    m = HomeownerMember(
        site_id=ctx.site.id,
        user_id=user.id if user else None,
        sub_role=sub_role,
        status=status,
        can_design=can_design,
        design_space_id=design_space_id,
    )
    db_session.add(m)
    await db_session.flush()
    return m


@pytest_asyncio.fixture
async def family(factory, db_session, ctx):
    user = await factory.user(company=ctx.company, role=UserRole.homeowner)
    member = await _member(db_session, ctx, HomeownerSubRole.family, user=user)
    return SimpleNamespace(user=user, member=member)


@pytest_asyncio.fixture
async def co_owner(factory, db_session, ctx):
    user = await factory.user(company=ctx.company, role=UserRole.homeowner)
    member = await _member(db_session, ctx, HomeownerSubRole.co_owner, user=user)
    return SimpleNamespace(user=user, member=member)


async def _space(db_session, ctx, name="Kitchen"):
    s = Space(site_id=ctx.site.id, name=name, kind=SpaceKind.room)
    db_session.add(s)
    await db_session.flush()
    return s


# ---- invite + cap ----------------------------------------------------------


async def test_owner_can_invite_member(client, ctx):
    resp = await client.post(
        "/api/v1/homeowner/members/invite",
        json={"sub_role": "family", "display_name": "Papa", "phone": "+15550001"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["sub_role"] == "family"
    assert body["display_name"] == "Papa"
    assert body["status"] == "invited"
    assert body["invite_link"].startswith("neev://join?code=")
    # Owner-mint discriminator: invited_by points at the inviting owner's row.
    assert body["invited_by_member_id"] == str(ctx.member.id)
    assert body["invited_at"] is not None
    # Calm notif defaults applied server-side for family.
    assert body["notif_prefs"]["decision_needed"] == "off"


async def test_invite_respects_member_cap(client, ctx, db_session):
    # ctx already seeds 1 primary; fill up to MEMBER_CAP with invited rows.
    for _ in range(MEMBER_CAP - 1):
        await _member(db_session, ctx, HomeownerSubRole.family, status=MemberStatus.invited)
    await db_session.flush()

    resp = await client.post(
        "/api/v1/homeowner/members/invite",
        json={"sub_role": "family"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["error"]["code"] == "member_cap_reached"


async def test_family_cannot_invite(client, ctx, family):
    resp = await client.post(
        "/api/v1/homeowner/members/invite",
        json={"sub_role": "family"},
        headers=auth(family.user),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["error"]["code"] == "manage_forbidden"


async def test_co_owner_cannot_grant_primary_or_co_owner(client, ctx, co_owner):
    for role in ("primary_owner", "co_owner"):
        resp = await client.post(
            "/api/v1/homeowner/members/invite",
            json={"sub_role": role},
            headers=auth(co_owner.user),
        )
        assert resp.status_code == 403, resp.text
        assert resp.json()["error"]["code"] == "cannot_grant_primary"


async def test_invite_invalid_design_space(client, ctx, factory, db_session):
    # A space on a DIFFERENT site is not valid scope.
    other_site = await factory.site(ctx.company, name="Other")
    bad_space = Space(site_id=other_site.id, name="Den", kind=SpaceKind.room)
    db_session.add(bad_space)
    await db_session.flush()
    resp = await client.post(
        "/api/v1/homeowner/members/invite",
        json={"sub_role": "family", "can_design": True, "design_space_id": str(bad_space.id)},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 422, resp.text
    assert resp.json()["error"]["code"] == "invalid_design_space"


# ---- roster ----------------------------------------------------------------


async def test_roster_lists_site_members(client, ctx, family):
    resp = await client.get(
        f"/api/v1/homeowner/members/roster?site_id={ctx.site.id}",
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    ids = {m["id"] for m in resp.json()}
    assert str(ctx.member.id) in ids
    assert str(family.member.id) in ids


# ---- manage (role + design) ------------------------------------------------


async def test_owner_designates_design_say(client, ctx, family):
    resp = await client.patch(
        f"/api/v1/homeowner/members/{family.member.id}/manage",
        json={"can_design": True, "display_name": "Neha — designer"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["can_design"] is True
    assert body["display_name"] == "Neha — designer"


async def test_last_primary_cannot_be_demoted(client, ctx):
    # ctx.member is the only active primary on the site.
    resp = await client.patch(
        f"/api/v1/homeowner/members/{ctx.member.id}/manage",
        json={"sub_role": "co_owner"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["error"]["code"] == "last_primary"


async def test_co_owner_cannot_change_owner_role(client, ctx, co_owner, family):
    # A co-owner may not promote family to co_owner (primary-gated).
    resp = await client.patch(
        f"/api/v1/homeowner/members/{family.member.id}/manage",
        json={"sub_role": "co_owner"},
        headers=auth(co_owner.user),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["error"]["code"] == "cannot_grant_primary"


# ---- removal ---------------------------------------------------------------


async def test_owner_removes_family(client, ctx, family, db_session):
    resp = await client.delete(
        f"/api/v1/homeowner/members/{family.member.id}",
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 204, resp.text
    assert await db_session.get(HomeownerMember, family.member.id) is None


async def test_last_primary_cannot_be_removed(client, ctx, co_owner):
    # co_owner is a manager and may delete others, but not the last primary.
    resp = await client.delete(
        f"/api/v1/homeowner/members/{ctx.member.id}",
        headers=auth(co_owner.user),
    )
    assert resp.status_code == 409, resp.text
    assert resp.json()["error"]["code"] == "last_primary"


async def test_cannot_self_delete(client, ctx, co_owner):
    resp = await client.delete(
        f"/api/v1/homeowner/members/{co_owner.member.id}",
        headers=auth(co_owner.user),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["error"]["code"] == "cannot_self_delete"


# ---- design-write gate -----------------------------------------------------


async def test_non_design_member_blocked_from_selection(client, ctx, family):
    resp = await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "Floor", "choice": "Marble"},
        headers=auth(family.user),
    )
    assert resp.status_code == 403, resp.text
    assert resp.json()["error"]["code"] == "design_forbidden"


async def test_design_member_can_write_selection(client, ctx, factory, db_session):
    user = await factory.user(company=ctx.company, role=UserRole.homeowner)
    await _member(db_session, ctx, HomeownerSubRole.family, user=user, can_design=True)
    await db_session.flush()
    resp = await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "Floor", "choice": "Marble"},
        headers=auth(user),
    )
    assert resp.status_code == 201, resp.text


async def test_room_scoped_member_blocked_outside_room(client, ctx, factory, db_session):
    kitchen = await _space(db_session, ctx, "Kitchen")
    bedroom = await _space(db_session, ctx, "Bedroom")
    user = await factory.user(company=ctx.company, role=UserRole.homeowner)
    await _member(
        db_session, ctx, HomeownerSubRole.family, user=user,
        can_design=True, design_space_id=kitchen.id,
    )
    await db_session.flush()

    # Wrong room → blocked.
    bad = await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "Bed", "choice": "King", "space_id": str(bedroom.id)},
        headers=auth(user),
    )
    assert bad.status_code == 403, bad.text
    assert bad.json()["error"]["code"] == "design_room_only"

    # Granted room → allowed.
    ok = await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "Counter", "choice": "Quartz", "space_id": str(kitchen.id)},
        headers=auth(user),
    )
    assert ok.status_code == 201, ok.text


async def test_owner_can_always_write_selection(client, ctx):
    resp = await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "Door", "choice": "Teak"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 201, resp.text


# ---- capabilities ----------------------------------------------------------


async def test_capabilities_reflects_manage_and_design(client, ctx, factory, db_session):
    # Owner: manages members + design-authoritative, no room scope.
    owner_caps = (await client.get(
        "/api/v1/homeowner/me/capabilities", headers=auth(ctx.homeowner)
    )).json()
    assert owner_caps["can_manage_members"] is True
    assert owner_caps["can_design"] is True
    assert owner_caps["design_space_id"] is None

    # Family with a room-scoped design grant.
    kitchen = await _space(db_session, ctx, "Kitchen")
    user = await factory.user(company=ctx.company, role=UserRole.homeowner)
    await _member(
        db_session, ctx, HomeownerSubRole.family, user=user,
        can_design=True, design_space_id=kitchen.id,
    )
    await db_session.flush()
    fam_caps = (await client.get(
        "/api/v1/homeowner/me/capabilities", headers=auth(user)
    )).json()
    assert fam_caps["can_manage_members"] is False
    assert fam_caps["can_design"] is True
    assert fam_caps["design_space_id"] == str(kitchen.id)


async def test_reinvite_bumps_and_throttles(client, ctx, db_session):
    invited = await _member(
        db_session, ctx, HomeownerSubRole.family, status=MemberStatus.invited
    )
    await db_session.flush()
    # First reinvite of an invited member with no prior invited_at succeeds.
    first = await client.post(
        f"/api/v1/homeowner/members/{invited.id}/reinvite",
        headers=auth(ctx.homeowner),
    )
    assert first.status_code == 200, first.text
    assert first.json()["invited_at"] is not None
    # Immediate second reinvite is throttled.
    second = await client.post(
        f"/api/v1/homeowner/members/{invited.id}/reinvite",
        headers=auth(ctx.homeowner),
    )
    assert second.status_code == 429, second.text
    assert second.json()["error"]["code"] == "reinvite_throttled"
