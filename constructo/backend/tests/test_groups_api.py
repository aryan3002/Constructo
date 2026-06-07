"""Group CRUD + members API + RBAC (doc 18 Phase 2, Task 7).

Drives the real endpoints under ``/api/v1/chat/groups`` to exercise the RBAC
matrix: owner-only create (creator becomes admin), admin-managed membership,
the last-admin guard (remove + demote), self-leave, addable-users (crew +
homeowner, already_member flag, cross-company exclusion), and archive removing
the group from the inbox.  Phase 4 Tasks 1-2: company-wide groups (no site_id)
and crew-only addable-users.
"""
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.auth.jwt import create_access_token
from app.models import (
    HomeownerMember,
    MemberStatus,
    RawMessageModel,
    UserRole,
)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


@pytest_asyncio.fixture
async def world(factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner, name="Owner")
    site = await factory.site(company, name="Sunrise Heights")
    return company, owner, site


async def _create_group(client, owner, site, name="Coordination", members=None):
    body = {
        "name": name,
        "site_id": str(site.id),
        "member_user_ids": [str(m.id) for m in (members or [])],
    }
    return await client.post("/api/v1/chat/groups", json=body, headers=auth(owner))


# ---- create + RBAC ---------------------------------------------------------


@pytest.mark.asyncio
async def test_owner_creates_group_creator_admin_and_member_added(
    client, factory, world
):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM Priya")

    resp = await _create_group(client, owner, site, members=[pm])
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Coordination"
    assert data["site_id"] == str(site.id)
    assert data["archived"] is False

    by_id = {m["user_id"]: m for m in data["members"]}
    assert by_id[str(owner.id)]["role"] == "admin"
    assert by_id[str(pm.id)]["role"] == "member"
    assert len(data["members"]) == 2


