"""Conversation access resolution — the single authority for "can this user
read/act in this conversation?" across site, homeowner, and group kinds.

Site/homeowner threads stay site-scoped (homeowner role is still blocked from
site threads); group threads are explicit-membership (``ConversationMember``),
so a homeowner CAN be a group member. Send-path and group CRUD are later slices
— this module only resolves access + admin authority for read surfaces.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import AppError
from app.homeowner.scoping import homeowner_site_ids
from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    MemberRole,
    User,
    UserRole,
)
from app.sites.router import effective_visible_site_ids


async def can_access(
    session: AsyncSession, user: User, conversation: Conversation
) -> bool:
    """True iff ``user`` may read ``conversation``.

    Site/homeowner threads: site-scoped (homeowner role blocked from site kind).
    Group threads: explicit membership (a homeowner can be a member)."""
    if conversation.kind in (ConversationKind.site, ConversationKind.homeowner):
        if conversation.site_id is None:
            return False
        if user.role is UserRole.homeowner:
            # A homeowner is still blocked from the crew site thread; she reaches
            # ONLY her own per-site homeowner channel (active membership).
            if conversation.kind is ConversationKind.site:
                return False
            return conversation.site_id in await homeowner_site_ids(session, user)
        return conversation.site_id in await effective_visible_site_ids(session, user)
    if conversation.kind is ConversationKind.group:
        # Defence-in-depth: a group is company-scoped. Even if a (future buggy or
        # malicious) write created a cross-tenant membership row, never let it
        # grant access across companies.
        if conversation.company_id != user.company_id:
            return False
        member = await session.get(ConversationMember, (conversation.id, user.id))
        return member is not None
    return False


async def require_access(
    session: AsyncSession, user: User, conversation: Conversation
) -> None:
    """Raise 403 unless ``user`` may access ``conversation``."""
    if not await can_access(session, user, conversation):
        raise AppError(403, "forbidden", "You cannot access this conversation")


async def is_group_admin(
    session: AsyncSession, user: User, conversation_id: UUID
) -> bool:
    """True iff ``user`` is an admin member of the group ``conversation_id``."""
    member = await session.get(ConversationMember, (conversation_id, user.id))
    return member is not None and member.role is MemberRole.admin


async def require_group_admin(
    session: AsyncSession, user: User, conversation_id: UUID
) -> None:
    """Raise 403 unless ``user`` is an admin member of the group."""
    if not await is_group_admin(session, user, conversation_id):
        raise AppError(403, "forbidden", "Group admin required")


async def load_group_or_404(
    session: AsyncSession, conversation_id: UUID
) -> Conversation:
    """Load a ``kind=group`` conversation, or 404 if missing / not a group."""
    conv = await session.get(Conversation, conversation_id)
    if conv is None or conv.kind is not ConversationKind.group:
        raise AppError(404, "not_found", "Group not found")
    return conv
