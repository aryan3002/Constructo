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

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.approvals.service import apply_action
from app.approvals.state_machine import DecisionAction
from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token
from app.common.errors import AppError
from app.common.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.db import get_session
from app.extraction.llm import LLMClient
from app.homeowner.ai import consistency_check, generate_design_profile, get_llm
from app.homeowner.schemas import (
    ChangeOut,
    ChangesOut,
    ComponentOut,
    ConsistencyCheckIn,
    ConsistencyCheckOut,
    DecisionRespondIn,
    DesignProfileOut,
    DesignProfilePutIn,
    HomeOut,
    HomeownerDecisionOut,
    JoinIn,
    MemberCreateIn,
    MemberOut,
    MemberPrefsIn,
    MilestoneOut,
    PhotoOut,
    PropertyOut,
    ReferenceCreateIn,
    ReferenceOut,
    RequestCreateIn,
    RequestOut,
    RequestStatusPatchIn,
    SelectionCreateIn,
    SelectionOut,
    SpaceOut,
    SpendSummary,
    TokenOut,
    UpdateOut,
    WeeklySummaryOut,
)
from app.homeowner.scoping import homeowner_site_ids, resolve_site
from app.models import (
    Change,
    Component,
    ComponentStatus,
    Decision,
    DecisionState,
    DesignProfile,
    DesignReference,
    DesignSelection,
    HomeownerMember,
    HomeownerRequest,
    MemberStatus,
    Milestone,
    MilestoneStatus,
    Property,
    PublishedPhoto,
    Site,
    Space,
    Update,
    User,
    UserRole,
    WeeklySummary,
)

router = APIRouter(prefix="/api/v1/homeowner", tags=["homeowner"])

# Dev OTP, mirroring app.auth.router (no SMS provider wired yet).
STUB_OTP = "000000"
DEFAULT_REQUEST_SLA_DAYS = 3


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
    )


async def _can_access_site(session: AsyncSession, user: User, site_id: UUID) -> bool:
    """True if the caller is a homeowner-member of the site, or a contractor who
    can see it. Used by request status updates (both sides act on requests)."""
    if user.role is UserRole.homeowner:
        return site_id in await homeowner_site_ids(session, user)
    from app.sites.router import effective_visible_site_ids

    return site_id in await effective_visible_site_ids(session, user)


# ---- onboarding / membership ----------------------------------------------


@router.post("/join", response_model=TokenOut)
async def join(body: JoinIn, session: AsyncSession = Depends(get_session)) -> TokenOut:
    """Redeem a join code → materialise the homeowner user and a token.

    Public (no bearer): the homeowner proves identity with the join code + phone
    + OTP. Binds the invited member to the (new or existing) homeowner user.
    """
    if body.otp != STUB_OTP:
        raise AppError(401, "invalid_otp", "Invalid OTP")

    member = (
        await session.execute(
            select(HomeownerMember).where(HomeownerMember.join_code == body.join_code)
        )
    ).scalar_one_or_none()
    if member is None:
        raise AppError(404, "invalid_code", "Unknown join code")

    # Find-or-create the homeowner user by phone.
    user = (
        await session.execute(select(User).where(User.phone == body.phone))
    ).scalar_one_or_none()
    if user is None:
        site = await session.get(Site, member.site_id)
        if site is None:
            raise AppError(404, "not_found", "Property no longer exists")
        user = User(company_id=site.company_id, phone=body.phone, role=UserRole.homeowner)
        session.add(user)
        await session.flush()

    member.user_id = user.id
    member.status = MemberStatus.active
    if member.phone is None:
        member.phone = body.phone
    await session.commit()

    token = create_access_token(str(user.id), user.role.value)
    return TokenOut(token=token, site_id=member.site_id, sub_role=member.sub_role)


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

    recent = (
        await session.execute(
            select(Update)
            .where(Update.site_id == sid)
            .order_by(Update.published_at.desc())
            .limit(5)
        )
    ).scalars().all()

    changes = (
        await session.execute(select(Change).where(Change.site_id == sid))
    ).scalars().all()
    spend = None
    if changes:
        total = sum(float(c.cost_delta) for c in changes if c.cost_delta is not None)
        spend = SpendSummary(total_change_cost_delta=total, change_count=len(changes))

    return HomeOut(
        property=prop,
        milestone_now=_milestone_out(milestone_now) if milestone_now else None,
        milestone_next=_milestone_out(milestone_next) if milestone_next else None,
        needs_attention=[
            {
                "id": d.id,
                "title": _strip_tag(d.title),
                "detail": d.detail,
                "kind": str(d.kind),
                "created_at": d.created_at,
            }
            for d in attention_rows
        ],
        recent_activity=[_update_out(u) for u in recent],
        spend_summary=spend,
    )


