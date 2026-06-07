"""Group CRUD + members API + RBAC (Groups subsystem, doc 18 Phase 2, Task 7).

Group threads (``ConversationKind.group``) are explicit-membership conversations
that are additive to a company and may be site-less. This router owns their
lifecycle: an **owner** creates a group (and becomes its first admin); **admins**
manage membership, rename, archive, and delegate/demote; **any member** can read
the roster and remove themselves (leave). A *last-admin guard* makes it
impossible to strand a group with zero admins (via removal or demotion).

Access/authority is resolved through ``app.chat.access`` (the single authority):
``require_access`` (any member), ``require_group_admin`` (admin), and
``load_group_or_404``. Owner-only create is gated by ``require_role``.
"""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.chat.access import (
    load_group_or_404,
    require_access,
    require_group_admin,
)
from app.common.errors import AppError
from app.db import get_session
from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    HomeownerMember,
    MemberRole,
    User,
    UserRole,
)
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/chat", tags=["chat-groups"])


# ---- schemas ---------------------------------------------------------------


class GroupCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    site_id: UUID  # REQUIRED in Phase 2
    member_user_ids: list[UUID] = Field(default_factory=list)


class MemberOut(BaseModel):
    user_id: UUID
    name: str | None
    role: MemberRole
    is_homeowner: bool


class GroupOut(BaseModel):
    id: UUID
    name: str | None
    site_id: UUID | None
    archived: bool
    members: list[MemberOut]


class MemberListOut(BaseModel):
    members: list[MemberOut]


class AddableUserOut(BaseModel):
    user_id: UUID
    name: str | None
    role: UserRole
    already_member: bool


class MemberRoleChange(BaseModel):
    user_id: UUID
    role: MemberRole


class GroupPatchIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    archived: bool | None = None
    member_role: MemberRoleChange | None = None


class MembersAddIn(BaseModel):
    user_ids: list[UUID] = Field(default_factory=list)


# ---- helpers ---------------------------------------------------------------


async def _group_out(session: AsyncSession, conv: Conversation) -> GroupOut:
    """Serialise a group with its members joined to User (name + is_homeowner)."""
    rows = (
        await session.execute(
            select(ConversationMember, User)
            .join(User, User.id == ConversationMember.user_id)
            .where(ConversationMember.conversation_id == conv.id)
        )
    ).all()
    members = [
        MemberOut(
            user_id=user.id,
            name=user.name,
            role=member.role,
            is_homeowner=user.role is UserRole.homeowner,
        )
        for member, user in rows
    ]
    return GroupOut(
        id=conv.id,
        name=conv.title,
        site_id=conv.site_id,
        archived=conv.archived_at is not None,
        members=members,
    )


async def _admin_count(session: AsyncSession, conversation_id: UUID) -> int:
    return (
        await session.execute(
            select(func.count())
            .select_from(ConversationMember)
            .where(
                ConversationMember.conversation_id == conversation_id,
                ConversationMember.role == MemberRole.admin,
            )
        )
    ).scalar_one()


# ---- routes ----------------------------------------------------------------


