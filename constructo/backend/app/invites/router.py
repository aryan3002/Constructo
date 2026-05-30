"""Team-invite endpoints.

Flow:
  1. owner/PM POST /api/v1/invites  {phone, role, name?}  -> Invite + token.
     The web layer turns the token into a WhatsApp/SMS join link.
  2. (public) GET /api/v1/invites/{token}  -> InvitePreview for the join screen.
  3. invited user (logged in via phone+OTP) POST /api/v1/invites/{token}/accept
     -> joins the inviting company with the assigned role, gets a fresh JWT and
     the role-specific landing destination.

Permission scoping: only owner/PM may create invites, and an invite always binds
to the *inviter's* company — a PM cannot mint a role in another company.
"""
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.auth.jwt import create_access_token
from app.auth.landing import landing_for
from app.common.errors import AppError
from app.db import get_session
from app.invites.models import Invite, InviteStatus
from app.invites.schemas import (
    InviteAcceptOut,
    InviteCreate,
    InviteOut,
    InvitePreview,
)
from app.models import Company, User, UserRole

router = APIRouter(prefix="/api/v1/invites", tags=["invites"])


def _invite_out(inv: Invite) -> InviteOut:
    return InviteOut(
        id=inv.id,
        company_id=inv.company_id,
        phone=inv.phone,
        role=inv.role,
        name=inv.name,
        status=str(inv.status),
        token=inv.token,
        created_at=inv.created_at,
    )


@router.post("", response_model=InviteOut, status_code=201)
async def create_invite(
    body: InviteCreate,
    inviter: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> InviteOut:
    # An owner can mint any role; a PM may not create owners (no privilege
    # escalation past their own level).
    if inviter.role is UserRole.pm and body.role is UserRole.owner:
        raise AppError(403, "forbidden", "A PM cannot invite an owner")

    invite = Invite(
        company_id=inviter.company_id,
        invited_by=inviter.id,
        phone=body.phone,
        role=body.role,
        name=body.name,
    )
    session.add(invite)
    await session.commit()
    await session.refresh(invite)
    return _invite_out(invite)


async def _get_pending_invite(session: AsyncSession, token: str) -> Invite:
    invite = (
        await session.execute(select(Invite).where(Invite.token == token))
    ).scalar_one_or_none()
    if invite is None:
        raise AppError(404, "not_found", "Invite not found")
    return invite


@router.get("/{token}", response_model=InvitePreview)
async def preview_invite(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> InvitePreview:
    """Public pre-login peek so the join screen can greet the invitee."""
    invite = await _get_pending_invite(session, token)
    company = await session.get(Company, invite.company_id)
    return InvitePreview(
        role=invite.role,
        company_name=company.name if company else "",
        name=invite.name,
        status=str(invite.status),
    )


@router.post("/{token}/accept", response_model=InviteAcceptOut)
async def accept_invite(
    token: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> InviteAcceptOut:
    """The logged-in invitee joins the inviting company with the assigned role.

    The caller has already authenticated (phone+OTP -> JWT). Accepting moves
    their User into the inviting company and stamps the invited role, so a
    brand-new login (which defaults to a fresh 'owner' in a default company) is
    re-homed correctly. Idempotent: re-accepting returns the same landing.
    """
    invite = await _get_pending_invite(session, token)

    if invite.status is InviteStatus.revoked:
        raise AppError(409, "invite_revoked", "This invite has been revoked")
    if invite.status is InviteStatus.accepted and invite.accepted_user_id != user.id:
        raise AppError(409, "invite_used", "This invite was already used")

    # Re-home + re-role the accepting user onto the inviting company.
    user.company_id = invite.company_id
    user.role = invite.role
    if invite.name and not user.name:
        user.name = invite.name

    invite.status = InviteStatus.accepted
    invite.accepted_user_id = user.id
    invite.accepted_at = invite.accepted_at or datetime.now(UTC)

    try:
        await session.commit()
    except IntegrityError as exc:  # pragma: no cover - defensive
        await session.rollback()
        raise AppError(409, "conflict", "Could not accept invite") from exc

    fresh = create_access_token(str(user.id), user.role.value)
    return InviteAcceptOut(token=fresh, role=user.role, landing=landing_for(user.role))


@router.get("", response_model=list[InviteOut])
async def list_invites(
    inviter: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> list[InviteOut]:
    """Company-scoped list of invites (owner/PM only)."""
    rows = await session.execute(
        select(Invite)
        .where(Invite.company_id == inviter.company_id)
        .order_by(Invite.created_at.desc())
    )
    return [_invite_out(i) for i in rows.scalars().all()]


@router.post("/{invite_id}/revoke", response_model=InviteOut)
async def revoke_invite(
    invite_id: UUID,
    inviter: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> InviteOut:
    invite = await session.get(Invite, invite_id)
    if invite is None or invite.company_id != inviter.company_id:
        raise AppError(404, "not_found", "Invite not found")
    if invite.status is InviteStatus.accepted:
        raise AppError(409, "invite_used", "An accepted invite cannot be revoked")
    invite.status = InviteStatus.revoked
    await session.commit()
    await session.refresh(invite)
    return _invite_out(invite)
