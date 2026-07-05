"""GET /api/v1/activity — the Owner activity-first Command Center feed.

Company-scoped, keyset-paginated union over nine homeowner-feed / decision /
finding source tables. The session work (loading rows per source, ordered +
capped) lives here; the merge/sort/summary is the pure ``aggregate.build_activity``.
"""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity.aggregate import (
    _DECISION_KINDS,
    _OPEN_DECISION_STATES,
    _OPEN_REQUEST_STATUSES,
    build_activity,
)
from app.activity.schemas import ActivityPageOut
from app.auth.deps import get_current_user
from app.auth.scoping import visible_site_ids
from app.common.errors import AppError
from app.common.pagination import MAX_LIMIT, decode_cursor, encode_cursor
from app.db import get_session
from app.models import (
    Change,
    Decision,
    HomeownerRequest,
    Milestone,
    PublishedPhoto,
    Site,
    SiteFinding,
    Update,
    User,
    WeeklySummary,
)
from app.models.profiler import ProfilerBrief, ProfilerBriefApproval, ProfilerProfile

# The owner Home feed shows a short recent slice by default (unlike list/table
# endpoints elsewhere that default to 50) — 20 keeps the initial payload light.
DEFAULT_ACTIVITY_LIMIT = 20

router = APIRouter(prefix="/api/v1", tags=["activity"])


def encode_activity_cursor(cursor: tuple[str, str] | None) -> str | None:
    """Pack ``(occurred_at_iso, id)`` into an opaque base64 token."""
    if cursor is None:
        return None
    occurred_at, item_id = cursor
    return encode_cursor(f"{occurred_at}|{item_id}")


def decode_activity_cursor(raw: str | None) -> tuple[str, str] | None:
    """Inverse of :func:`encode_activity_cursor`; 400 on tampered input."""
    if raw is None:
        return None
    try:
        payload = decode_cursor(raw)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc
    if payload is None or "|" not in payload:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor")
    occurred_at, item_id = payload.split("|", 1)
    return (occurred_at, item_id)


