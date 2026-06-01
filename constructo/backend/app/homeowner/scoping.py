"""Homeowner site scoping.

A homeowner sees ONLY the sites they hold an active ``homeowner_members`` row
for — never their company's other sites (that is the contractor scoping in
``app.auth.scoping``). Every homeowner read resolves a single site through
:func:`resolve_site`, which enforces membership and rejects cross-site access.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.models import HomeownerMember, HomeownerSubRole, MemberStatus, User

# Most-privileged first — when a user holds several member rows on one site we
# resolve to the highest authority they carry.
_SUB_ROLE_RANK = {
    HomeownerSubRole.primary_owner: 3,
    HomeownerSubRole.co_owner: 2,
    HomeownerSubRole.advisor: 1,
    HomeownerSubRole.family: 0,
}


async def member_sub_role(
    session: AsyncSession, user: User, site_id: UUID
) -> HomeownerSubRole | None:
    """The caller's sub-role on ``site_id`` (highest if several), or None.

    None means the user holds no active membership on that site — the caller
    should already have enforced scope before trusting any capability decision.
    """
    rows = await session.execute(
        select(HomeownerMember.sub_role).where(
            HomeownerMember.user_id == user.id,
            HomeownerMember.site_id == site_id,
            HomeownerMember.status == MemberStatus.active,
        )
    )
    roles = list(rows.scalars().all())
    if not roles:
        return None
    return max(roles, key=lambda r: _SUB_ROLE_RANK.get(r, 0))


async def homeowner_site_ids(session: AsyncSession, user: User) -> list[UUID]:
    """Site ids the homeowner is an active member of (their properties)."""
    rows = await session.execute(
        select(HomeownerMember.site_id).where(
            HomeownerMember.user_id == user.id,
            HomeownerMember.status == MemberStatus.active,
        )
    )
    # A household can have one user across several properties; de-dup, keep order.
    seen: list[UUID] = []
    for sid in rows.scalars().all():
        if sid not in seen:
            seen.append(sid)
    return seen


async def resolve_site(
    session: AsyncSession, user: User, site_id: UUID | None
) -> UUID:
    """Pick the site this request targets, enforcing membership.

    - no membership            -> 403
    - ``site_id`` omitted, one property  -> that property
    - ``site_id`` omitted, many          -> 400 (ambiguous; must specify)
    - ``site_id`` not a member's site    -> 403
    """
    ids = await homeowner_site_ids(session, user)
    if not ids:
        raise AppError(403, "no_membership", "You are not a member of any property")
    if site_id is None:
        if len(ids) == 1:
            return ids[0]
        raise AppError(400, "site_required", "Specify site_id (you have multiple properties)")
    if site_id not in ids:
        raise AppError(403, "forbidden", "Property not in scope")
    return site_id
