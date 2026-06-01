"""Contractor-side publisher API (H0).

The contractor is the publisher: these endpoints are the ONLY way data reaches
the homeowner feed. Everything here is company- and site-scoped (owner/PM, plus
any role assigned to the site) via ``effective_visible_site_ids`` — a contractor
can never publish onto a site outside their scope.

Photo captions and the weekly summary are AI-*drafted* when the contractor omits
them, then stored as-is so the contractor can edit before/after — honest-AI:
the model drafts, the human approves.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.extraction.llm import LLMClient
from app.homeowner.ai import draft_caption, draft_weekly_summary, get_llm
from app.homeowner.quiet import confirm_quiet_period
from app.homeowner.router import (
    _member_out,
    _milestone_out,
    _photo_out,
    _quiet_out,
    _update_out,
)
from app.homeowner.schemas import (
    ChangeOut,
    ComponentOut,
    MemberOut,
    MilestoneOut,
    PhotoOut,
    QuietPeriodOut,
    SpaceOut,
    UpdateOut,
    WeeklySummaryOut,
)
from app.models import (
    Change,
    Component,
    HomeownerMember,
    Milestone,
    Property,
    PublishedPhoto,
    QuietPeriod,
    SiteEventModel,
    Space,
    Update,
    User,
    WeeklySummary,
)
from app.publish.schemas import (
    ChangeCreateIn,
    ComponentCreateIn,
    ComponentUpdateIn,
    MilestoneCreateIn,
    MilestoneUpdateIn,
    PropertyCreateIn,
    PropertyUpdateIn,
    PublishPhotoIn,
    PublishUpdateIn,
    PublishWeeklySummaryIn,
    SpaceCreateIn,
    SpaceUpdateIn,
)
from app.push.sender import notify_site_homeowners

router = APIRouter(prefix="/api/v1/publish", tags=["publish"])


async def _assert_site(session: AsyncSession, user: User, site_id: UUID) -> None:
    """Contractor scope: the site must be visible to the caller."""
    from app.models import Site
    from app.sites.router import effective_visible_site_ids

    if site_id in await effective_visible_site_ids(session, user):
        return
    site = await session.get(Site, site_id)
    if site is None or site.company_id != user.company_id:
        raise AppError(404, "not_found", "Site not found")
    raise AppError(403, "forbidden", "Site not in scope")


async def _space_in_scope(session: AsyncSession, user: User, space_id: UUID) -> Space:
    space = await session.get(Space, space_id)
    if space is None:
        raise AppError(404, "not_found", "Space not found")
    await _assert_site(session, user, space.site_id)
    return space


# ---- publish to the feed ---------------------------------------------------


@router.post("/photo", response_model=PhotoOut, status_code=201)
async def publish_photo(
    body: PublishPhotoIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> PhotoOut:
    """Curate a photo into the homeowner feed (optionally promoted from an event).

    Honest-AI caption gate (Slice V / red-team): a CONTRACTOR-supplied caption is
    a reviewed, grounded fact → it is published verbatim and the homeowner sees
    it. An AI-drafted caption (from the real image via ``complete_vision`` when an
    image is present, else from the event summary) is a DRAFT pending review — it
    is returned in ``draft_caption`` for the contractor to confirm/edit and is
    NEVER written into ``caption`` (the homeowner-visible field). So raw,
    ungrounded model output can never reach the homeowner without a human review.

    To publish an AI draft the contractor re-POSTs it back as ``caption`` (the
    verbatim path), which makes it a reviewed, homeowner-visible fact.
    """
    await _assert_site(session, user, body.site_id)

    caption = body.caption  # contractor-reviewed → homeowner-visible
    draft = None  # AI suggestion → contractor reviews, never auto-published
    if caption is None:
        summary = body.event_summary
        if summary is None and body.source_event_id is not None:
            event = await session.get(SiteEventModel, body.source_event_id)
            summary = event.summary if event is not None else None
        if summary or body.image_url:
            draft = await draft_caption(
                llm,
                summary=summary or "",
                image_url=body.image_url,
                room_tag=body.room_tag,
            )

    photo = PublishedPhoto(
        site_id=body.site_id,
        source_event_id=body.source_event_id,
        image_url=body.image_url,
        caption=caption,  # None until a human reviews the draft
        room_tag=body.room_tag,
        milestone_id=body.milestone_id,
        is_starred=body.is_starred,
        published_by=user.id,
    )
    session.add(photo)
    await session.commit()
    await session.refresh(photo)
    out = _photo_out(photo)
    return out.model_copy(update={"draft_caption": draft})


@router.post("/update", response_model=UpdateOut, status_code=201)
async def publish_update(
    body: PublishUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UpdateOut:
    await _assert_site(session, user, body.site_id)
    update = Update(
        site_id=body.site_id, type=body.type, title=body.title, body=body.body,
        published_by=user.id,
    )
    session.add(update)
    await session.commit()
    await session.refresh(update)
    # Best-effort push to the homeowner(s) on this site (never fails the publish).
    await notify_site_homeowners(
        session, body.site_id, "New project update", update.title,
        data={"type": "update", "update_type": str(update.type)},
    )
    return _update_out(update)


@router.post("/weekly-summary", response_model=WeeklySummaryOut, status_code=201)
async def publish_weekly_summary(
    body: PublishWeeklySummaryIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    llm: LLMClient = Depends(get_llm),
) -> WeeklySummaryOut:
    """Publish the weekly digest. Text is AI-drafted from this week's updates if omitted."""
    await _assert_site(session, user, body.site_id)

    text = body.text
    if text is None:
        titles = list(
            (
                await session.execute(
                    select(Update.title)
                    .where(Update.site_id == body.site_id)
                    .order_by(Update.published_at.desc())
                    .limit(20)
                )
            ).scalars().all()
        )
        text = await draft_weekly_summary(llm, week_start=body.week_start, update_titles=titles)

    summary = WeeklySummary(
        site_id=body.site_id, week_start=body.week_start, text=text, published_by=user.id
    )
    session.add(summary)
    await session.commit()
    await session.refresh(summary)
    return WeeklySummaryOut(
        id=summary.id, site_id=summary.site_id, week_start=summary.week_start,
        text=summary.text, published_at=summary.published_at,
    )


