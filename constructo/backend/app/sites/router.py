"""Site & Project Management endpoints (Wave 1).

All routes require auth and are site/company scoped. owner/pm see all company
sites; supervisor (and other non owner/pm roles) see only sites they have been
assigned to via the SiteAssignment table. Visibility for reads is enforced
through `effective_visible_site_ids`, which extends the frozen
`app.auth.scoping.visible_site_ids` with assignment lookups.
"""
from datetime import UTC, date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import assert_valid_step_up, get_current_user, require_role
from app.auth.scoping import visible_site_ids
from app.common.errors import AppError
from app.common.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.db import get_session
from app.models import (
    Company,
    Site,
    SiteBaseline,
    SiteEventModel,
    User,
    UserRole,
    WhatsappGroup,
)
from app.sites.models import SiteAssignment
from app.sites.schemas import (
    CompanyCreate,
    CompanyOut,
    OkOut,
    SiteAssignIn,
    SiteBaselineIn,
    SiteBaselineOut,
    SiteCreate,
    SiteEventOut,
    SiteOut,
    SiteUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
    WhatsappGroupCreate,
    WhatsappGroupOut,
)

router = APIRouter(prefix="/api/v1", tags=["sites"])

# Roles that carry elevated access (financial, export, or admin reach).
# Assigning ANY of these to a teammate is considered a sensitive action and
# requires a fresh step-up token in ``PATCH /users/{id}``.
STEP_UP_ROLES: frozenset[UserRole] = frozenset(
    {UserRole.owner, UserRole.pm, UserRole.accountant, UserRole.procurement}
)

_ALL_SITES_ROLES = {UserRole.owner, UserRole.pm, UserRole.architect}


async def effective_visible_site_ids(session: AsyncSession, user: User) -> list[UUID]:
    """owner/pm/architect -> all company sites; others -> assigned sites only."""
    if user.role in _ALL_SITES_ROLES:
        return await visible_site_ids(session, user)
    rows = await session.execute(
        select(SiteAssignment.site_id).where(SiteAssignment.user_id == user.id)
    )
    return list(rows.scalars().all())


def _parse_limit(limit: int) -> int:
    if limit <= 0:
        return DEFAULT_LIMIT
    return min(limit, MAX_LIMIT)


def _decode(cursor: str | None) -> str | None:
    try:
        return decode_cursor(cursor)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc


# ---- companies -------------------------------------------------------------


@router.post("/companies", response_model=CompanyOut, status_code=201)
async def create_company(
    body: CompanyCreate,
    _: User = Depends(require_role(UserRole.owner)),
    session: AsyncSession = Depends(get_session),
) -> CompanyOut:
    company = Company(name=body.name)
    session.add(company)
    await session.commit()
    return CompanyOut(id=company.id, name=company.name)


# ---- sites -----------------------------------------------------------------


@router.get("/sites", response_model=Page[SiteOut])
async def list_sites(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[SiteOut]:
    visible = await effective_visible_site_ids(session, user)
    if not visible:
        return Page[SiteOut](items=[], next_cursor=None)

    page_size = _parse_limit(limit)
    after = _decode(cursor)

    stmt = select(Site).where(Site.id.in_(visible)).order_by(Site.id)
    if after is not None:
        stmt = stmt.where(Site.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))

    return Page[SiteOut](items=[_site_out(s) for s in rows], next_cursor=next_cursor)


