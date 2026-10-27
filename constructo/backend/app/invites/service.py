"""Invite lookups shared by login and the invite routes."""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.phone import normalize_phone
from app.invites.models import Invite, InviteStatus

_NON_DIGITS = r"\D"


def same_phone(a: str, b: str) -> bool:
    """Two typed numbers name the same phone (+919800000001 = 98000 00001)."""
    return normalize_phone(a) == normalize_phone(b)


async def pending_invite_for_phone(session: AsyncSession, phone: str) -> Invite | None:
    """The newest pending invite for ``phone``, in whatever format either side
    was typed. Revoked and accepted invites never match."""
    digits = "".join(ch for ch in phone if ch.isdigit())
    stmt = select(Invite).where(Invite.status == InviteStatus.pending)
    if len(digits) >= 10:
        # Narrow in SQL on the last ten digits; confirm exactly below.
        stmt = stmt.where(
            func.right(func.regexp_replace(Invite.phone, _NON_DIGITS, "", "g"), 10)
            == digits[-10:]
        )
    rows = (await session.execute(stmt.order_by(Invite.created_at.desc()))).scalars().all()
    return next((inv for inv in rows if same_phone(inv.phone, phone)), None)