# ---- quiet periods (contractor confirm gate) -------------------------------


@router.post("/quiet-periods/{quiet_period_id}/confirm", response_model=QuietPeriodOut)
async def confirm_quiet(
    quiet_period_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> QuietPeriodOut:
    """Contractor gate: confirm an AI-suggested quiet window so the homeowner
    sees the calm "nothing new to see — here's why" card.

    The quiet-period sweep drafts an ``Update(type=quiet)`` + a ``QuietPeriod``
    in ``suggested`` and stops — raw AI never crosses the contractor│homeowner
    line. This endpoint is that crossing: it transitions the window to
    ``published`` and (via the homeowner read path's confirmed/published gate)
    makes the linked Update homeowner-visible. Idempotent.
    """
    qp = await session.get(QuietPeriod, quiet_period_id)
    if qp is None:
        raise AppError(404, "not_found", "Quiet period not found")
    await _assert_site(session, user, qp.site_id)
    qp = await confirm_quiet_period(session, qp, confirmed_by=user.id)
    return _quiet_out(qp)


# ---- property skeleton CRUD ------------------------------------------------


def _property_row_out(p: Property) -> dict:
    return {
        "id": p.id, "site_id": p.site_id, "display_name": p.display_name, "type": p.type,
        "status": p.status, "started_on": p.started_on,
        "expected_handover_on": p.expected_handover_on, "created_at": p.created_at,
    }


@router.post("/property", status_code=201)
async def create_property(
    body: PropertyCreateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await _assert_site(session, user, body.site_id)
    existing = (
        await session.execute(select(Property).where(Property.site_id == body.site_id))
    ).scalar_one_or_none()
    if existing is not None:
        raise AppError(409, "already_exists", "Property already published for this site")
    prop = Property(
        company_id=user.company_id, site_id=body.site_id, display_name=body.display_name,
        type=body.type, status=body.status, started_on=body.started_on,
        expected_handover_on=body.expected_handover_on,
    )
    session.add(prop)
    await session.commit()
    await session.refresh(prop)
    return _property_row_out(prop)


@router.patch("/property/{property_id}")
async def update_property(
    property_id: UUID,
    body: PropertyUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    prop = await session.get(Property, property_id)
    if prop is None:
        raise AppError(404, "not_found", "Property not found")
    await _assert_site(session, user, prop.site_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    await session.commit()
    await session.refresh(prop)
    return _property_row_out(prop)


@router.post("/spaces", response_model=SpaceOut, status_code=201)
async def create_space(
    body: SpaceCreateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SpaceOut:
    await _assert_site(session, user, body.site_id)
    if body.parent_id is not None:
        parent = await session.get(Space, body.parent_id)
        if parent is None or parent.site_id != body.site_id:
            raise AppError(404, "not_found", "Parent space not found on this site")
    space = Space(
        site_id=body.site_id, parent_id=body.parent_id, name=body.name, kind=body.kind,
        order=body.order,
    )
    session.add(space)
    await session.commit()
    await session.refresh(space)
    return SpaceOut(
        id=space.id, site_id=space.site_id, parent_id=space.parent_id, name=space.name,
        kind=str(space.kind), order=space.order, components=[], progress=None,
    )


@router.patch("/spaces/{space_id}", response_model=SpaceOut)
async def update_space(
    space_id: UUID,
    body: SpaceUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SpaceOut:
    space = await _space_in_scope(session, user, space_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(space, field, value)
    await session.commit()
    await session.refresh(space)
    return SpaceOut(
        id=space.id, site_id=space.site_id, parent_id=space.parent_id, name=space.name,
        kind=str(space.kind), order=space.order, components=[], progress=None,
    )


@router.delete("/spaces/{space_id}", status_code=204)
async def delete_space(
    space_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    space = await _space_in_scope(session, user, space_id)
    await session.delete(space)
    await session.commit()


@router.post("/components", response_model=ComponentOut, status_code=201)
async def create_component(
    body: ComponentCreateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ComponentOut:
    await _space_in_scope(session, user, body.space_id)
    comp = Component(space_id=body.space_id, name=body.name, kind=body.kind, status=body.status)
    session.add(comp)
    await session.commit()
    await session.refresh(comp)
    return ComponentOut(id=comp.id, name=comp.name, kind=comp.kind, status=comp.status)


@router.patch("/components/{component_id}", response_model=ComponentOut)
async def update_component(
    component_id: UUID,
    body: ComponentUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ComponentOut:
    comp = await session.get(Component, component_id)
    if comp is None:
        raise AppError(404, "not_found", "Component not found")
    await _space_in_scope(session, user, comp.space_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(comp, field, value)
    await session.commit()
    await session.refresh(comp)
    return ComponentOut(id=comp.id, name=comp.name, kind=comp.kind, status=comp.status)


@router.delete("/components/{component_id}", status_code=204)
async def delete_component(
    component_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    comp = await session.get(Component, component_id)
    if comp is None:
        raise AppError(404, "not_found", "Component not found")
    await _space_in_scope(session, user, comp.space_id)
    await session.delete(comp)
    await session.commit()


# ---- milestones CRUD -------------------------------------------------------


@router.post("/milestones", response_model=MilestoneOut, status_code=201)
async def create_milestone(
    body: MilestoneCreateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MilestoneOut:
    await _assert_site(session, user, body.site_id)
    m = Milestone(
        site_id=body.site_id, name=body.name, status=body.status, started_on=body.started_on,
        expected_on=body.expected_on, completed_on=body.completed_on, order=body.order,
    )
    session.add(m)
    await session.commit()
    await session.refresh(m)
    return _milestone_out(m)


@router.patch("/milestones/{milestone_id}", response_model=MilestoneOut)
async def update_milestone(
    milestone_id: UUID,
    body: MilestoneUpdateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MilestoneOut:
    m = await session.get(Milestone, milestone_id)
    if m is None:
        raise AppError(404, "not_found", "Milestone not found")
    await _assert_site(session, user, m.site_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(m, field, value)
    await session.commit()
    await session.refresh(m)
    return _milestone_out(m)


@router.delete("/milestones/{milestone_id}", status_code=204)
async def delete_milestone(
    milestone_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    m = await session.get(Milestone, milestone_id)
    if m is None:
        raise AppError(404, "not_found", "Milestone not found")
    await _assert_site(session, user, m.site_id)
    await session.delete(m)
    await session.commit()


# ---- changes log -----------------------------------------------------------


@router.post("/changes", response_model=ChangeOut, status_code=201)
async def create_change(
    body: ChangeCreateIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChangeOut:
    await _assert_site(session, user, body.site_id)
    change = Change(
        site_id=body.site_id, description=body.description, cost_delta=body.cost_delta,
        schedule_delta_days=body.schedule_delta_days, reason=body.reason, approved_by=user.id,
    )
    session.add(change)
    await session.commit()
    await session.refresh(change)
    return ChangeOut(
        id=change.id, site_id=change.site_id, description=change.description,
        cost_delta=float(change.cost_delta) if change.cost_delta is not None else None,
        schedule_delta_days=change.schedule_delta_days, reason=change.reason,
        approved_by=change.approved_by, requested_by=change.requested_by,
        # Single just-created item: its running total is its own cost delta.
        running_total_cost=float(change.cost_delta) if change.cost_delta is not None else 0.0,
        created_at=change.created_at,
    )


# ---- members (contractor view) ---------------------------------------------


@router.get("/members", response_model=list[MemberOut])
async def list_site_members(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID = Query(...),
) -> list[MemberOut]:
    """List the homeowner members the contractor has invited to a site."""
    await _assert_site(session, user, site_id)
    rows = (
        await session.execute(
            select(HomeownerMember)
            .where(HomeownerMember.site_id == site_id)
            .order_by(HomeownerMember.created_at)
        )
    ).scalars().all()
    return [_member_out(m) for m in rows]
