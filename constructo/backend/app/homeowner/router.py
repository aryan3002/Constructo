"""Homeowner-facing API (H0).

The "published slice" the homeowner mobile app consumes. Two rules run through
every endpoint:

* **Contractor is publisher.** Homeowner reads return ONLY curated/published
  rows (``published_photos``, ``updates``, ``weekly_summaries``, ``milestones``,
  ``changes``, the property skeleton) — never raw ``site_events``, headcounts,
  vendor names, or unpublished media.
* **Scope to the member's site.** Every read resolves a single site via
  :func:`app.homeowner.scoping.resolve_site`, which rejects any site the caller
  is not an active member of (a homeowner can never see another property).

AI (captions, weekly summary, design profile, consistency check) is *drafted*
and then confirmed/edited — it never decides. See :mod:`app.homeowner.ai`.
"""
from __future__ import annotations

import os
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.approvals.service import apply_action
from app.approvals.state_machine import DecisionAction
from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.auth.otp import assert_otp_valid
from app.common.errors import AppError
from app.common.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.db import get_session
from app.extraction.llm import LLMClient
from app.extraction.stt import transcribe
from app.homeowner.ai import consistency_check, generate_design_profile_v2, get_llm
from app.homeowner.authority import (
    can_approve,
    can_design,
    can_manage_members,
    capabilities_for,
)
from app.homeowner.design_fingerprint import (
    MemberInfo,
    ReferenceInput,
    SelectionInput,
    build_fingerprint,
)
from app.homeowner.milestone_reference import typical_duration_days
from app.homeowner.quiet import current_confirmed_quiet, visible_quiet_update_ids
from app.homeowner.render import get_translation, render_text
from app.homeowner.schemas import (
    CapabilitiesOut,
    ChangeOut,
    ChangesOut,
    CommentCreateIn,
    CommentOut,
    ComponentOut,
    ConsistencyCheckIn,
    ConsistencyCheckOut,
    DecisionRespondIn,
    DesignConflictOut,
    DesignConflictResolveIn,
    DesignProfileOut,
    DesignProfilePutIn,
    DrawingOut,
    FinishesOut,
    FinishItem,
    HomeOut,
    HomeownerDecisionOut,
    HomeownerMemberInviteIn,
    HomeownerMemberManageIn,
    JoinIn,
    JoinOut,
    MemberCreateIn,
    MemberOut,
    MemberPrefsIn,
    MilestoneOut,
    PhotoOut,
    PropertyOut,
    QuietPeriodOut,
    ReferenceCreateIn,
    ReferenceOut,
    RequestCreateIn,
    RequestOut,
    RequestStatusPatchIn,
    RoomFinishes,
    SelectionCreateIn,
    SelectionOut,
    SpaceOut,
    SpendSummary,
    UpdateOut,
    VisitPhotoPatchIn,
    WeeklySummaryOut,
)
from app.homeowner.scoping import homeowner_site_ids, member_sub_role, resolve_site
from app.homeowner.translation import TranslationClient
from app.models import (
    Change,
    Company,
    Component,
    ComponentStatus,
    Decision,
    DecisionState,
    DesignProfile,
    DesignReference,
    DesignSelection,
    HomeownerMember,
    HomeownerRequest,
    HomeownerSubRole,
    HomeownerVisitPhoto,
    Material,
    MemberStatus,
    Milestone,
    MilestoneStatus,
    PhotoComment,
    Property,
    PublishedDrawing,
    PublishedPhoto,
    QuietPeriod,
    QuietStatus,
    Site,
    Space,
    Spec,
    SpecApprovalStatus,
    Update,
    User,
    UserRole,
    WeeklySummary,
)
from app.storage import get_storage

router = APIRouter(prefix="/api/v1/homeowner", tags=["homeowner"])

DEFAULT_REQUEST_SLA_DAYS = 3
# Max active+invited members per site (founder decision). Counted on the
# (site_id, status) index; a hard gate on the owner-mint invite path.
MEMBER_CAP = 6
# Re-send throttle: a member may be reinvited at most once per this window.
REINVITE_THROTTLE = timedelta(hours=1)

# Calm notification defaults applied server-side by sub_role at invite time,
# so a family member is not paged for every decision/change ([[04]] §3.4).
_CALM_NOTIF_DEFAULTS: dict[HomeownerSubRole, dict] = {
    HomeownerSubRole.family: {"decision_needed": "off", "change": "weekly"},
    HomeownerSubRole.advisor: {"decision_needed": "off", "change": "weekly"},
}


# ---- shared helpers --------------------------------------------------------


def _parse_limit(limit: int) -> int:
    return DEFAULT_LIMIT if limit <= 0 else min(limit, MAX_LIMIT)


def _decode(cursor: str | None) -> str | None:
    try:
        return decode_cursor(cursor)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc


async def require_homeowner(user: User = Depends(get_current_user)) -> User:
    if user.role is not UserRole.homeowner:
        raise AppError(403, "forbidden", "Homeowner role required")
    return user


# --- Ask your home (homeowner grounded Q&A over the PUBLISHED slice) ---------
# The Trust Membrane in question form: she can ask anything, but the answer is
# grounded ONLY in the curated, human-published slice (updates, weekly summaries,
# milestones, changes, photo captions, confirmed quiet periods) — never raw
# events, crew chat, vendor names, or money rates. Calm, her language, digits
# guarded, and an honest "ask your builder" when the record doesn't hold it.
from pydantic import BaseModel as _BaseModel  # noqa: E402


class HomeownerAskIn(_BaseModel):
    question: str
    site_id: UUID | None = None


class HomeownerAskOut(_BaseModel):
    answerable: bool
    answer: str
    sources: int


_HO_ABSTAIN = {
    "en": "I don't see that in your updates yet — want me to ask your builder?",
    "hi": "अभी आपके अपडेट में यह नहीं दिख रहा — क्या मैं आपके बिल्डर से पूछ लूँ?",
}
_HO_SYS = {
    "en": (
        "You are the homeowner's calm project assistant. Answer the question in "
        "ONE or two warm, plain sentences using ONLY the PUBLISHED UPDATES below. "
        "If they don't contain the answer, set grounded=false. NEVER invent a "
        "fact, number, date, cost, or name not in the updates. No jargon. "
        "Answer in English."
    ),
    "hi": (
        "आप घर-मालिक के शांत प्रोजेक्ट सहायक हैं। नीचे दिए गए प्रकाशित अपडेट्स से ही, "
        "एक-दो सरल और भरोसेमंद वाक्यों में जवाब दें। अगर जवाब नहीं है तो grounded=false "
        "रखें। कोई भी तथ्य, संख्या, तारीख, खर्च या नाम न बनाएँ जो अपडेट में न हो। "
        "जवाब हिंदी में दें।"
    ),
}
_HO_SCHEMA = {
    "type": "object",
    "properties": {"answer": {"type": "string"}, "grounded": {"type": "boolean"}},
    "required": ["grounded"],
}