@router.post("/sites", response_model=SiteOut, status_code=201)
async def create_site(
    body: SiteCreate,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> SiteOut:
    site = Site(
        company_id=user.company_id,
        name=body.name,
        type=body.type,
        location=body.location,
        status=body.status or "active",
    )
    session.add(site)
    await session.commit()
    return _site_out(site)


@router.get("/sites/{site_id}", response_model=SiteOut)
async def get_site(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SiteOut:
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        site = await session.get(Site, site_id)
        if site is None:
            raise AppError(404, "not_found", "Site not found")
        raise AppError(403, "forbidden", "Site not in scope")
    site = await session.get(Site, site_id)
    if site is None:
        raise AppError(404, "not_found", "Site not found")
    return _site_out(site)


@router.patch("/sites/{site_id}", response_model=SiteOut)
async def update_site(
    site_id: UUID,
    body: SiteUpdate,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> SiteOut:
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        site = await session.get(Site, site_id)
        if site is None:
            raise AppError(404, "not_found", "Site not found")
        raise AppError(403, "forbidden", "Site not in scope")
    site = await session.get(Site, site_id)
    if site is None:
        raise AppError(404, "not_found", "Site not found")

    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(site, field, value)
    await session.commit()
    return _site_out(site)


@router.post("/sites/{site_id}/assign", response_model=OkOut)
async def assign_site(
    site_id: UUID,
    body: SiteAssignIn,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> OkOut:
    site = await session.get(Site, site_id)
    if site is None or site.company_id != user.company_id:
        raise AppError(404, "not_found", "Site not found")

    target = await session.get(User, body.user_id)
    if target is None or target.company_id != user.company_id:
        raise AppError(404, "not_found", "User not found")

    existing = await session.execute(
        select(SiteAssignment).where(
            SiteAssignment.site_id == site_id, SiteAssignment.user_id == body.user_id
        )
    )
    if existing.scalar_one_or_none() is None:
        session.add(SiteAssignment(site_id=site_id, user_id=body.user_id))
        await session.commit()
    return OkOut()


# ---- site baseline ---------------------------------------------------------


@router.put("/sites/{site_id}/baseline", response_model=SiteBaselineOut)
async def set_site_baseline(
    site_id: UUID,
    body: SiteBaselineIn,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> SiteBaselineOut:
    """Set (or clear) a site's expected daily headcount.

    owner/pm only (mirrors the publish/site-config auth). The baseline is what
    lets the labor-shortfall risk fire deterministically against an explicit
    expectation; clearing it (``expected_daily_headcount=null``) reverts to the
    auto-learn / day-over-day fallbacks. Upserts the single per-site row.
    """
    site = await session.get(Site, site_id)
    if site is None or site.company_id != user.company_id:
        raise AppError(404, "not_found", "Site not found")

    baseline = (
        await session.execute(
            select(SiteBaseline).where(SiteBaseline.site_id == site_id)
        )
    ).scalar_one_or_none()

    if baseline is None:
        baseline = SiteBaseline(site_id=site_id)
        session.add(baseline)

    baseline.expected_daily_headcount = body.expected_daily_headcount
    if body.notes is not None:
        baseline.notes = body.notes
    baseline.updated_by = user.id

    await session.commit()
    await session.refresh(baseline)

    return SiteBaselineOut(
        site_id=baseline.site_id,
        expected_daily_headcount=baseline.expected_daily_headcount,
        notes=baseline.notes,
        updated_at=baseline.updated_at,
    )


@router.get("/sites/{site_id}/baseline", response_model=SiteBaselineOut)
async def get_site_baseline(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SiteBaselineOut:
    """Read a site's current baseline (any role with the site in scope)."""
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        site = await session.get(Site, site_id)
        if site is None:
            raise AppError(404, "not_found", "Site not found")
        raise AppError(403, "forbidden", "Site not in scope")

    baseline = (
        await session.execute(
            select(SiteBaseline).where(SiteBaseline.site_id == site_id)
        )
    ).scalar_one_or_none()

    if baseline is None:
        # No baseline set yet -> report an empty (null) baseline, not a 404.
        return SiteBaselineOut(
            site_id=site_id,
            expected_daily_headcount=None,
            notes=None,
            updated_at=datetime.now(UTC),
        )

    return SiteBaselineOut(
        site_id=baseline.site_id,
        expected_daily_headcount=baseline.expected_daily_headcount,
        notes=baseline.notes,
        updated_at=baseline.updated_at,
    )


# ---- site events (read) ----------------------------------------------------


@router.get("/sites/{site_id}/events", response_model=Page[SiteEventOut])
async def list_site_events(
    site_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    date: date | None = Query(None),  # filter by occurred_on
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[SiteEventOut]:
    """List a site's extracted events, scoped by site visibility.

    owner/pm see any company site's events; supervisors only their assigned
    sites'. Optionally filter by ``date`` (``occurred_on``). Cursor-paginated by
    event id like the other list endpoints.
    """
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        # Mirror get_site: 404 if it doesn't exist at all, else 403.
        site = await session.get(Site, site_id)
        if site is None:
            raise AppError(404, "not_found", "Site not found")
        raise AppError(403, "forbidden", "Site not in scope")

    page_size = _parse_limit(limit)
    after = _decode(cursor)

    stmt = select(SiteEventModel).where(SiteEventModel.site_id == site_id)
    if date is not None:
        stmt = stmt.where(SiteEventModel.occurred_on == date)
    stmt = stmt.order_by(SiteEventModel.id)
    if after is not None:
        stmt = stmt.where(SiteEventModel.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))

    return Page[SiteEventOut](items=[_event_out(e) for e in rows], next_cursor=next_cursor)


def _event_out(e: SiteEventModel) -> SiteEventOut:
    return SiteEventOut(
        id=e.id,
        site_id=e.site_id,
        event_type=e.event_type,
        occurred_on=e.occurred_on,
        summary=e.summary,
        fields=e.fields or {},
        confidence=e.confidence,
        needs_clarification=e.needs_clarification,
        source_message_ids=list(e.source_message_ids or []),
        version=e.version,
        supersedes_event_id=e.supersedes_event_id,
        created_at=e.created_at,
    )


def _site_out(site: Site) -> SiteOut:
    return SiteOut(
        id=site.id,
        company_id=site.company_id,
        name=site.name,
        type=site.type,
        location=site.location,
        status=site.status,
    )


# ---- users -----------------------------------------------------------------


@router.get("/users", response_model=Page[UserOut])
async def list_users(
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[UserOut]:
    page_size = _parse_limit(limit)
    after = _decode(cursor)

    stmt = select(User).where(User.company_id == user.company_id).order_by(User.id)
    if after is not None:
        stmt = stmt.where(User.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))

    return Page[UserOut](items=[_user_out(u) for u in rows], next_cursor=next_cursor)


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    body: UserCreate,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    new_user = User(
        company_id=user.company_id,
        name=body.name,
        phone=body.phone,
        role=body.role,
    )
    session.add(new_user)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(409, "conflict", "A user with this phone already exists") from exc
    return _user_out(new_user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    body: UserUpdate,
    actor: User = Depends(require_role(UserRole.owner)),
    session: AsyncSession = Depends(get_session),
    x_step_up_token: str | None = Header(default=None),
) -> UserOut:
    """Change a teammate's role or active status (W4.3). Owner-only, scoped to
    the caller's company. The owner can't edit their OWN role/status — which
    also guarantees the company always keeps at least one active owner (the
    acting owner remains), so there is no separate last-owner check to do.

    Sensitive changes (deactivation OR assigning a privileged role from
    ``STEP_UP_ROLES``) require a valid ``X-Step-Up-Token`` header minted by
    ``POST /auth/step-up/verify``.  Non-sensitive changes (assigning a
    non-privileged role, or reactivation) proceed without a token.
    """
    target = await session.get(User, user_id)
    if target is None or target.company_id != actor.company_id:
        raise AppError(404, "not_found", "User not found")
    if target.id == actor.id:
        raise AppError(403, "forbidden", "You can't change your own role or status")

    # A change is sensitive when it deactivates a user OR assigns a role that
    # carries elevated (financial / admin) reach.
    sensitive = (body.is_active is False) or (
        body.role is not None and body.role in STEP_UP_ROLES
    )
    if sensitive:
        assert_valid_step_up(x_step_up_token, actor)

    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    await session.commit()
    await session.refresh(target)
    return _user_out(target)


def _user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        company_id=u.company_id,
        name=u.name,
        phone=u.phone,
        role=u.role,
        is_active=u.is_active,
    )


# ---- whatsapp groups -------------------------------------------------------


@router.post("/whatsapp-groups", response_model=WhatsappGroupOut, status_code=201)
async def create_whatsapp_group(
    body: WhatsappGroupCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> WhatsappGroupOut:
    if body.site_id is not None:
        site = await session.get(Site, body.site_id)
        if site is None or site.company_id != user.company_id:
            raise AppError(404, "not_found", "Site not found")

    group = WhatsappGroup(
        company_id=user.company_id,
        site_id=body.site_id,
        external_group_id=body.external_group_id,
        source=body.source,
        label=body.label,
    )
    session.add(group)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise AppError(
            409, "conflict", "A group with this external_group_id and source already exists"
        ) from exc
    return _group_out(group)


@router.get("/whatsapp-groups", response_model=Page[WhatsappGroupOut])
async def list_whatsapp_groups(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    limit: int = Query(DEFAULT_LIMIT),
    cursor: str | None = Query(None),
) -> Page[WhatsappGroupOut]:
    page_size = _parse_limit(limit)
    after = _decode(cursor)

    stmt = (
        select(WhatsappGroup)
        .where(WhatsappGroup.company_id == user.company_id)
        .order_by(WhatsappGroup.id)
    )
    if after is not None:
        stmt = stmt.where(WhatsappGroup.id > UUID(after))
    stmt = stmt.limit(page_size + 1)

    rows = list((await session.execute(stmt)).scalars().all())
    next_cursor = None
    if len(rows) > page_size:
        rows = rows[:page_size]
        next_cursor = encode_cursor(str(rows[-1].id))

    return Page[WhatsappGroupOut](
        items=[_group_out(g) for g in rows], next_cursor=next_cursor
    )


def _group_out(g: WhatsappGroup) -> WhatsappGroupOut:
    return WhatsappGroupOut(
        id=g.id,
        company_id=g.company_id,
        site_id=g.site_id,
        external_group_id=g.external_group_id,
        source=g.source,
        label=g.label,
    )