@router.get("/activity", response_model=ActivityPageOut)
async def get_activity(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    site_id: UUID | None = Query(None),
    cursor: str | None = Query(None),
    limit: int = Query(DEFAULT_ACTIVITY_LIMIT),
) -> ActivityPageOut:
    """The unified, time-ordered owner activity feed (keyset-paginated)."""
    page_size = DEFAULT_ACTIVITY_LIMIT if limit <= 0 else min(limit, MAX_LIMIT)
    decoded = decode_activity_cursor(cursor)

    visible = await visible_site_ids(session, user)
    if site_id is not None:
        # Narrow to the requested site, but only if it is in scope.
        visible = [sid for sid in visible if sid == site_id]
    if not visible:
        empty = build_activity(
            sites=[], photos=[], updates=[], milestones=[], weekly_summaries=[],
            changes=[], requests=[], decisions=[], findings=[],
            design_approvals=[], design_briefs=[],
            now=dt.datetime.now(dt.UTC), limit=page_size, cursor=decoded,
            updates_today=0, needs_decision_count=0, sites_total=0,
        )
        return ActivityPageOut(
            items=empty["items"], summary=empty["summary"],
            next_cursor=encode_activity_cursor(empty["next_cursor"]),
        )

    sites = list(
        (await session.execute(select(Site).where(Site.id.in_(visible)))).scalars().all()
    )

    # Per-source: newest first, capped at page_size+1 so the pure merge can
    # detect the "there is a next page" boundary even after cross-source merge.
    # We over-fetch (page_size + 1) per source; the aggregator applies the true
    # keyset trim across the merged set.
    #
    # Every page re-issues each per-source query from scratch (no per-source
    # offset is tracked across requests), so without a cursor-aware WHERE the
    # query would keep re-fetching the same top-`cap` rows on every page and a
    # source could appear to "run dry" after its first `cap` rows even though
    # older rows remain. `_cursor_filter` pushes the cursor boundary down as a
    # pre-filter so each page's fetch is anchored at the right depth. The
    # cursor's datetime is used directly for `datetime` columns; `date`-typed
    # columns (Milestone, WeeklySummary, SiteFinding) compare against its
    # `.date()`. Both branches use `<=`, not `<`: this is deliberately a safe
    # superset, not the exact boundary — a row whose occurred_at equals the
    # cursor's timestamp but whose id sorts before the cursor's id must still
    # come back (the date-column case additionally needs `<=` because `_as_utc`
    # normalizes a `date` to midnight, which is always <= a same-day cursor
    # timestamp). The aggregator's own exact tuple comparison
    # (`(occurred_at_iso, id) < cursor`) applies the precise trim after, so the
    # over-fetched equal-timestamp rows are resolved correctly instead of a
    # strict SQL `<` silently dropping one of them ahead of that trim.
    cap = page_size + 1
    cursor_dt: dt.datetime | None = None
    if decoded is not None:
        try:
            cursor_dt = dt.datetime.fromisoformat(decoded[0])
        except ValueError as exc:
            # decode_activity_cursor only checks for the "|" delimiter, not that
            # the occurred_at half is a valid timestamp — a syntactically-shaped
            # but semantically-garbage cursor must still 400, not 500.
            raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc

    def _cursor_filter(stmt, order_col, *, date_col: bool = False):
        if cursor_dt is None:
            return stmt
        bound = cursor_dt.date() if date_col else cursor_dt
        return stmt.where(order_col.__le__(bound))

    async def _load(model, order_col, *, date_col: bool = False, extra=()):
        stmt = select(model).where(model.site_id.in_(visible), *extra)
        stmt = _cursor_filter(stmt, order_col, date_col=date_col)
        stmt = stmt.order_by(order_col.desc()).limit(cap)
        return list((await session.execute(stmt)).scalars().all())

    photos = await _load(PublishedPhoto, PublishedPhoto.published_at)
    updates = await _load(Update, Update.published_at)
    milestones = await _load(
        Milestone, Milestone.completed_on,
        date_col=True, extra=(Milestone.status == "done",),
    )
    weekly = await _load(WeeklySummary, WeeklySummary.week_start, date_col=True)
    changes = await _load(Change, Change.created_at)
    requests = await _load(HomeownerRequest, HomeownerRequest.created_at)
    decisions = list(
        (
            await session.execute(
                _cursor_filter(
                    select(Decision).where(
                        Decision.company_id == user.company_id,
                        Decision.site_id.in_(visible),
                        Decision.kind.in_(_DECISION_KINDS),
                    ),
                    Decision.created_at,
                )
                .order_by(Decision.created_at.desc())
                .limit(cap)
            )
        ).scalars().all()
    )
    findings = await _load(
        SiteFinding, SiteFinding.detected_on,
        date_col=True, extra=(SiteFinding.status == "open",),
    )

    # Design brief hand-offs: profiler tables carry no site_id of their own,
    # so scope via an explicit join to ProfilerProfile (mirrors how
    # `decisions` above builds its own custom select instead of using `_load`).
    # Each row list comes back as (row, profile) pairs — aggregate.py needs the
    # profile alongside the row to resolve the site.
    design_approvals = list(
        (
            await session.execute(
                _cursor_filter(
                    select(ProfilerBriefApproval, ProfilerProfile)
                    .join(ProfilerBrief, ProfilerBriefApproval.brief_id == ProfilerBrief.id)
                    .join(ProfilerProfile, ProfilerBrief.profile_id == ProfilerProfile.id)
                    .where(ProfilerProfile.site_id.in_(visible)),
                    ProfilerBriefApproval.created_at,
                )
                .order_by(ProfilerBriefApproval.created_at.desc())
                .limit(cap)
            )
        ).all()
    )
    design_briefs = list(
        (
            await session.execute(
                _cursor_filter(
                    select(ProfilerBrief, ProfilerProfile)
                    .join(ProfilerProfile, ProfilerBrief.profile_id == ProfilerProfile.id)
                    .where(ProfilerProfile.site_id.in_(visible)),
                    ProfilerBrief.created_at,
                )
                .order_by(ProfilerBrief.created_at.desc())
                .limit(cap)
            )
        ).all()
    )

    now = dt.datetime.now(dt.UTC)
    updates_today, needs_decision_count = await _summary_counts(session, visible, user, now)

    result = build_activity(
        sites=sites, photos=photos, updates=updates, milestones=milestones,
        weekly_summaries=weekly, changes=changes, requests=requests,
        decisions=decisions, findings=findings,
        design_approvals=design_approvals, design_briefs=design_briefs,
        now=now, limit=page_size, cursor=decoded,
        updates_today=updates_today, needs_decision_count=needs_decision_count,
        sites_total=len(visible),
    )
    return ActivityPageOut(
        items=result["items"], summary=result["summary"],
        next_cursor=encode_activity_cursor(result["next_cursor"]),
    )