@router.post("/ask", response_model=HomeownerAskOut)
async def homeowner_ask(
    body: HomeownerAskIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> HomeownerAskOut:
    from app.extraction.llm import get_llm_client
    from app.homeowner.numeric_guard import extract_numeric_tokens

    sid = await resolve_site(session, user, body.site_id)
    lang = "hi" if (user.language or "en").lower().startswith("hi") else "en"
    lines: list[str] = []

    for u in (
        await session.execute(
            select(Update).where(Update.site_id == sid)
            .order_by(Update.published_at.desc()).limit(12)
        )
    ).scalars():
        line = f"- Update ({u.published_at.date()}): {u.title}. {(u.body or '').strip()}"
        lines.append(line.strip())
    for w in (
        await session.execute(
            select(WeeklySummary).where(WeeklySummary.site_id == sid)
            .order_by(WeeklySummary.week_start.desc()).limit(4)
        )
    ).scalars():
        lines.append(f"- Weekly summary (week of {w.week_start}): {w.text}")
    for m in (
        await session.execute(
            select(Milestone).where(Milestone.site_id == sid).order_by(Milestone.order)
        )
    ).scalars():
        when = m.completed_on or m.expected_on or m.started_on
        lines.append(f"- Milestone: {m.name} — {m.status.value}{f' ({when})' if when else ''}")
    for c in (
        await session.execute(
            select(Change).where(Change.site_id == sid).order_by(Change.id.desc()).limit(8)
        )
    ).scalars():
        bits = []
        if c.cost_delta is not None:
            bits.append(f"cost {int(c.cost_delta):+d}")
        if c.schedule_delta_days is not None:
            bits.append(f"{c.schedule_delta_days:+d} days")
        tail = f" [{', '.join(bits)}]" if bits else ""
        lines.append(f"- Change: {c.description}{tail}{f' — {c.reason}' if c.reason else ''}")
    for p in (
        await session.execute(
            select(PublishedPhoto).where(
                PublishedPhoto.site_id == sid, PublishedPhoto.caption.is_not(None)
            ).order_by(PublishedPhoto.published_at.desc()).limit(12)
        )
    ).scalars():
        lines.append(f"- Photo{f' [{p.room_tag}]' if p.room_tag else ''}: {p.caption}")
    for q in (
        await session.execute(
            select(QuietPeriod).where(
                QuietPeriod.site_id == sid,
                QuietPeriod.status.in_([QuietStatus.confirmed, QuietStatus.published]),
                QuietPeriod.phase_reason.is_not(None),
            )
        )
    ).scalars():
        lines.append(f"- Quiet period: {q.phase_reason}")

    if not lines:
        return HomeownerAskOut(answerable=False, answer=_HO_ABSTAIN[lang], sources=0)

    context = "\n".join(lines[:40])
    out = await get_llm_client().complete(
        system=_HO_SYS[lang],
        user=f"QUESTION: {body.question}\n\nPUBLISHED UPDATES:\n{context}",
        json_schema=_HO_SCHEMA,
    )
    answer = ((out or {}).get("answer") or "").strip()
    grounded = bool((out or {}).get("grounded"))
    # Digit-safety: the answer may not introduce a number that isn't in the
    # published context (numeric_guard's tokens — no invented ₹/dates).
    ctx_nums = set(extract_numeric_tokens(context))
    digit_safe = set(extract_numeric_tokens(answer)) <= ctx_nums
    if grounded and answer and digit_safe:
        return HomeownerAskOut(answerable=True, answer=answer, sources=len(lines))
    return HomeownerAskOut(answerable=False, answer=_HO_ABSTAIN[lang], sources=len(lines))


def _invite_link(join_code: str) -> str:
    # Deep link the contractor shares; the H1 app reads the code from it.
    return f"constructo://join?code={join_code}"


def _member_out(m: HomeownerMember) -> MemberOut:
    return MemberOut(
        id=m.id,
        site_id=m.site_id,
        user_id=m.user_id,
        sub_role=m.sub_role,
        notif_prefs=dict(m.notif_prefs or {}),
        phone=m.phone,
        join_code=m.join_code,
        status=m.status,
        created_at=m.created_at,
        invite_link=_invite_link(m.join_code),
        display_name=m.display_name,
        can_design=m.can_design,
        design_space_id=m.design_space_id,
        invited_by_member_id=m.invited_by_member_id,
        invited_at=m.invited_at,
    )


async def _can_access_site(session: AsyncSession, user: User, site_id: UUID) -> bool:
    """True if the caller is a homeowner-member of the site, or a contractor who
    can see it. Used by request status updates (both sides act on requests)."""
    if user.role is UserRole.homeowner:
        return site_id in await homeowner_site_ids(session, user)
    from app.sites.router import effective_visible_site_ids

    return site_id in await effective_visible_site_ids(session, user)


# ---- onboarding / membership ----------------------------------------------


@router.post("/join", response_model=JoinOut)
async def join(body: JoinIn, session: AsyncSession = Depends(get_session)) -> JoinOut:
    """Redeem a join code → materialise the homeowner user and a token.

    Public (no bearer): the homeowner proves identity with the join code + phone
    + OTP. Binds the invited member to the (new or existing) homeowner user.
    Returns onboarding-friendly names (property display name + company name) so
    the app can greet the homeowner with their build, not a bare token.
    """
    assert_otp_valid(body.phone, body.otp)

    member = (
        await session.execute(
            select(HomeownerMember).where(HomeownerMember.join_code == body.join_code)
        )
    ).scalar_one_or_none()
    if member is None:
        raise AppError(404, "invalid_code", "Unknown join code")

    site = await session.get(Site, member.site_id)
    if site is None:
        raise AppError(404, "not_found", "Property no longer exists")

    # Find-or-create the homeowner user by phone.
    user = (
        await session.execute(select(User).where(User.phone == body.phone))
    ).scalar_one_or_none()
    if user is None:
        user = User(company_id=site.company_id, phone=body.phone, role=UserRole.homeowner)
        session.add(user)
        await session.flush()

    member.user_id = user.id
    member.status = MemberStatus.active
    if member.phone is None:
        member.phone = body.phone
    # Capture the homeowner's name on first join so Members / Settings show a
    # real name, not a bare phone. Set the canonical User.name, and — if the
    # inviting owner didn't already label this member — the member display_name
    # too (so the roster reads the name without a User join).
    if body.name and body.name.strip():
        clean = body.name.strip()
        if not user.name:
            user.name = clean
        if member.display_name is None:
            member.display_name = clean
    await session.commit()

    # Onboarding enrichment: the property's display name + the building company.
    prop = (
        await session.execute(select(Property).where(Property.site_id == member.site_id))
    ).scalar_one_or_none()
    company = await session.get(Company, site.company_id)

    token = create_access_token(str(user.id), user.role.value)
    return JoinOut(
        token=token,
        site_id=member.site_id,
        sub_role=member.sub_role,
        display_name=prop.display_name if prop is not None else None,
        company_name=company.name if company is not None else None,
    )


@router.post("/members", response_model=MemberOut, status_code=201)
async def create_member(
    body: MemberCreateIn,
    contractor: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MemberOut:
    """Contractor-side: mint a homeowner member + join code for a site they own."""
    if contractor.role not in (UserRole.owner, UserRole.pm):
        raise AppError(403, "forbidden", "Only owner/PM can invite homeowners")
    from app.sites.router import effective_visible_site_ids

    if body.site_id not in await effective_visible_site_ids(session, contractor):
        site = await session.get(Site, body.site_id)
        if site is None or site.company_id != contractor.company_id:
            raise AppError(404, "not_found", "Site not found")
        raise AppError(403, "forbidden", "Site not in scope")

    member = HomeownerMember(
        site_id=body.site_id,
        sub_role=body.sub_role,
        phone=body.phone,
        display_name=body.display_name,
        notif_prefs=body.notif_prefs,
    )
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return _member_out(member)


@router.get("/members", response_model=list[MemberOut])
async def my_memberships(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> list[MemberOut]:
    """The caller's own memberships (one per property they belong to)."""
    rows = (
        await session.execute(
            select(HomeownerMember).where(HomeownerMember.user_id == user.id)
        )
    ).scalars().all()
    return [_member_out(m) for m in rows]


@router.patch("/members/{member_id}", response_model=MemberOut)
async def update_member_prefs(
    member_id: UUID,
    body: MemberPrefsIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> MemberOut:
    """Update the caller's own notification preferences for a membership."""
    member = await session.get(HomeownerMember, member_id)
    if member is None or member.user_id != user.id:
        raise AppError(404, "not_found", "Membership not found")
    member.notif_prefs = body.notif_prefs
    await session.commit()
    await session.refresh(member)
    return _member_out(member)


# ---- member management (owner-minted multi-member household) ----------------


async def _resolve_managed_site(
    session: AsyncSession, user: User, site_id: UUID | None
) -> tuple[UUID, HomeownerSubRole]:
    """Resolve the caller's target site and assert they may manage members on it.

    Returns ``(site_id, caller_sub_role)``. Raises 403 ``manage_forbidden`` when
    the caller is family/advisor (or holds no active membership).
    """
    sid = await resolve_site(session, user, site_id)
    sub_role = await member_sub_role(session, user, sid)
    if sub_role is None or not can_manage_members(sub_role):
        raise AppError(
            403,
            "manage_forbidden",
            "Only a property owner can manage members. You can view and comment.",
        )
    return sid, sub_role


async def _active_primary_count(session: AsyncSession, site_id: UUID) -> int:
    rows = (
        await session.execute(
            select(HomeownerMember.id).where(
                HomeownerMember.site_id == site_id,
                HomeownerMember.sub_role == HomeownerSubRole.primary_owner,
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).all()
    return len(rows)


async def _caller_member_id(
    session: AsyncSession, user: User, site_id: UUID
) -> UUID | None:
    """The caller's highest-ranked active member row id on a site (for invited_by)."""
    rows = (
        await session.execute(
            select(HomeownerMember).where(
                HomeownerMember.user_id == user.id,
                HomeownerMember.site_id == site_id,
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).scalars().all()
    if not rows:
        return None
    best = max(
        rows, key=lambda r: _MANAGE_RANK.get(r.sub_role, 0)
    )
    return best.id


_MANAGE_RANK = {
    HomeownerSubRole.primary_owner: 3,
    HomeownerSubRole.co_owner: 2,
    HomeownerSubRole.advisor: 1,
    HomeownerSubRole.family: 0,
}

# Roles whose grant/revoke is reserved to a primary_owner (co_owners manage
# only family/advisor). Touching these to/from requires caller to be primary.
_PRIMARY_GATED_ROLES = frozenset(
    {HomeownerSubRole.primary_owner, HomeownerSubRole.co_owner}
)


async def _validate_design_space(
    session: AsyncSession, site_id: UUID, design_space_id: UUID | None
) -> None:
    """A room scope must be a space on the same site, else 422 invalid_design_space."""
    if design_space_id is None:
        return
    space = await session.get(Space, design_space_id)
    if space is None or space.site_id != site_id:
        raise AppError(422, "invalid_design_space", "That room is not on this property")


@router.post("/members/invite", response_model=MemberOut, status_code=201)
async def invite_member(
    body: HomeownerMemberInviteIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> MemberOut:
    """Owner-side: a primary/co-owner mints a household member + join code.

    Reuses the same join_code + deep link as the contractor path; the recipient
    redeems via POST /join. ``invited_by_member_id``/``invited_at`` mark the
    owner-mint source. Enforces MEMBER_CAP and the primary-grant guard.
    """
    sid, caller_role = await _resolve_managed_site(session, user, body.site_id)

    # Cap: count active + invited rows on this site (cheap on ix_hm_site_status).
    existing = (
        await session.execute(
            select(HomeownerMember.id).where(HomeownerMember.site_id == sid)
        )
    ).all()
    if len(existing) >= MEMBER_CAP:
        raise AppError(
            409,
            "member_cap_reached",
            f"This property already has the maximum of {MEMBER_CAP} members.",
        )

    # Only a primary may grant primary_owner / co_owner.
    if body.sub_role in _PRIMARY_GATED_ROLES and caller_role is not HomeownerSubRole.primary_owner:
        raise AppError(
            403,
            "cannot_grant_primary",
            "Only a primary owner can add another owner or co-owner.",
        )

    await _validate_design_space(session, sid, body.design_space_id)

    caller_member_id = await _caller_member_id(session, user, sid)
    notif = dict(_CALM_NOTIF_DEFAULTS.get(body.sub_role, {}))
    notif.update(body.notif_prefs or {})

    member = HomeownerMember(
        site_id=sid,
        sub_role=body.sub_role,
        phone=body.phone,
        notif_prefs=notif,
        display_name=body.display_name,
        can_design=body.can_design,
        design_space_id=body.design_space_id,
        invited_by_member_id=caller_member_id,
        invited_at=datetime.now(UTC),
    )
    session.add(member)
    await session.commit()
    await session.refresh(member)
    return _member_out(member)


@router.get("/members/roster", response_model=list[MemberOut])
async def members_roster(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[MemberOut]:
    """All members on a SITE (manager view) — contrast GET /members (caller's own)."""
    sid, _ = await _resolve_managed_site(session, user, site_id)
    rows = (
        await session.execute(
            select(HomeownerMember)
            .where(HomeownerMember.site_id == sid)
            .order_by(HomeownerMember.created_at)
        )
    ).scalars().all()
    return [_member_out(m) for m in rows]


@router.patch("/members/{member_id}/manage", response_model=MemberOut)
async def manage_member(
    member_id: UUID,
    body: HomeownerMemberManageIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> MemberOut:
    """Owner-side: designate role + design participation for a member.

    Guards: caller manages the member's site; primary/co-owner grant or revoke
    reserved to a primary; cannot demote the LAST active primary_owner. The
    self-prefs PATCH (/members/{id}) stays separate.
    """
    member = await session.get(HomeownerMember, member_id)
    if member is None:
        raise AppError(404, "not_found", "Membership not found")
    _, caller_role = await _resolve_managed_site(session, user, member.site_id)

    fields = body.model_fields_set

    if "sub_role" in fields and body.sub_role is not None and body.sub_role != member.sub_role:
        # Only a primary may grant/revoke a primary/co-owner role (either end).
        if (
            body.sub_role in _PRIMARY_GATED_ROLES
            or member.sub_role in _PRIMARY_GATED_ROLES
        ) and caller_role is not HomeownerSubRole.primary_owner:
            raise AppError(
                403,
                "cannot_grant_primary",
                "Only a primary owner can change an owner/co-owner role.",
            )
        # Never demote the last active primary_owner.
        if (
            member.sub_role is HomeownerSubRole.primary_owner
            and member.status is MemberStatus.active
            and body.sub_role is not HomeownerSubRole.primary_owner
            and await _active_primary_count(session, member.site_id) <= 1
        ):
            raise AppError(
                409,
                "last_primary",
                "There must always be at least one primary owner.",
            )
        member.sub_role = body.sub_role

    if "display_name" in fields:
        member.display_name = body.display_name
    if "can_design" in fields and body.can_design is not None:
        member.can_design = body.can_design
    if "design_space_id" in fields:
        await _validate_design_space(session, member.site_id, body.design_space_id)
        member.design_space_id = body.design_space_id

    await session.commit()
    await session.refresh(member)
    return _member_out(member)


@router.delete("/members/{member_id}", status_code=204)
async def remove_member(
    member_id: UUID,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Owner-side: remove a member. Guards last-primary and self-delete.

    Revokes access; site-scoped authored content (selections/requests) is
    retained by design (no cascade on the member row).
    """
    member = await session.get(HomeownerMember, member_id)
    if member is None:
        raise AppError(404, "not_found", "Membership not found")
    await _resolve_managed_site(session, user, member.site_id)

    if member.user_id is not None and member.user_id == user.id:
        raise AppError(403, "cannot_self_delete", "You cannot remove yourself.")

    if (
        member.sub_role is HomeownerSubRole.primary_owner
        and member.status is MemberStatus.active
        and await _active_primary_count(session, member.site_id) <= 1
    ):
        raise AppError(
            409,
            "last_primary",
            "There must always be at least one primary owner.",
        )

    await session.delete(member)
    await session.commit()


@router.post("/members/{member_id}/reinvite", response_model=MemberOut)
async def reinvite_member(
    member_id: UUID,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> MemberOut:
    """Owner-side: re-send an invite. join_code stays stable; bumps invited_at.

    Throttled to once per REINVITE_THROTTLE; an already-active member 409s.
    """
    member = await session.get(HomeownerMember, member_id)
    if member is None:
        raise AppError(404, "not_found", "Membership not found")
    await _resolve_managed_site(session, user, member.site_id)

    if member.status is MemberStatus.active:
        raise AppError(409, "already_active", "This member has already joined.")

    now = datetime.now(UTC)
    if member.invited_at is not None and (now - member.invited_at) < REINVITE_THROTTLE:
        raise AppError(429, "reinvite_throttled", "Please wait before resending the invite.")

    member.invited_at = now
    await session.commit()
    await session.refresh(member)
    return _member_out(member)


# ---- property skeleton builder (shared by /home and /property) -------------


async def _property_out(session: AsyncSession, site_id: UUID) -> PropertyOut | None:
    prop = (
        await session.execute(select(Property).where(Property.site_id == site_id))
    ).scalar_one_or_none()
    if prop is None:
        return None

    spaces = list(
        (
            await session.execute(
                select(Space).where(Space.site_id == site_id).order_by(Space.order, Space.name)
            )
        ).scalars().all()
    )
    space_ids = [s.id for s in spaces]
    components_by_space: dict[UUID, list[Component]] = {sid: [] for sid in space_ids}
    if space_ids:
        comp_rows = (
            await session.execute(
                select(Component).where(Component.space_id.in_(space_ids)).order_by(Component.name)
            )
        ).scalars().all()
        for c in comp_rows:
            components_by_space.setdefault(c.space_id, []).append(c)

    space_outs: list[SpaceOut] = []
    for s in spaces:
        comps = components_by_space.get(s.id, [])
        done = sum(1 for c in comps if c.status is ComponentStatus.done)
        progress = (done / len(comps)) if comps else None
        space_outs.append(
            SpaceOut(
                id=s.id,
                site_id=s.site_id,
                parent_id=s.parent_id,
                name=s.name,
                kind=str(s.kind),
                order=s.order,
                components=[
                    ComponentOut(id=c.id, name=c.name, kind=c.kind, status=c.status)
                    for c in comps
                ],
                progress=progress,
            )
        )

    return PropertyOut(
        id=prop.id,
        site_id=prop.site_id,
        display_name=prop.display_name,
        type=prop.type,
        status=prop.status,
        started_on=prop.started_on,
        expected_handover_on=prop.expected_handover_on,
        spaces=space_outs,
    )


# ---- feed reads ------------------------------------------------------------


@router.get("/home", response_model=HomeOut)
async def home(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    translation: TranslationClient = Depends(get_translation),
    site_id: UUID | None = Query(None),
) -> HomeOut:
    """The daily 'am I okay?' dashboard. Conditional sections are empty when bare."""
    sid = await resolve_site(session, user, site_id)

    prop = await _property_out(session, sid)

    milestone_now = (
        await session.execute(
            select(Milestone)
            .where(Milestone.site_id == sid, Milestone.status == MilestoneStatus.now)
            .order_by(Milestone.order)
        )
    ).scalars().first()
    milestone_next = (
        await session.execute(
            select(Milestone)
            .where(Milestone.site_id == sid, Milestone.status == MilestoneStatus.upcoming)
            .order_by(Milestone.order)
        )
    ).scalars().first()

    # Needs attention: pending decisions on this site (homeowner questions +
    # generic asks). One-at-a-time on the client; we return them oldest-first.
    attention_rows = (
        await session.execute(
            select(Decision)
            .where(
                Decision.site_id == sid,
                Decision.state.in_([DecisionState.pending, DecisionState.escalated]),
            )
            .order_by(Decision.created_at)
        )
    ).scalars().all()

    # Exclude quiet updates whose window is not yet contractor-confirmed — a
    # draft quiet card must never surface on the homeowner dashboard.
    visible_quiet = await visible_quiet_update_ids(session, sid)
    recent = (
        await session.execute(
            select(Update)
            .where(
                Update.site_id == sid,
                _quiet_visible_filter(visible_quiet),
            )
            .order_by(Update.published_at.desc())
            .limit(5)
        )
    ).scalars().all()

    quiet_window = await current_confirmed_quiet(session, sid)

    changes = (
        await session.execute(select(Change).where(Change.site_id == sid))
    ).scalars().all()
    spend = None
    if changes:
        total = sum(float(c.cost_delta) for c in changes if c.cost_delta is not None)
        spend = SpendSummary(total_change_cost_delta=total, change_count=len(changes))

    recent_activity = [
        await _render_update(session, translation, user.language, _update_out(u))
        for u in recent
    ]
    quiet_out = None
    if quiet_window:
        quiet_out = await _render_quiet(
            session, translation, user.language, _quiet_out(quiet_window)
        )

    return HomeOut(
        property=prop,
        milestone_now=_milestone_out(milestone_now) if milestone_now else None,
        milestone_next=_milestone_out(milestone_next) if milestone_next else None,
        needs_attention=[
            {
                "id": d.id,
                "title": _strip_tag(d.title),
                "detail": _humanize_detail(d.detail),
                "kind": str(d.kind),
                "created_at": d.created_at,
            }
            for d in attention_rows
        ],
        recent_activity=recent_activity,
        spend_summary=spend,
        quiet=quiet_out,
    )


def _strip_tag(title: str) -> str:
    """Hide internal sweep tags (e.g. '[permit-alert]...') from the homeowner."""
    if title.startswith("["):
        # Drop leading bracketed tags like "[homeowner-request-nudge][id] ".
        idx = title.rfind("] ")
        if idx != -1:
            return title[idx + 2 :]
    return title


# Internal risk/decision *kind* tokens that must NEVER reach the homeowner as
# raw enum strings (the calm "why this is coming up now" copy). Real-data import
# paths have leaked bare tokens like "unverified_invoice" into Decision.detail;
# this maps the known ones to plain, reassuring language and humanises any other
# bare snake_case token as a last resort.
_DECISION_REASON_LABELS = {
    "unverified_invoice": "An invoice came in that doesn't match what was delivered yet.",
    "pending_approval": "This is waiting for your approval.",
    "labor_shortfall": "Fewer workers showed up than planned.",
    "data_quality": "Some details still need to be confirmed.",
}


def _humanize_detail(detail: str | None) -> str | None:
    """Turn a leaked internal token into homeowner-safe copy; pass prose through.

    A real "detail" is a full sentence (has spaces / punctuation) and is returned
    unchanged. Only a bare single-token enum value (no spaces) is rewritten.
    """
    if not detail:
        return detail
    token = detail.strip()
    if " " in token:  # already human prose
        return detail
    if token in _DECISION_REASON_LABELS:
        return _DECISION_REASON_LABELS[token]
    # Unknown bare token (e.g. "some_internal_kind") -> "Some internal kind".
    if "_" in token and token == token.lower():
        return token.replace("_", " ").capitalize()
    return detail


def _milestone_out(m: Milestone) -> MilestoneOut:
    return MilestoneOut(
        id=m.id,
        site_id=m.site_id,
        name=m.name,
        status=m.status,
        started_on=m.started_on,
        expected_on=m.expected_on,
        completed_on=m.completed_on,
        order=m.order,
        typical_duration_days=typical_duration_days(m.name),
    )


def _photo_out(p: PublishedPhoto) -> PhotoOut:
    return PhotoOut(
        id=p.id,
        site_id=p.site_id,
        # Resolve bare storage keys (R2/local) to a fetchable URL; full http(s)
        # URLs (e.g. seeded picsum links) pass through url_for unchanged.
        image_url=get_storage().url_for(p.image_url) or p.image_url,
        caption=p.caption,
        room_tag=p.room_tag,
        milestone_id=p.milestone_id,
        is_starred=p.is_starred,
        published_at=p.published_at,
    )


def _visit_photo_out(p: HomeownerVisitPhoto) -> PhotoOut:
    """A homeowner's own upload, served with a presigned GET URL (private bucket)."""
    return PhotoOut(
        id=p.id,
        site_id=p.site_id,
        image_url=get_storage().url_for(p.storage_key) or "",
        caption=p.caption,
        room_tag=p.room_tag,
        milestone_id=None,
        is_starred=False,
        published_at=p.created_at,
    )


def _update_out(u: Update) -> UpdateOut:
    return UpdateOut(
        id=u.id, site_id=u.site_id, type=u.type, title=u.title, body=u.body,
        published_at=u.published_at,
        revised_date=u.revised_date, impact_days=u.impact_days,
        impact_cost_delta=float(u.impact_cost_delta) if u.impact_cost_delta is not None else None,
        reason=u.reason,
    )


def _quiet_visible_filter(visible_quiet_ids: set[UUID]):
    """SQL predicate keeping all non-quiet updates plus only the quiet updates
    whose window is contractor-confirmed (the gate, enforced at the query layer).
    """
    from app.models import UpdateType

    if visible_quiet_ids:
        return (Update.type != UpdateType.quiet) | (Update.id.in_(visible_quiet_ids))
    return Update.type != UpdateType.quiet


def _quiet_out(q: QuietPeriod) -> QuietPeriodOut:
    return QuietPeriodOut(
        id=q.id,
        site_id=q.site_id,
        status=str(q.status),
        gap_days=q.gap_days,
        reason=q.published_text or q.draft_text or q.phase_reason,
        last_signal_at=q.last_signal_at,
        next_expected_at=q.next_expected_at,
        detected_at=q.detected_at,
    )


# ---- read-path translation (Slice T): render published text in the reader's
# language. The contractor's SOURCE stays English; the homeowner reads HERS. The
# numeric guard inside ``render_text`` keeps digits/dates/rupees byte-identical.


async def _render_photo(
    session: AsyncSession, client: TranslationClient, lang: str | None, p: PhotoOut
) -> PhotoOut:
    caption = await render_text(
        session, client, canonical=p.caption, lang=lang,
        source_table="published_photos", source_id=p.id, source_field="caption",
    )
    return p if caption == p.caption else p.model_copy(update={"caption": caption})


async def _render_update(
    session: AsyncSession, client: TranslationClient, lang: str | None, u: UpdateOut
) -> UpdateOut:
    title = await render_text(
        session, client, canonical=u.title, lang=lang,
        source_table="updates", source_id=u.id, source_field="title",
    )
    body = await render_text(
        session, client, canonical=u.body, lang=lang,
        source_table="updates", source_id=u.id, source_field="body",
    )
    # The structured delay reason is plain-language too — translate it (the numeric
    # guard keeps any embedded dates/rupees byte-identical). The numeric fields
    # (revised_date, impact_*) are never translated; the client formats them.
    reason = await render_text(
        session, client, canonical=u.reason, lang=lang,
        source_table="updates", source_id=u.id, source_field="reason",
    )
    if title == u.title and body == u.body and reason == u.reason:
        return u
    return u.model_copy(update={"title": title, "body": body, "reason": reason})


async def _render_weekly(
    session: AsyncSession, client: TranslationClient, lang: str | None, w: WeeklySummaryOut
) -> WeeklySummaryOut:
    text = await render_text(
        session, client, canonical=w.text, lang=lang,
        source_table="weekly_summaries", source_id=w.id, source_field="text",
    )
    return w if text == w.text else w.model_copy(update={"text": text})


async def _render_quiet(
    session: AsyncSession, client: TranslationClient, lang: str | None, q: QuietPeriodOut
) -> QuietPeriodOut:
    reason = await render_text(
        session, client, canonical=q.reason, lang=lang,
        source_table="quiet_periods", source_id=q.id, source_field="reason",
    )
    return q if reason == q.reason else q.model_copy(update={"reason": reason})


async def _paginate(
    session: AsyncSession,
    stmt,
    cursor: str | None,
    limit: int,
    id_attr,
    to_out: Callable,
):
    """Generic id-cursor pagination over an ordered statement."""
    page_size = _parse_limit(limit)
    after = _decode(cursor)
    if after is not None:
        stmt = stmt.where(id_attr > UUID(after))
    stmt = stmt.limit(page_size + 1)
    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))
    return [to_out(r) for r in rows], next_cursor


@router.get("/photos", response_model=Page[PhotoOut])
async def photos(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    translation: TranslationClient = Depends(get_translation),
    site_id: UUID | None = Query(None),
    view: str = Query("all"),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[PhotoOut]:
    """Photos for the client tabs. ``view`` = all/room/milestone are the curated
    contractor feed; ``mine`` is the homeowner's own uploads (R1, presigned)."""
    sid = await resolve_site(session, user, site_id)
    if view == "mine":
        # "My visits" — the caller's own uploaded photos, newest first. No
        # translation (her own captions); image_url is a presigned GET.
        member_id = await _caller_member_id(session, user, sid)
        stmt = (
            select(HomeownerVisitPhoto)
            .where(
                HomeownerVisitPhoto.site_id == sid,
                HomeownerVisitPhoto.member_id == member_id,
            )
            .order_by(HomeownerVisitPhoto.created_at.desc(), HomeownerVisitPhoto.id)
        )
        items, next_cursor = await _paginate(
            session, stmt, cursor, limit, HomeownerVisitPhoto.id, _visit_photo_out
        )
        return Page[PhotoOut](items=items, next_cursor=next_cursor)
    stmt = select(PublishedPhoto).where(PublishedPhoto.site_id == sid)
    if view == "room":
        stmt = stmt.order_by(PublishedPhoto.room_tag, PublishedPhoto.published_at.desc(),
                             PublishedPhoto.id)
    elif view == "milestone":
        stmt = stmt.order_by(PublishedPhoto.milestone_id, PublishedPhoto.published_at.desc(),
                             PublishedPhoto.id)
    else:
        stmt = stmt.order_by(PublishedPhoto.published_at.desc(), PublishedPhoto.id)
    items, next_cursor = await _paginate(
        session, stmt, cursor, limit, PublishedPhoto.id, _photo_out
    )
    items = [await _render_photo(session, translation, user.language, p) for p in items]
    return Page[PhotoOut](items=items, next_cursor=next_cursor)


HOMEOWNER_MAX_PHOTO_BYTES = 12 * 1024 * 1024  # 12 MB — generous for a phone photo


def _photo_ext(content_type: str | None, filename: str | None) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext:
        return ext
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/heic": ".heic",
        "image/gif": ".gif",
    }.get((content_type or "").lower(), ".jpg")


@router.post("/photos", response_model=PhotoOut, status_code=201)
async def upload_visit_photo(
    media: UploadFile = File(...),
    caption: str | None = Form(default=None),
    room_tag: str | None = Form(default=None),
    site_id: UUID | None = Form(default=None),
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> PhotoOut:
    """Upload a homeowner "site visit" photo (R1, the My-visits tab).

    The server streams the file to object storage (R2; PRIVATE bucket) and stores
    only the key — reads come back as short-lived presigned GET URLs. Any active
    household member may upload their own visit photos.
    """
    sid = await resolve_site(session, user, site_id)
    member_id = await _caller_member_id(session, user, sid)

    if not (media.content_type or "").lower().startswith("image/"):
        raise AppError(415, "unsupported_media", "Only image uploads are allowed")
    data = await media.read()
    if len(data) > HOMEOWNER_MAX_PHOTO_BYTES:
        raise AppError(413, "media_too_large", "Photo exceeds 12 MB")

    key = f"homeowner/{sid}/{uuid4().hex}{_photo_ext(media.content_type, media.filename)}"
    get_storage().put_bytes(key, data, media.content_type or "application/octet-stream")

    row = HomeownerVisitPhoto(
        site_id=sid,
        member_id=member_id,
        storage_key=key,
        caption=(caption.strip() if caption and caption.strip() else None),
        room_tag=(room_tag.strip() if room_tag and room_tag.strip() else None),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _visit_photo_out(row)


HOMEOWNER_MAX_VOICE_BYTES = 20 * 1024 * 1024  # 20 MB — generous for a short note


def _voice_ext(content_type: str | None, filename: str | None) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext:
        return ext
    return {
        "audio/mp4": ".m4a",
        "audio/m4a": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/aac": ".aac",
        "audio/mpeg": ".mp3",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/webm": ".webm",
        "audio/ogg": ".ogg",
    }.get((content_type or "").lower(), ".m4a")


@router.post("/voice-notes", status_code=201)
async def upload_voice_note(
    media: UploadFile = File(...),
    site_id: UUID | None = Form(default=None),
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str | None]:
    """Upload a voice note for an issue/request and (best-effort) transcribe it.

    The audio streams to the PRIVATE media bucket under
    ``homeowner/<site>/voice/<uuid>.<ext>``; only the key is persisted. We then
    presign a short-lived GET and run STT — if no STT provider is configured the
    transcript comes back empty and the caller simply keeps the audio (graceful
    degradation). The returned ``voice_key`` is passed to POST /requests to
    attach the note; ``voice_url`` lets the caller play it back immediately.
    """
    sid = await resolve_site(session, user, site_id)
    ct = (media.content_type or "").lower()
    if not (ct.startswith("audio/") or ct == "application/octet-stream"):
        raise AppError(415, "unsupported_media", "Only audio uploads are allowed")
    data = await media.read()
    if len(data) > HOMEOWNER_MAX_VOICE_BYTES:
        raise AppError(413, "media_too_large", "Voice note exceeds 20 MB")

    key = f"homeowner/{sid}/voice/{uuid4().hex}{_voice_ext(media.content_type, media.filename)}"
    storage = get_storage()
    storage.put_bytes(key, data, media.content_type or "audio/mp4")

    url = storage.url_for(key)
    transcript = ""
    if url:
        lang_hint = "hi" if (user.language or "").lower().startswith("hi") else "en"
        try:
            transcript = (await transcribe(url, lang_hint=lang_hint)).strip()
        except Exception:
            # STT is best-effort — never fail the upload over a transcription error.
            transcript = ""
    return {"voice_key": key, "transcript": transcript, "voice_url": url}


@router.patch("/photos/{photo_id}", response_model=PhotoOut)
async def update_visit_photo(
    photo_id: UUID,
    body: VisitPhotoPatchIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> PhotoOut:
    """Re-tag one of the caller's OWN visit photos with a room/area."""
    sid = await resolve_site(session, user, site_id)
    member_id = await _caller_member_id(session, user, sid)
    row = await session.get(HomeownerVisitPhoto, photo_id)
    if row is None or row.site_id != sid or row.member_id != member_id:
        raise AppError(404, "not_found", "Photo not found")
    row.room_tag = body.room_tag.strip() if body.room_tag and body.room_tag.strip() else None
    await session.commit()
    await session.refresh(row)
    return _visit_photo_out(row)


@router.delete("/photos/{photo_id}", status_code=204)
async def delete_visit_photo(
    photo_id: UUID,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> None:
    """Delete one of the caller's OWN visit photos (and its stored object)."""
    sid = await resolve_site(session, user, site_id)
    member_id = await _caller_member_id(session, user, sid)
    row = await session.get(HomeownerVisitPhoto, photo_id)
    if row is None or row.site_id != sid or row.member_id != member_id:
        raise AppError(404, "not_found", "Photo not found")
    key = row.storage_key
    await session.delete(row)
    await session.commit()
    try:
        get_storage().delete(key)
    except Exception:
        pass  # best-effort; the DB row is already gone


# ── Photo comments (threaded conversation on a published feed photo) ──────────

def _comment_out(c: PhotoComment, caller_member_id: UUID | None) -> CommentOut:
    return CommentOut(
        id=c.id,
        photo_id=c.photo_id,
        author_name=c.author_name,
        author_role=c.author_role,
        body=c.body,
        created_at=c.created_at,
        is_mine=c.member_id is not None and c.member_id == caller_member_id,
    )


async def _published_photo_on_site(
    session: AsyncSession, photo_id: UUID, sid: UUID
) -> PublishedPhoto:
    photo = await session.get(PublishedPhoto, photo_id)
    if photo is None or photo.site_id != sid:
        raise AppError(404, "not_found", "Photo not found")
    return photo


@router.get("/photos/{photo_id}/comments", response_model=list[CommentOut])
async def list_photo_comments(
    photo_id: UUID,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[CommentOut]:
    """The comment thread on a published photo (oldest → newest)."""
    sid = await resolve_site(session, user, site_id)
    await _published_photo_on_site(session, photo_id, sid)
    mid = await _caller_member_id(session, user, sid)
    rows = (
        await session.execute(
            select(PhotoComment)
            .where(PhotoComment.photo_id == photo_id)
            .order_by(PhotoComment.created_at)
        )
    ).scalars().all()
    return [_comment_out(c, mid) for c in rows]


@router.post("/photos/{photo_id}/comments", response_model=CommentOut, status_code=201)
async def add_photo_comment(
    photo_id: UUID,
    body: CommentCreateIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> CommentOut:
    """Add a comment to a published photo. Commenting is always open to every
    active member (authority.py); the author's name + role are snapshotted."""
    sid = await resolve_site(session, user, site_id)
    await _published_photo_on_site(session, photo_id, sid)
    mid = await _caller_member_id(session, user, sid)
    member = await session.get(HomeownerMember, mid) if mid else None
    row = PhotoComment(
        site_id=sid,
        photo_id=photo_id,
        member_id=mid,
        author_name=(member.display_name if member else None) or user.name,
        author_role=(member.sub_role.value if member and member.sub_role else None),
        body=body.body.strip(),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _comment_out(row, mid)


@router.get("/updates", response_model=Page[UpdateOut])
async def updates(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    translation: TranslationClient = Depends(get_translation),
    site_id: UUID | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[UpdateOut]:
    """The Project Updates timeline (newest first)."""
    sid = await resolve_site(session, user, site_id)
    visible_quiet = await visible_quiet_update_ids(session, sid)
    stmt = (
        select(Update)
        .where(Update.site_id == sid, _quiet_visible_filter(visible_quiet))
        .order_by(Update.published_at.desc(), Update.id)
    )
    items, next_cursor = await _paginate(session, stmt, cursor, limit, Update.id, _update_out)
    items = [await _render_update(session, translation, user.language, u) for u in items]
    return Page[UpdateOut](items=items, next_cursor=next_cursor)


@router.get("/weekly-summary", response_model=list[WeeklySummaryOut])
async def weekly_summary(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    translation: TranslationClient = Depends(get_translation),
    site_id: UUID | None = Query(None),
) -> list[WeeklySummaryOut]:
    """Weekly digest cards, most recent week first."""
    sid = await resolve_site(session, user, site_id)
    rows = (
        await session.execute(
            select(WeeklySummary)
            .where(WeeklySummary.site_id == sid)
            .order_by(WeeklySummary.week_start.desc())
        )
    ).scalars().all()
    outs = [
        WeeklySummaryOut(
            id=w.id, site_id=w.site_id, week_start=w.week_start, text=w.text,
            published_at=w.published_at,
        )
        for w in rows
    ]
    return [await _render_weekly(session, translation, user.language, w) for w in outs]


@router.get("/changes", response_model=ChangesOut)
async def changes(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> ChangesOut:
    """The changes/cost log with running totals (rupees / days)."""
    sid = await resolve_site(session, user, site_id)
    rows = (
        await session.execute(
            select(Change).where(Change.site_id == sid).order_by(Change.created_at.desc())
        )
    ).scalars().all()

    # Collect all UUID references for a single batch User name lookup.
    uuid_refs: set[UUID] = set()
    for c in rows:
        if c.approved_by is not None:
            uuid_refs.add(c.approved_by)
        if c.requested_by is not None:
            uuid_refs.add(c.requested_by)

    name_map: dict[UUID, str | None] = {}
    if uuid_refs:
        user_rows = (
            await session.execute(
                select(User).where(User.id.in_(uuid_refs))
            )
        ).scalars().all()
        for u in user_rows:
            name_map[u.id] = u.name

    # Build items (newest-first, running_total_cost placeholder = 0.0 for now).
    raw_items = [
        ChangeOut(
            id=c.id, site_id=c.site_id, description=c.description,
            cost_delta=float(c.cost_delta) if c.cost_delta is not None else None,
            schedule_delta_days=c.schedule_delta_days, reason=c.reason,
            approved_by=c.approved_by,
            requested_by=c.requested_by,
            approved_by_name=name_map.get(c.approved_by) if c.approved_by else None,
            requested_by_name=name_map.get(c.requested_by) if c.requested_by else None,
            running_total_cost=0.0,
            created_at=c.created_at,
        )
        for c in rows
    ]

    # Accumulate running total oldest-to-newest, then re-reverse to display
    # newest-first (matches the created_at.desc() query order).
    running = 0.0
    items_asc: list[ChangeOut] = []
    for item in reversed(raw_items):
        running += item.cost_delta or 0.0
        items_asc.append(item.model_copy(update={"running_total_cost": running}))
    items = list(reversed(items_asc))

    total_cost = sum(i.cost_delta for i in items if i.cost_delta is not None)
    total_days = sum(i.schedule_delta_days for i in items if i.schedule_delta_days is not None)
    return ChangesOut(
        items=items, total_cost_delta=total_cost, total_schedule_delta_days=total_days
    )


@router.get("/milestones", response_model=list[MilestoneOut])
async def milestones(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[MilestoneOut]:
    sid = await resolve_site(session, user, site_id)
    rows = (
        await session.execute(
            select(Milestone).where(Milestone.site_id == sid).order_by(Milestone.order)
        )
    ).scalars().all()
    return [_milestone_out(m) for m in rows]


def _drawing_out(d: PublishedDrawing) -> DrawingOut:
    return DrawingOut(
        id=d.id,
        site_id=d.site_id,
        title=d.title,
        version=d.version,
        file_url=d.file_url,
        kind=d.kind,
        published_by=d.published_by,
        published_at=d.published_at,
        plain_summary_en=d.plain_summary_en,
        plain_summary_hi=d.plain_summary_hi,
        change_note=d.change_note,
        supersedes_id=d.supersedes_id,
    )


@router.get("/drawings", response_model=list[DrawingOut])
async def drawings(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[DrawingOut]:
    """The published drawings/plans for a property (newest first), read-only.

    The contractor publishes via ``POST /api/v1/publish/drawings``; this is the
    homeowner-visible slice (scoped via ``resolve_site``). NOTE (follow-up): the
    full homeowner plans-APPROVAL flow (the disabled approve path) is out of
    scope for C3 — this only exposes the read so the data is available to the
    homeowner app.
    """
    sid = await resolve_site(session, user, site_id)
    rows = (
        await session.execute(
            select(PublishedDrawing)
            .where(PublishedDrawing.site_id == sid)
            .order_by(PublishedDrawing.published_at.desc(), PublishedDrawing.id)
        )
    ).scalars().all()
    return [_drawing_out(d) for d in rows]


@router.get("/quiet-periods", response_model=list[QuietPeriodOut])
async def quiet_periods(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    translation: TranslationClient = Depends(get_translation),
    site_id: UUID | None = Query(None),
) -> list[QuietPeriodOut]:
    """Contractor-confirmed quiet cards for a property (most recent first).

    Only confirmed/published windows are returned — a draft pending contractor
    confirm never reaches the homeowner. These drive the calm "nothing new to
    see — here's why" empty states on Home / Photos / Updates.
    """
    sid = await resolve_site(session, user, site_id)
    rows = (
        await session.execute(
            select(QuietPeriod)
            .where(
                QuietPeriod.site_id == sid,
                QuietPeriod.status.in_((QuietStatus.confirmed, QuietStatus.published)),
            )
            .order_by(QuietPeriod.detected_at.desc())
        )
    ).scalars().all()
    return [
        await _render_quiet(session, translation, user.language, _quiet_out(q)) for q in rows
    ]


@router.get("/property", response_model=PropertyOut)
async def property_overview(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> PropertyOut:
    """The property skeleton (rooms) with per-space progress."""
    sid = await resolve_site(session, user, site_id)
    prop = await _property_out(session, sid)
    if prop is None:
        raise AppError(404, "not_found", "No property published yet")
    return prop


@router.get("/finishes", response_model=FinishesOut)
async def finishes(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> FinishesOut:
    """Room-by-room material finishes for the homeowner — read-only, cost-firewalled.

    Returns approved + pending specs (rejected are excluded), grouped by room
    (Space.name). Cost fields (unit_rate, wastage_pct, line_total) are absent
    from the schema by design — the homeowner never sees money.

    Room narrowing: if the caller's member row has ``design_space_id`` set, only
    finishes for that room are returned (mirrors the design write gate).
    """
    sid = await resolve_site(session, user, site_id)

    # Resolve the caller's member row to check for room-narrowing.
    member_rows = (
        await session.execute(
            select(HomeownerMember).where(
                HomeownerMember.user_id == user.id,
                HomeownerMember.site_id == sid,
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).scalars().all()
    # Use the highest-ranked row (matches _MANAGE_RANK); if it carries a
    # design_space_id, narrow the query to that room only.
    scoped_space_id: UUID | None = None
    if member_rows:
        best = max(member_rows, key=lambda r: _MANAGE_RANK.get(r.sub_role, 0))
        scoped_space_id = best.design_space_id

    stmt = (
        select(Spec, Component.name, Space.name, Space.id, Material)
        .join(Component, Component.id == Spec.component_id)
        .join(Space, Space.id == Component.space_id)
        .outerjoin(Material, Material.id == Spec.material_id)
        .where(
            Spec.site_id == sid,
            Spec.approval_status != SpecApprovalStatus.rejected,
        )
        .order_by(Space.name, Spec.created_at)
    )
    if scoped_space_id is not None:
        stmt = stmt.where(Space.id == scoped_space_id)

    rows = (await session.execute(stmt)).all()

    # Status projection: approved → "chosen", pending → "deciding".
    _STATUS_MAP = {
        SpecApprovalStatus.approved: "chosen",
        SpecApprovalStatus.pending: "deciding",
    }

    rooms_map: dict[str, list[FinishItem]] = {}
    room_order: list[str] = []
    for spec, comp_name, space_name, _space_id, material in rows:
        category = (material.category if material is not None else None) or spec.label
        item = FinishItem(
            element=comp_name,
            category=category,
            brand=material.brand if material is not None else None,
            colour=material.colour if material is not None else None,
            finish=material.finish if material is not None else None,
            qty=spec.qty,
            unit=spec.unit,
            status=_STATUS_MAP.get(spec.approval_status, "deciding"),
            client_final_code=spec.client_final_code,
        )
        if space_name not in rooms_map:
            rooms_map[space_name] = []
            room_order.append(space_name)
        rooms_map[space_name].append(item)

    return FinishesOut(
        rooms=[RoomFinishes(room=name, items=rooms_map[name]) for name in room_order]
    )


# ---- design ----------------------------------------------------------------


async def _gate_design_write(
    session: AsyncSession, user: User, site_id: UUID, target_space_id: UUID | None
) -> None:
    """Enforce design-participation on a write.

    Owners/co-owners pass unconditionally. Any other member needs an active row
    with ``can_design=true``; a room-scoped grant (``design_space_id`` set) may
    write only to that space. DEGRADE-copy 403s, never a grey lock.
    """
    rows = (
        await session.execute(
            select(HomeownerMember).where(
                HomeownerMember.user_id == user.id,
                HomeownerMember.site_id == site_id,
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).scalars().all()
    if not rows:
        raise AppError(403, "forbidden", "Property not in scope")

    sub_role = max((r.sub_role for r in rows), key=lambda r: _MANAGE_RANK.get(r, 0))
    flag = any(r.can_design for r in rows)
    if not can_design(sub_role, flag):
        raise AppError(
            403,
            "design_forbidden",
            "You can view and comment on the design — ask an owner to give you a say.",
        )
    # Owners/co-owners ignore room scope; for a narrowed member enforce the room.
    if not can_manage_members(sub_role):
        scoped = [r.design_space_id for r in rows if r.can_design and r.design_space_id]
        if scoped and target_space_id not in scoped:
            raise AppError(
                403,
                "design_room_only",
                "You can only edit the room you were given a say in.",
            )


async def _resolve_actor_member_id(
    session: AsyncSession, user: User, site_id: UUID, target_space_id: UUID | None
) -> UUID | None:
    """The caller's member row id to stamp on a design write (attribution).

    Prefers a row whose ``design_space_id`` matches ``target_space_id`` (so a
    room-scoped grant is attributed to the right scope), else the highest-ranked
    active row. Returns None only if the caller holds no active membership (the
    write gate has already rejected that case).
    """
    rows = (
        await session.execute(
            select(HomeownerMember).where(
                HomeownerMember.user_id == user.id,
                HomeownerMember.site_id == site_id,
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).scalars().all()
    if not rows:
        return None
    if target_space_id is not None:
        scoped = next((r for r in rows if r.design_space_id == target_space_id), None)
        if scoped is not None:
            return scoped.id
    return max(rows, key=lambda r: _MANAGE_RANK.get(r.sub_role, 0)).id


async def _build_site_fingerprint(session: AsyncSession, site_id: UUID) -> dict:
    """Assemble the deterministic multi-member fingerprint for a site (the reducer).

    Reads every selection/reference + the member roster, hands the attributed
    rows to the pure :func:`build_fingerprint`, and returns its jsonb dict. No LLM
    here — this is the trust firewall.
    """
    selections = (
        await session.execute(
            select(DesignSelection)
            .where(DesignSelection.site_id == site_id)
            .order_by(DesignSelection.created_at, DesignSelection.id)
        )
    ).scalars().all()
    refs = (
        await session.execute(
            select(DesignReference)
            .where(DesignReference.site_id == site_id)
            .order_by(DesignReference.created_at, DesignReference.id)
        )
    ).scalars().all()
    member_rows = (
        await session.execute(
            select(HomeownerMember).where(HomeownerMember.site_id == site_id)
        )
    ).scalars().all()
    members = {
        m.id: MemberInfo(
            id=m.id,
            sub_role=m.sub_role,
            can_design=m.can_design,
            design_space_id=m.design_space_id,
            display_name=m.display_name,
        )
        for m in member_rows
    }
    fingerprint = build_fingerprint(
        selections=[
            SelectionInput(
                item=s.item, choice=s.choice,
                actor_member_id=s.actor_member_id, space_id=s.space_id,
                status=s.status,
            )
            for s in selections
        ],
        references=[
            ReferenceInput(actor_member_id=r.actor_member_id, room_tag=r.room_tag)
            for r in refs
        ],
        members=members,
    )
    return fingerprint.as_dict()


@router.get("/design/profile", response_model=DesignProfileOut)
async def get_design_profile(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> DesignProfileOut:
    sid = await resolve_site(session, user, site_id)
    row = (
        await session.execute(select(DesignProfile).where(DesignProfile.site_id == sid))
    ).scalar_one_or_none()
    if row is None:
        return DesignProfileOut(
            id=None, site_id=sid, profile={}, created_at=None, updated_at=None
        )
    return DesignProfileOut(
        id=row.id, site_id=row.site_id, profile=dict(row.profile or {}),
        created_at=row.created_at, updated_at=row.updated_at,
    )


@router.put("/design/profile", response_model=DesignProfileOut)
async def put_design_profile(
    body: DesignProfilePutIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> DesignProfileOut:
    """Save a confirmed profile, or AI-draft one from current selections + refs.

    Honest-AI: when ``profile`` is omitted the server drafts from intake; the
    homeowner then confirms/adjusts and PUTs the final ``profile`` back.
    """
    sid = await resolve_site(session, user, site_id=body.site_id)

    if body.profile is not None:
        profile_data = body.profile
    else:
        # Reduce all members' attributed inputs to one deterministic fingerprint
        # (the trust firewall), then let the LLM rephrase ONLY those facts into a
        # DRAFT the primary confirms — conflicts are surfaced, never resolved.
        fingerprint = await _build_site_fingerprint(session, sid)
        profile_data = await generate_design_profile_v2(
            llm, fingerprint=fingerprint, language=user.language or "en"
        )

    row = (
        await session.execute(select(DesignProfile).where(DesignProfile.site_id == sid))
    ).scalar_one_or_none()
    if row is None:
        row = DesignProfile(site_id=sid, profile=profile_data)
        session.add(row)
    else:
        row.profile = profile_data
    await session.commit()
    await session.refresh(row)
    return DesignProfileOut(
        id=row.id, site_id=row.site_id, profile=dict(row.profile or {}),
        created_at=row.created_at, updated_at=row.updated_at,
    )


@router.post("/design/references", response_model=ReferenceOut, status_code=201)
async def add_reference(
    body: ReferenceCreateIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> ReferenceOut:
    sid = await resolve_site(session, user, site_id=body.site_id)
    # References are not space-scoped; gate on the whole-house say (no room arg).
    await _gate_design_write(session, user, sid, None)
    actor_member_id = await _resolve_actor_member_id(session, user, sid, None)
    ref = DesignReference(
        site_id=sid, image_url=body.image_url, room_tag=body.room_tag, source=body.source,
        actor_member_id=actor_member_id,
    )
    session.add(ref)
    await session.commit()
    await session.refresh(ref)
    return _reference_out(ref)


def _reference_out(ref: DesignReference) -> ReferenceOut:
    # Inspiration images uploaded to the private bucket are stored as bare object
    # KEYS; serve them as short-lived presigned GET URLs (mirrors `_photo_out`).
    # A plain http(s) URL (e.g. a legacy/stock link) is passed through unchanged
    # by `url_for`. Without this, key-backed references render as blank thumbnails.
    return ReferenceOut(
        id=ref.id, site_id=ref.site_id,
        image_url=get_storage().url_for(ref.image_url) or ref.image_url,
        room_tag=ref.room_tag,
        source=ref.source, actor_member_id=ref.actor_member_id, created_at=ref.created_at,
    )


@router.get("/design/references", response_model=list[ReferenceOut])
async def list_references(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[ReferenceOut]:
    """Inspiration references for a site (attributed, oldest-first).

    Mirrors :func:`list_selections` so attributed refs survive a reload — the
    data-loss prerequisite (the mobile board was previously local-only state).
    """
    sid = await resolve_site(session, user, site_id)
    rows = (
        await session.execute(
            select(DesignReference)
            .where(DesignReference.site_id == sid)
            .order_by(DesignReference.created_at)
        )
    ).scalars().all()
    return [_reference_out(r) for r in rows]


@router.get("/design/selections", response_model=list[SelectionOut])
async def list_selections(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[SelectionOut]:
    sid = await resolve_site(session, user, site_id)
    rows = (
        await session.execute(
            select(DesignSelection)
            .where(DesignSelection.site_id == sid)
            .order_by(DesignSelection.created_at)
        )
    ).scalars().all()
    return [
        SelectionOut(
            id=s.id, site_id=s.site_id, space_id=s.space_id, item=s.item, choice=s.choice,
            status=s.status, created_at=s.created_at,
        )
        for s in rows
    ]


@router.post("/design/selections", response_model=SelectionOut, status_code=201)
async def add_selection(
    body: SelectionCreateIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> SelectionOut:
    sid = await resolve_site(session, user, site_id=body.site_id)
    await _gate_design_write(session, user, sid, body.space_id)
    actor_member_id = await _resolve_actor_member_id(session, user, sid, body.space_id)
    sel = DesignSelection(
        site_id=sid, space_id=body.space_id, item=body.item, choice=body.choice,
        status=body.status, actor_member_id=actor_member_id,
    )
    session.add(sel)
    await session.commit()
    await session.refresh(sel)
    return SelectionOut(
        id=sel.id, site_id=sel.site_id, space_id=sel.space_id, item=sel.item, choice=sel.choice,
        status=sel.status, created_at=sel.created_at,
    )


@router.post("/design/consistency-check", response_model=ConsistencyCheckOut)
async def design_consistency_check(
    body: ConsistencyCheckIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> ConsistencyCheckOut:
    """Advisory feedback on whether a choice fits the profile — NEVER a gate."""
    sid = await resolve_site(session, user, site_id=body.site_id)
    row = (
        await session.execute(select(DesignProfile).where(DesignProfile.site_id == sid))
    ).scalar_one_or_none()
    profile_text = ""
    if row and isinstance(row.profile, dict):
        profile_text = str(row.profile.get("profile", ""))
    result = await consistency_check(
        llm, profile_text=profile_text, item=body.item, choice=body.choice
    )
    return ConsistencyCheckOut(fits=result["fits"], feedback=result["feedback"])


@router.get("/design/conflicts", response_model=list[DesignConflictOut])
async def list_design_conflicts(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[DesignConflictOut]:
    """The household's open "decide together" cards (same item/room, diverging
    authoritative choices). Surfaced for a HUMAN to resolve — never AI-picked.
    """
    sid = await resolve_site(session, user, site_id)
    fingerprint = await _build_site_fingerprint(session, sid)
    return [DesignConflictOut(**c) for c in fingerprint.get("conflicts", [])]


@router.post("/design/conflicts/resolve", response_model=SelectionOut, status_code=201)
async def resolve_design_conflict(
    body: DesignConflictResolveIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> SelectionOut:
    """A human picks one choice to settle a conflict — no AI adjudication.

    Records the resolver's pick as a fresh authoritative selection (the resolver
    must hold a design say in the target room); the diverging rows are left intact
    for audit. The next profile draft groups by (item, room) and the resolved
    choice — being the latest authoritative pick — wins.
    """
    sid = await resolve_site(session, user, site_id=body.site_id)
    # Only an authoritative voice (owner/co-owner, or a granted member in scope)
    # may resolve — mirrors the design write gate; family/advisor get DEGRADE copy.
    await _gate_design_write(session, user, sid, body.space_id)
    actor_member_id = await _resolve_actor_member_id(session, user, sid, body.space_id)
    sel = DesignSelection(
        site_id=sid, space_id=body.space_id, item=body.item, choice=body.choice,
        status="selected", actor_member_id=actor_member_id,
    )
    session.add(sel)
    await session.commit()
    await session.refresh(sel)
    return SelectionOut(
        id=sel.id, site_id=sel.site_id, space_id=sel.space_id, item=sel.item, choice=sel.choice,
        status=sel.status, created_at=sel.created_at,
    )


# ---- requests --------------------------------------------------------------


def _request_out(r: HomeownerRequest) -> RequestOut:
    return RequestOut(
        id=r.id, site_id=r.site_id, raised_by=r.raised_by, title=r.title, detail=r.detail,
        status=r.status, sla_due_at=r.sla_due_at, created_at=r.created_at, updated_at=r.updated_at,
        # Resolve the bare R2 key to a short-lived presigned GET (mirrors photos).
        voice_url=get_storage().url_for(r.voice_key) if r.voice_key else None,
    )


@router.post("/requests", response_model=RequestOut, status_code=201)
async def create_request(
    body: RequestCreateIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> RequestOut:
    """Raise a request/issue. Gets a default SLA so the one-nudge sweep can act."""
    sid = await resolve_site(session, user, site_id=body.site_id)
    req = HomeownerRequest(
        site_id=sid,
        raised_by=user.id,
        title=body.title,
        detail=body.detail,
        voice_key=body.voice_key,
        sla_due_at=datetime.now(UTC) + timedelta(days=DEFAULT_REQUEST_SLA_DAYS),
    )
    session.add(req)
    await session.commit()
    await session.refresh(req)
    return _request_out(req)


@router.get("/requests", response_model=list[RequestOut])
async def list_requests(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[RequestOut]:
    sid = await resolve_site(session, user, site_id)
    rows = (
        await session.execute(
            select(HomeownerRequest)
            .where(HomeownerRequest.site_id == sid)
            .order_by(HomeownerRequest.created_at.desc())
        )
    ).scalars().all()
    return [_request_out(r) for r in rows]


@router.patch("/requests/{request_id}", response_model=RequestOut)
async def update_request_status(
    request_id: UUID,
    body: RequestStatusPatchIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RequestOut:
    """Move a request along sent → seen → in_progress → done.

    Either side may update: the homeowner who can see the site, or a contractor
    (owner/PM/etc.) whose scope includes it.
    """
    req = await session.get(HomeownerRequest, request_id)
    if req is None:
        raise AppError(404, "not_found", "Request not found")
    if not await _can_access_site(session, user, req.site_id):
        raise AppError(403, "forbidden", "Request not in scope")
    req.status = body.status
    await session.commit()
    await session.refresh(req)
    # Best-effort push: tell the homeowner their request moved (never fails here).
    from app.push.sender import notify_site_homeowners

    await notify_site_homeowners(
        session, req.site_id, "Update on your request",
        f"\"{req.title}\" is now {body.status.value.replace('_', ' ')}.",
        data={"type": "request", "request_id": str(req.id), "status": body.status.value},
    )
    return _request_out(req)


# ---- decisions -------------------------------------------------------------

_RESPOND_ACTION: dict[str, DecisionAction] = {
    "approve": DecisionAction.resolve,
    "comment": DecisionAction.acknowledge,
    "request_change": DecisionAction.reject,
}


@router.get("/decisions", response_model=list[HomeownerDecisionOut])
async def my_decisions(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> list[HomeownerDecisionOut]:
    """Pending decisions on my property awaiting a homeowner response."""
    ids = await homeowner_site_ids(session, user)
    if not ids:
        return []
    if site_id is not None:
        if site_id not in ids:
            raise AppError(403, "forbidden", "Property not in scope")
        ids = [site_id]
    rows = (
        await session.execute(
            select(Decision)
            .where(
                Decision.site_id.in_(ids),
                Decision.state.in_(
                    [DecisionState.pending, DecisionState.acknowledged, DecisionState.escalated]
                ),
            )
            .order_by(Decision.created_at)
        )
    ).scalars().all()
    return [
        HomeownerDecisionOut(
            id=d.id, site_id=d.site_id, kind=str(d.kind), title=_strip_tag(d.title),
            detail=_humanize_detail(d.detail), state=str(d.state), created_at=d.created_at,
        )
        for d in rows
    ]


@router.post("/decisions/{decision_id}/respond", response_model=HomeownerDecisionOut)
async def respond_to_decision(
    decision_id: UUID,
    body: DecisionRespondIn,
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
) -> HomeownerDecisionOut:
    """Respond to a decision: approve, comment, or request a change."""
    decision = await session.get(Decision, decision_id)
    ids = await homeowner_site_ids(session, user)
    if decision is None or decision.site_id not in ids:
        raise AppError(404, "not_found", "Decision not found")
    # Money-safety gate: approving commits scope/spend → owners only. Family and
    # advisors get a graceful handoff (a comment box), never a silent commit.
    if body.action == "approve":
        sub_role = await member_sub_role(session, user, decision.site_id)
        if sub_role is None or not can_approve(sub_role):
            raise AppError(
                403,
                "approve_forbidden",
                "Only a property owner can approve this. You can add a comment.",
                extra={"can_comment": True},
            )
    action = _RESPOND_ACTION[body.action]
    updated = await apply_action(session, decision, action, note=body.note)
    return HomeownerDecisionOut(
        id=updated.id, site_id=updated.site_id, kind=str(updated.kind),
        title=_strip_tag(updated.title), detail=updated.detail, state=str(updated.state),
        created_at=updated.created_at,
    )


@router.get("/me/capabilities", response_model=CapabilitiesOut)
async def my_capabilities(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
) -> CapabilitiesOut:
    """What the caller may do on a property — owners approve, everyone comments.

    The mobile client reads this to render a comment box (not a grey lock) for
    family/advisor members, so authority degrades gracefully.
    """
    sid = await resolve_site(session, user, site_id)
    # Read the member ROW(s), not just the rank-max sub_role: can_design and
    # design_space_id are per-row, so collapsing to rank-max would drop or widen
    # a room-scoped grant (see proposal A Risks).
    rows = (
        await session.execute(
            select(HomeownerMember).where(
                HomeownerMember.user_id == user.id,
                HomeownerMember.site_id == sid,
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).scalars().all()
    if not rows:
        raise AppError(403, "forbidden", "Property not in scope")
    sub_role = max((r.sub_role for r in rows), key=lambda r: _MANAGE_RANK.get(r, 0))
    can_design_flag = any(r.can_design for r in rows)
    # Owners/co-owners have a whole-house say → no room scope reported. For a
    # narrowed member, surface the first room they were granted.
    design_space_id = None
    if not can_manage_members(sub_role):
        design_space_id = next(
            (r.design_space_id for r in rows if r.can_design and r.design_space_id), None
        )
    return CapabilitiesOut(
        site_id=sid,
        **capabilities_for(
            sub_role, can_design_flag=can_design_flag, design_space_id=design_space_id
        ),
    )
