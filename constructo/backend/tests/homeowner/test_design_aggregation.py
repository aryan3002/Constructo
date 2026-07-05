"""H/proposal-C integration: attribution stamping, GET /design/references, and
the multi-member conflict surface (calm card, human-resolved — never AI-picked).
"""
from types import SimpleNamespace

import pytest_asyncio

from app.homeowner.router import _build_site_fingerprint
from app.models import (
    AreaKind,
    DesignReference,
    DesignSelection,
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    ProfilerArea,
    ProfilerProfile,
    UserRole,
)

from .conftest import auth


@pytest_asyncio.fixture
async def co_owner(factory, db_session, ctx):
    """A second authoritative member (co-owner) bound to their own user."""
    user = await factory.user(company=ctx.company, role=UserRole.homeowner)
    member = HomeownerMember(
        site_id=ctx.site.id,
        user_id=user.id,
        sub_role=HomeownerSubRole.co_owner,
        status=MemberStatus.active,
    )
    db_session.add(member)
    await db_session.flush()
    return SimpleNamespace(user=user, member=member)


async def test_selection_is_attributed_to_caller_member(client, ctx, db_session):
    resp = await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "kitchen counter", "choice": "quartz"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 201, resp.text
    sel = await db_session.get(DesignSelection, resp.json()["id"])
    assert sel.actor_member_id == ctx.member.id


async def test_reference_is_attributed_and_survives_reload(client, ctx, db_session):
    created = await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": "http://pin/1.jpg", "room_tag": "living", "source": "pinterest"},
        headers=auth(ctx.homeowner),
    )
    assert created.status_code == 201, created.text
    assert created.json()["actor_member_id"] == str(ctx.member.id)

    ref = await db_session.get(DesignReference, created.json()["id"])
    assert ref.actor_member_id == ctx.member.id

    # GET /design/references now exists → refs survive reload (data-loss fix).
    listed = await client.get(
        "/api/v1/homeowner/design/references", headers=auth(ctx.homeowner)
    )
    assert listed.status_code == 200, listed.text
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["image_url"] == "http://pin/1.jpg"
    assert rows[0]["actor_member_id"] == str(ctx.member.id)


async def test_two_owners_diverge_surfaces_a_conflict(client, ctx, co_owner):
    await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "worktop", "choice": "matte quartz"},
        headers=auth(ctx.homeowner),
    )
    await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "worktop", "choice": "glossy granite"},
        headers=auth(co_owner.user),
    )

    conflicts = await client.get(
        "/api/v1/homeowner/design/conflicts", headers=auth(ctx.homeowner)
    )
    assert conflicts.status_code == 200, conflicts.text
    body = conflicts.json()
    assert len(body) == 1
    assert body[0]["item"] == "worktop"
    assert {o["choice"] for o in body[0]["options"]} == {"matte quartz", "glossy granite"}

    # The AI draft must NOT pick a winner: the conflicted item is excluded from
    # the blended selections but surfaced under conflicts on the profile.
    drafted = await client.put(
        "/api/v1/homeowner/design/profile", json={}, headers=auth(ctx.homeowner)
    )
    assert drafted.status_code == 200, drafted.text
    profile = drafted.json()["profile"]
    assert len(profile["conflicts"]) == 1
    assert profile["conflicts"][0]["item"] == "worktop"


async def test_human_resolution_settles_the_conflict(client, ctx, co_owner):
    await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "worktop", "choice": "matte quartz"},
        headers=auth(ctx.homeowner),
    )
    await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "worktop", "choice": "glossy granite"},
        headers=auth(co_owner.user),
    )

    # A human (owner) picks one — no AI adjudication.
    resolved = await client.post(
        "/api/v1/homeowner/design/conflicts/resolve",
        json={"item": "worktop", "choice": "matte quartz"},
        headers=auth(ctx.homeowner),
    )
    assert resolved.status_code == 201, resolved.text

    after = await client.get(
        "/api/v1/homeowner/design/conflicts", headers=auth(ctx.homeowner)
    )
    assert after.status_code == 200
    assert after.json() == []


async def test_conflicts_fingerprint_skips_ranked_taste_even_with_profiler_profile(
    ctx, db_session
):
    """GET /design/conflicts fires on every selection pick (unbounded frequency)
    and never reads ranked_taste, so its fingerprint call must default to
    include_ranked_taste=False — zero extra ProfilerProfile/ProfilerArea
    queries — even when the site DOES have a profiler profile. Asserting the
    key is absent (not merely empty) is the simplest honest proof the
    profiler fetch was skipped, since an empty dict is indistinguishable from
    "fetched but no taste data" otherwise."""
    profile = ProfilerProfile(company_id=ctx.company.id, site_id=ctx.site.id)
    db_session.add(profile)
    await db_session.flush()
    db_session.add(
        ProfilerArea(
            profile_id=profile.id,
            area_kind=AreaKind.interior,
            area_key="kitchen",
            taste_model={"materials": {"light oak": 0.9}},
        )
    )
    await db_session.flush()

    fingerprint = await _build_site_fingerprint(db_session, ctx.site.id)
    assert "ranked_taste" not in fingerprint

    fingerprint_with_taste = await _build_site_fingerprint(
        db_session, ctx.site.id, include_ranked_taste=True
    )
    assert "ranked_taste" in fingerprint_with_taste
    assert fingerprint_with_taste["ranked_taste"]["kitchen"] == [["materials", "light oak"]]
