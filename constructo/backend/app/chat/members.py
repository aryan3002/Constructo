"""Derived conversation membership — the inverse of access.can_access.

Receipts aggregate over these users; push fallback targets them. site/homeowner
membership is DERIVED (site scope), mirroring access.py; groups are explicit."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    MemberStatus,
    User,
    UserRole,
)
from app.models.homeowner_member import HomeownerMember
from app.sites.models import SiteAssignment

# Roles that see every company site (mirrors sites.router._ALL_SITES_ROLES /
# effective_visible_site_ids — owner, pm, AND architect all get company-wide visibility).
_ALL_SITES_ROLES = frozenset({UserRole.owner, UserRole.pm, UserRole.architect})


async def member_user_ids(session: AsyncSession, conv: Conversation) -> list[UUID]:
    """Every user who is 'in' this conversation (dedup, stable order)."""
    if conv.kind is ConversationKind.group:
        rows = (
            await session.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conv.id
                )
            )
        ).scalars().all()
        return list(rows)

    assert conv.site_id is not None  # enforced by ck_conversation_site_required
    crew = (
        await session.execute(
            select(User.id)
            .outerjoin(SiteAssignment, SiteAssignment.user_id == User.id)
            .where(
                User.company_id == conv.company_id,
                User.role != UserRole.homeowner,
                User.is_active.is_(True),
                (User.role.in_(_ALL_SITES_ROLES))
                | (SiteAssignment.site_id == conv.site_id),
            )
            .distinct()
        )
    ).scalars().all()
    ids = list(crew)
    if conv.kind is ConversationKind.homeowner:
        homeowners = (
            await session.execute(
                select(HomeownerMember.user_id).where(
                    HomeownerMember.site_id == conv.site_id,
                    HomeownerMember.status == MemberStatus.active,
                    HomeownerMember.user_id.is_not(None),
                )
            )
        ).scalars().all()
        ids += [h for h in homeowners if h not in set(ids)]
    return ids