def _strip_tag(title: str) -> str:
    """Hide internal sweep tags (e.g. '[permit-alert]...') from the homeowner."""
    if title.startswith("["):
        # Drop leading bracketed tags like "[homeowner-request-nudge][id] ".
        idx = title.rfind("] ")
        if idx != -1:
            return title[idx + 2 :]
    return title


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
    )


def _photo_out(p: PublishedPhoto) -> PhotoOut:
    return PhotoOut(
        id=p.id,
        site_id=p.site_id,
        image_url=p.image_url,
        caption=p.caption,
        room_tag=p.room_tag,
        milestone_id=p.milestone_id,
        is_starred=p.is_starred,
        published_at=p.published_at,
    )


def _update_out(u: Update) -> UpdateOut:
    return UpdateOut(
        id=u.id, site_id=u.site_id, type=u.type, title=u.title, body=u.body,
        published_at=u.published_at,
    )


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
    site_id: UUID | None = Query(None),
    view: str = Query("all"),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[PhotoOut]:
    """Curated photos. ``view`` orders for the 3 client tabs (all/room/milestone)."""
    sid = await resolve_site(session, user, site_id)
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
    return Page[PhotoOut](items=items, next_cursor=next_cursor)


@router.get("/updates", response_model=Page[UpdateOut])
async def updates(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[UpdateOut]:
    """The Project Updates timeline (newest first)."""
    sid = await resolve_site(session, user, site_id)
    stmt = (
        select(Update).where(Update.site_id == sid).order_by(Update.published_at.desc(), Update.id)
    )
    items, next_cursor = await _paginate(session, stmt, cursor, limit, Update.id, _update_out)
    return Page[UpdateOut](items=items, next_cursor=next_cursor)


@router.get("/weekly-summary", response_model=list[WeeklySummaryOut])
async def weekly_summary(
    user: User = Depends(require_homeowner),
    session: AsyncSession = Depends(get_session),
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
    return [
        WeeklySummaryOut(
            id=w.id, site_id=w.site_id, week_start=w.week_start, text=w.text,
            published_at=w.published_at,
        )
        for w in rows
    ]


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
    items = [
        ChangeOut(
            id=c.id, site_id=c.site_id, description=c.description,
            cost_delta=float(c.cost_delta) if c.cost_delta is not None else None,
            schedule_delta_days=c.schedule_delta_days, reason=c.reason,
            approved_by=c.approved_by, created_at=c.created_at,
        )
        for c in rows
    ]
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


# ---- design ----------------------------------------------------------------


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
        selections = (
            await session.execute(select(DesignSelection).where(DesignSelection.site_id == sid))
        ).scalars().all()
        refs = (
            await session.execute(select(DesignReference).where(DesignReference.site_id == sid))
        ).scalars().all()
        profile_data = await generate_design_profile(
            llm,
            selection_pairs=[(s.item, s.choice) for s in selections],
            reference_tags=[r.room_tag for r in refs if r.room_tag],
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
    ref = DesignReference(
        site_id=sid, image_url=body.image_url, room_tag=body.room_tag, source=body.source
    )
    session.add(ref)
    await session.commit()
    await session.refresh(ref)
    return ReferenceOut(
        id=ref.id, site_id=ref.site_id, image_url=ref.image_url, room_tag=ref.room_tag,
        source=ref.source, created_at=ref.created_at,
    )


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
    sel = DesignSelection(
        site_id=sid, space_id=body.space_id, item=body.item, choice=body.choice,
        status=body.status,
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


# ---- requests --------------------------------------------------------------


def _request_out(r: HomeownerRequest) -> RequestOut:
    return RequestOut(
        id=r.id, site_id=r.site_id, raised_by=r.raised_by, title=r.title, detail=r.detail,
        status=r.status, sla_due_at=r.sla_due_at, created_at=r.created_at, updated_at=r.updated_at,
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
            detail=d.detail, state=str(d.state), created_at=d.created_at,
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
    action = _RESPOND_ACTION[body.action]
    updated = await apply_action(session, decision, action, note=body.note)
    return HomeownerDecisionOut(
        id=updated.id, site_id=updated.site_id, kind=str(updated.kind),
        title=_strip_tag(updated.title), detail=updated.detail, state=str(updated.state),
        created_at=updated.created_at,
    )