@pytest.mark.asyncio
async def test_non_owner_create_forbidden(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM")
    resp = await _create_group(client, pm, site)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_foreign_site_forbidden(client, factory, world):
    company, owner, _ = world
    other_company = await factory.company(name="Other Co")
    other_site = await factory.site(other_company, name="Foreign")
    resp = await _create_group(client, owner, other_site)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_skips_foreign_member(client, factory, world):
    company, owner, site = world
    other_company = await factory.company(name="Other Co")
    foreign = await factory.user(company=other_company, role=UserRole.pm, name="Foreigner")
    resp = await _create_group(client, owner, site, members=[foreign])
    assert resp.status_code == 201
    ids = {m["user_id"] for m in resp.json()["members"]}
    assert str(foreign.id) not in ids
    assert ids == {str(owner.id)}


# ---- members add / remove --------------------------------------------------


@pytest.mark.asyncio
async def test_admin_adds_member(client, factory, world):
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor, name="Sup")
    group = (await _create_group(client, owner, site)).json()

    resp = await client.post(
        f"/api/v1/chat/groups/{group['id']}/members",
        json={"user_ids": [str(sup.id)]},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    ids = {m["user_id"] for m in resp.json()["members"]}
    assert str(sup.id) in ids

    # idempotent re-add
    resp2 = await client.post(
        f"/api/v1/chat/groups/{group['id']}/members",
        json={"user_ids": [str(sup.id)]},
        headers=auth(owner),
    )
    assert resp2.status_code == 200
    assert len(resp2.json()["members"]) == 2


@pytest.mark.asyncio
async def test_non_admin_cannot_add(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM")
    sup = await factory.user(company=company, role=UserRole.supervisor, name="Sup")
    group = (await _create_group(client, owner, site, members=[pm])).json()

    resp = await client.post(
        f"/api/v1/chat/groups/{group['id']}/members",
        json={"user_ids": [str(sup.id)]},
        headers=auth(pm),  # pm is a plain member, not admin
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_removes_member(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM")
    group = (await _create_group(client, owner, site, members=[pm])).json()

    resp = await client.delete(
        f"/api/v1/chat/groups/{group['id']}/members/{pm.id}",
        headers=auth(owner),
    )
    assert resp.status_code == 204

    members = await client.get(
        f"/api/v1/chat/groups/{group['id']}/members", headers=auth(owner)
    )
    ids = {m["user_id"] for m in members.json()["members"]}
    assert str(pm.id) not in ids


@pytest.mark.asyncio
async def test_self_leave(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM")
    group = (await _create_group(client, owner, site, members=[pm])).json()

    resp = await client.delete(
        f"/api/v1/chat/groups/{group['id']}/members/{pm.id}",
        headers=auth(pm),  # removing self
    )
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_remove_nonmember_returns_404(client, factory, world):
    company, owner, site = world
    # A fresh same-company user who was never added to the group.
    stranger = await factory.user(company=company, role=UserRole.pm, name="Stranger")
    group = (await _create_group(client, owner, site)).json()

    resp = await client.delete(
        f"/api/v1/chat/groups/{group['id']}/members/{stranger.id}",
        headers=auth(owner),  # owner is admin
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "not_found"


@pytest.mark.asyncio
async def test_nonmember_cannot_list_members(client, factory, world):
    company, owner, site = world
    # A same-company user who is NOT a member of the group.
    outsider = await factory.user(company=company, role=UserRole.pm, name="Outsider")
    group = (await _create_group(client, owner, site)).json()

    resp = await client.get(
        f"/api/v1/chat/groups/{group['id']}/members",
        headers=auth(outsider),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_remove_last_admin_conflict(client, factory, world):
    company, owner, site = world
    group = (await _create_group(client, owner, site)).json()

    resp = await client.delete(
        f"/api/v1/chat/groups/{group['id']}/members/{owner.id}",
        headers=auth(owner),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "last_admin"


# ---- rename / archive ------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_rename_and_archive(client, factory, world):
    company, owner, site = world
    group = (await _create_group(client, owner, site)).json()

    renamed = await client.patch(
        f"/api/v1/chat/groups/{group['id']}",
        json={"name": "Renamed Crew"},
        headers=auth(owner),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed Crew"

    # Visible in inbox before archive.
    inbox = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert group["id"] in {c["id"] for c in inbox.json()}

    archived = await client.patch(
        f"/api/v1/chat/groups/{group['id']}",
        json={"archived": True},
        headers=auth(owner),
    )
    assert archived.status_code == 200
    assert archived.json()["archived"] is True

    # Archived group is absent from the inbox.
    inbox2 = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert group["id"] not in {c["id"] for c in inbox2.json()}


# ---- delegation / demotion -------------------------------------------------


@pytest.mark.asyncio
async def test_delegate_admin_then_demote(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM")
    group = (await _create_group(client, owner, site, members=[pm])).json()
    gid = group["id"]

    # Promote pm to admin.
    promote = await client.patch(
        f"/api/v1/chat/groups/{gid}",
        json={"member_role": {"user_id": str(pm.id), "role": "admin"}},
        headers=auth(owner),
    )
    assert promote.status_code == 200

    # The delegated admin can now rename.
    renamed = await client.patch(
        f"/api/v1/chat/groups/{gid}",
        json={"name": "PM Renamed"},
        headers=auth(pm),
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "PM Renamed"

    # Demote pm back to member (owner is still admin, so allowed).
    demote = await client.patch(
        f"/api/v1/chat/groups/{gid}",
        json={"member_role": {"user_id": str(pm.id), "role": "member"}},
        headers=auth(owner),
    )
    assert demote.status_code == 200

    # After demotion the (now plain member) pm cannot rename.
    blocked = await client.patch(
        f"/api/v1/chat/groups/{gid}",
        json={"name": "Nope"},
        headers=auth(pm),
    )
    assert blocked.status_code == 403


@pytest.mark.asyncio
async def test_demote_last_admin_conflict(client, factory, world):
    company, owner, site = world
    group = (await _create_group(client, owner, site)).json()

    resp = await client.patch(
        f"/api/v1/chat/groups/{group['id']}",
        json={"member_role": {"user_id": str(owner.id), "role": "member"}},
        headers=auth(owner),
    )
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "last_admin"


# ---- addable-users ---------------------------------------------------------


@pytest.mark.asyncio
async def test_addable_users_crew_homeowner_flags_and_company_isolation(
    client, factory, world, db_session
):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM")
    # A joined homeowner on this site (non-null user_id = redeemed).
    homeowner = await factory.user(
        company=company, role=UserRole.homeowner, name="Homeowner"
    )
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            status=MemberStatus.active,
        )
    )
    await db_session.flush()
    # A user in a different company must be excluded.
    other_company = await factory.company(name="Other Co")
    foreign = await factory.user(
        company=other_company, role=UserRole.pm, name="Foreigner"
    )

    # Create the group with pm pre-added so already_member is exercisable.
    group = (await _create_group(client, owner, site, members=[pm])).json()

    resp = await client.get(
        f"/api/v1/chat/groups/addable-users?site_id={site.id}&group_id={group['id']}",
        headers=auth(owner),
    )
    assert resp.status_code == 200
    by_id = {u["user_id"]: u for u in resp.json()}

    # Crew + homeowner present; foreigner absent.
    assert str(owner.id) in by_id
    assert str(pm.id) in by_id
    assert str(homeowner.id) in by_id
    assert by_id[str(homeowner.id)]["role"] == "homeowner"
    assert str(foreign.id) not in by_id

    # already_member flags: owner + pm are in the group, homeowner is not.
    assert by_id[str(owner.id)]["already_member"] is True
    assert by_id[str(pm.id)]["already_member"] is True
    assert by_id[str(homeowner.id)]["already_member"] is False


@pytest.mark.asyncio
async def test_addable_users_requires_owner_without_group_id(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM")
    resp = await client.get(
        f"/api/v1/chat/groups/addable-users?site_id={site.id}",
        headers=auth(pm),
    )
    assert resp.status_code == 403


# ---- company-wide groups (Phase 4, Tasks 1-2) --------------------------------


@pytest.mark.asyncio
async def test_owner_creates_company_wide_group(client, factory, world):
    """POST /groups with NO site_id creates a company-wide group (site_id=None)."""
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor, name="Sup")

    body = {
        "name": "All Hands",
        "member_user_ids": [str(sup.id)],
    }
    resp = await client.post("/api/v1/chat/groups", json=body, headers=auth(owner))
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "All Hands"
    assert data["site_id"] is None

    by_id = {m["user_id"]: m for m in data["members"]}
    assert by_id[str(owner.id)]["role"] == "admin"
    assert by_id[str(sup.id)]["role"] == "member"


@pytest.mark.asyncio
async def test_company_wide_group_appears_in_owner_inbox(client, factory, world):
    """Company-wide group appears in the owner's inbox with kind=group, site_id=None."""
    company, owner, site = world

    body = {"name": "Company Broadcast"}
    resp = await client.post("/api/v1/chat/groups", json=body, headers=auth(owner))
    assert resp.status_code == 201
    group_id = resp.json()["id"]

    inbox = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert inbox.status_code == 200
    rows = {c["id"]: c for c in inbox.json()}
    assert group_id in rows
    assert rows[group_id]["kind"] == "group"
    assert rows[group_id]["site_id"] is None


@pytest.mark.asyncio
async def test_company_wide_group_message_is_talk_only(
    client, factory, world, db_session
):
    """Messages sent to a company-wide group mint NO RawMessage (talk-only)."""
    company, owner, site = world

    body = {"name": "Talk Room"}
    group_resp = await client.post(
        "/api/v1/chat/groups", json=body, headers=auth(owner)
    )
    assert group_resp.status_code == 201
    conv_id = group_resp.json()["id"]

    raw_before = await db_session.scalar(
        select(func.count()).select_from(RawMessageModel)
    )

    send = await client.post(
        "/api/v1/chat/messages",
        json={
            "conversation_id": conv_id,
            "client_msg_id": str(uuid4()),
            "body": "Hello company",
        },
        headers=auth(owner),
    )
    assert send.status_code == 201

    raw_after = await db_session.scalar(
        select(func.count()).select_from(RawMessageModel)
    )
    assert raw_after == raw_before  # no RawMessage minted


@pytest.mark.asyncio
async def test_non_owner_cannot_create_company_wide_group(client, factory, world):
    """A PM posting with no site_id must be rejected with 403."""
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm, name="PM Raj")

    body = {"name": "Sneaky Group"}
    resp = await client.post("/api/v1/chat/groups", json=body, headers=auth(pm))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_addable_users_company_wide_is_crew_only(
    client, factory, world, db_session
):
    """GET /groups/addable-users with NO site_id returns crew but excludes homeowners."""
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor, name="Sup")
    homeowner = await factory.user(
        company=company, role=UserRole.homeowner, name="HO User"
    )
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            status=MemberStatus.active,
            join_code="cw-addable-1",
        )
    )
    await db_session.flush()

    resp = await client.get(
        "/api/v1/chat/groups/addable-users",
        headers=auth(owner),
    )
    assert resp.status_code == 200
    by_id = {u["user_id"]: u for u in resp.json()}

    assert str(sup.id) in by_id
    assert str(owner.id) in by_id
    assert str(homeowner.id) not in by_id  # crew-only; no site → no homeowners


@pytest.mark.asyncio
async def test_addable_users_site_group_still_includes_homeowner(
    client, factory, world, db_session
):
    """GET /groups/addable-users?site_id=<site> still includes the site's homeowner
    (regression: the site-group path must be unchanged when site_id is provided)."""
    company, owner, site = world
    homeowner = await factory.user(
        company=company, role=UserRole.homeowner, name="HO Reg"
    )
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            status=MemberStatus.active,
            join_code="site-addable-1",
        )
    )
    await db_session.flush()

    resp = await client.get(
        f"/api/v1/chat/groups/addable-users?site_id={site.id}",
        headers=auth(owner),
    )
    assert resp.status_code == 200
    by_id = {u["user_id"]: u for u in resp.json()}

    assert str(homeowner.id) in by_id
    assert by_id[str(homeowner.id)]["role"] == "homeowner"


# ---- company-wide crew-only invariant (server-side enforcement) -------------


@pytest.mark.asyncio
async def test_company_wide_create_skips_homeowner_member(client, factory, world):
    """Creating a company-wide group (no site_id) with a same-company homeowner's
    id in member_user_ids must NOT add the homeowner: company-wide is crew-only.
    The guard lives server-side, not just in the UI picker."""
    company, owner, site = world
    homeowner = await factory.user(
        company=company, role=UserRole.homeowner, name="HO Sneak"
    )

    body = {
        "name": "Crew Only",
        "member_user_ids": [str(homeowner.id)],
    }
    resp = await client.post("/api/v1/chat/groups", json=body, headers=auth(owner))
    assert resp.status_code == 201
    data = resp.json()
    assert data["site_id"] is None

    ids = {m["user_id"] for m in data["members"]}
    assert str(homeowner.id) not in ids
    assert ids == {str(owner.id)}  # only the owner admin


@pytest.mark.asyncio
async def test_company_wide_add_members_skips_homeowner(client, factory, world):
    """POST /groups/{id}/members on a company-wide group must skip homeowners:
    an admin cannot back-door a homeowner in after creation."""
    company, owner, site = world
    homeowner = await factory.user(
        company=company, role=UserRole.homeowner, name="HO Backdoor"
    )

    body = {"name": "Crew Broadcast"}
    group = (
        await client.post("/api/v1/chat/groups", json=body, headers=auth(owner))
    ).json()
    assert group["site_id"] is None

    resp = await client.post(
        f"/api/v1/chat/groups/{group['id']}/members",
        json={"user_ids": [str(homeowner.id)]},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    ids = {m["user_id"] for m in resp.json()["members"]}
    assert str(homeowner.id) not in ids
    assert ids == {str(owner.id)}  # roster unchanged