@router.post("/groups", response_model=GroupOut, status_code=201)
async def create_group(
    body: GroupCreateIn,
    owner: User = Depends(require_role(UserRole.owner)),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    """Owner creates a group on one of their visible sites and becomes its first
    admin. Listed ``member_user_ids`` are added as plain members; the owner and
    any unknown/foreign user ids are silently skipped (the roster is the truth)."""
    visible = await effective_visible_site_ids(session, owner)
    if body.site_id not in visible:
        raise AppError(403, "forbidden", "Site not visible to you")

    conv = Conversation(
        company_id=owner.company_id,
        site_id=body.site_id,
        kind=ConversationKind.group,
        title=body.name,
        created_by=owner.id,
    )
    session.add(conv)
    await session.flush()

    session.add(
        ConversationMember(
            conversation_id=conv.id,
            user_id=owner.id,
            role=MemberRole.admin,
            added_by=owner.id,
        )
    )

    seen: set[UUID] = {owner.id}
    # TODO: replace per-id lookups with a single IN query if invite lists grow large.
    for uid in body.member_user_ids:
        if uid in seen:
            continue
        seen.add(uid)
        member_user = await session.get(User, uid)
        if member_user is None or member_user.company_id != owner.company_id:
            continue  # silently ignore foreign/unknown
        session.add(
            ConversationMember(
                conversation_id=conv.id,
                user_id=member_user.id,
                role=MemberRole.member,
                added_by=owner.id,
            )
        )

    await session.commit()
    return await _group_out(session, conv)


@router.get("/groups/addable-users", response_model=list[AddableUserOut])
async def addable_users(
    site_id: UUID = Query(...),
    group_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[AddableUserOut]:
    """Users the caller may add to a group on ``site_id``: all company crew
    (role != homeowner) UNION homeowner-role users who are joined HomeownerMembers
    of that site. ``already_member`` is flagged per ``group_id`` (when given).

    Gate: with ``group_id`` the caller must be an admin of that group; without
    one (the pre-create picker) the caller must be an owner."""
    if group_id is not None:
        await require_group_admin(session, user, group_id)
    elif user.role is not UserRole.owner:
        raise AppError(403, "forbidden", "Owner required")

    # Company crew (everyone but homeowner role).
    crew = (
        await session.execute(
            select(User).where(
                User.company_id == user.company_id,
                User.role != UserRole.homeowner,
            )
        )
    ).scalars().all()

    # Homeowner-role users joined to this site (non-null user_id = redeemed).
    homeowners = (
        await session.execute(
            select(User)
            .join(HomeownerMember, HomeownerMember.user_id == User.id)
            .where(
                HomeownerMember.site_id == site_id,
                HomeownerMember.user_id.is_not(None),
                User.role == UserRole.homeowner,
                User.company_id == user.company_id,
            )
            .distinct()
        )
    ).scalars().all()

    # Existing members for the already_member flag.
    member_ids: set[UUID] = set()
    if group_id is not None:
        member_ids = set(
            (
                await session.execute(
                    select(ConversationMember.user_id).where(
                        ConversationMember.conversation_id == group_id
                    )
                )
            ).scalars().all()
        )

    out: list[AddableUserOut] = []
    emitted: set[UUID] = set()
    for u in [*crew, *homeowners]:
        if u.id in emitted:
            continue
        emitted.add(u.id)
        out.append(
            AddableUserOut(
                user_id=u.id,
                name=u.name,
                role=u.role,
                already_member=u.id in member_ids,
            )
        )
    return out


@router.get("/groups/{group_id}/members", response_model=MemberListOut)
async def list_members(
    group_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MemberListOut:
    """Any member may read the roster."""
    conv = await load_group_or_404(session, group_id)
    await require_access(session, user, conv)
    out = await _group_out(session, conv)
    return MemberListOut(members=out.members)


@router.post("/groups/{group_id}/members", response_model=GroupOut)
async def add_members(
    group_id: UUID,
    body: MembersAddIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    """Admin adds members. Idempotent: existing members and foreign/unknown users
    are skipped."""
    conv = await load_group_or_404(session, group_id)
    await require_group_admin(session, user, group_id)

    seen: set[UUID] = set()
    # TODO: replace per-id lookups with a single IN query if invite lists grow large.
    for uid in body.user_ids:
        if uid in seen:
            continue
        seen.add(uid)
        existing = await session.get(ConversationMember, (conv.id, uid))
        if existing is not None:
            continue
        member_user = await session.get(User, uid)
        if member_user is None or member_user.company_id != user.company_id:
            continue
        session.add(
            ConversationMember(
                conversation_id=conv.id,
                user_id=member_user.id,
                role=MemberRole.member,
                added_by=user.id,
            )
        )

    await session.commit()
    return await _group_out(session, conv)


@router.delete("/groups/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: UUID,
    user_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Admin removes anyone; a member removes themselves (leave). The last admin
    cannot be removed — that would strand the group with zero admins (409)."""
    conv = await load_group_or_404(session, group_id)

    target = await session.get(ConversationMember, (conv.id, user_id))
    if target is None:
        raise AppError(404, "not_found", "Member not found")

    is_self = user_id == user.id
    if not is_self:
        await require_group_admin(session, user, group_id)

    if target.role is MemberRole.admin:
        admins = await _admin_count(session, conv.id)
        if admins <= 1:
            raise AppError(409, "last_admin", "Cannot remove the last admin")

    await session.delete(target)
    await session.commit()


@router.patch("/groups/{group_id}", response_model=GroupOut)
async def patch_group(
    group_id: UUID,
    body: GroupPatchIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    """Admin renames, archives/unarchives, and delegates/demotes members. Demoting
    the only admin is blocked (409 last_admin)."""
    conv = await load_group_or_404(session, group_id)
    await require_group_admin(session, user, group_id)

    if body.name is not None:
        conv.title = body.name

    if body.archived is not None:
        conv.archived_at = datetime.now(UTC) if body.archived else None

    if body.member_role is not None:
        target = await session.get(
            ConversationMember, (conv.id, body.member_role.user_id)
        )
        if target is None:
            raise AppError(404, "not_found", "Member not found")
        if (
            target.role is MemberRole.admin
            and body.member_role.role is MemberRole.member
        ):
            admins = await _admin_count(session, conv.id)
            if admins <= 1:
                raise AppError(409, "last_admin", "Cannot demote the last admin")
        target.role = body.member_role.role

    await session.commit()
    return await _group_out(session, conv)
