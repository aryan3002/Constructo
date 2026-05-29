"""Site visibility scoping.

owner / pm  -> all sites in their company
supervisor (and others) -> only assigned sites. No user<->site assignment table exists in
Wave 0, so this returns [] for now; Wave 1 introduces the assignment table and fills this in.
"""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Site, User, UserRole

_ALL_SITES_ROLES = {UserRole.owner, UserRole.pm}


async def visible_site_ids(session: AsyncSession, user: User) -> list[UUID]:
    if user.role in _ALL_SITES_ROLES:
        rows = await session.execute(select(Site.id).where(Site.company_id == user.company_id))
        return list(rows.scalars().all())
    return []