async def _count(session: AsyncSession, model, *where) -> int:
    stmt = select(func.count()).select_from(model).where(*where)
    return (await session.execute(stmt)).scalar_one()


async def _summary_counts(
    session: AsyncSession, visible: list[UUID], user: User, now: dt.datetime,
) -> tuple[int, int]:
    """Un-capped ``(updates_today, needs_decision_count)`` for the summary.

    Deliberately independent of the page's per-source ``cap`` (``page_size +
    1``) — a dedicated ``COUNT(*)`` per source/condition, not a tally over the
    (possibly-capped) rows already fetched for ``items``. Otherwise a small
    ``limit`` (e.g. the OwnerHome hero's ``limit=1``) silently undercounts,
    which is worst for ``needs_decision_count`` — it would hide real pending
    work from the owner. ``visible`` is always non-empty here: the router
    returns early (before this is called) when the caller has no visible
    sites at all.
    """
    today_start = dt.datetime(now.year, now.month, now.day, tzinfo=dt.UTC)
    today_end = today_start + dt.timedelta(days=1)
    today_date = today_start.date()

    def _in_scope(model):
        return (model.site_id.in_(visible),)

    # updates_today: one un-capped COUNT per activity source, each matching the
    # exact same site-scope + item-eligibility filter build_activity applies
    # when deciding whether a row becomes an item (see aggregate.py), windowed
    # to "occurred today" in UTC. datetime columns use a half-open [start, end)
    # window; date columns compare directly against today's date.
    updates_today = sum([
        await _count(session, PublishedPhoto, *_in_scope(PublishedPhoto),
                     PublishedPhoto.published_at >= today_start,
                     PublishedPhoto.published_at < today_end),
        await _count(session, Update, *_in_scope(Update),
                     Update.published_at >= today_start,
                     Update.published_at < today_end),
        await _count(session, Milestone, *_in_scope(Milestone),
                     Milestone.status == "done", Milestone.completed_on == today_date),
        await _count(session, WeeklySummary, *_in_scope(WeeklySummary),
                     WeeklySummary.week_start == today_date),
        await _count(session, Change, *_in_scope(Change),
                     Change.created_at >= today_start, Change.created_at < today_end),
        await _count(session, HomeownerRequest, *_in_scope(HomeownerRequest),
                     HomeownerRequest.created_at >= today_start,
                     HomeownerRequest.created_at < today_end),
        await _count(session, Decision, Decision.company_id == user.company_id,
                     *_in_scope(Decision), Decision.kind.in_(_DECISION_KINDS),
                     Decision.created_at >= today_start, Decision.created_at < today_end),
        await _count(session, SiteFinding, *_in_scope(SiteFinding),
                     SiteFinding.status == "open", SiteFinding.detected_on == today_date),
    ])

    # needs_decision_count: open homeowner requests + open-state approval/
    # hold_payment decisions — the same two sources build_activity used to tally
    # from its (capped) input lists, now an un-capped COUNT instead.
    needs_decision_count = (
        await _count(session, HomeownerRequest, *_in_scope(HomeownerRequest),
                     HomeownerRequest.status.in_(_OPEN_REQUEST_STATUSES))
    ) + (
        await _count(session, Decision, Decision.company_id == user.company_id,
                     *_in_scope(Decision), Decision.kind.in_(_DECISION_KINDS),
                     Decision.state.in_(_OPEN_DECISION_STATES))
    )
    return updates_today, needs_decision_count
