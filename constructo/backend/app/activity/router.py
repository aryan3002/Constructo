"""GET /api/v1/activity — the Owner activity-first Command Center feed.

Company-scoped, keyset-paginated union over nine homeowner-feed / decision /
finding source tables. The session work (loading rows per source, ordered +
capped) lives here; the merge/sort/summary is the pure ``aggregate.build_activity``.
"""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.activity.aggregate import build_activity
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
            now=dt.datetime.now(dt.UTC), limit=page_size, cursor=decoded,
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
    # `.date()` with `<=` — a safe superset (`_as_utc` normalizes a `date` to
    # midnight, which is always <= a same-day cursor timestamp); the
    # aggregator's own exact tuple comparison applies the precise trim after.
    cap = page_size + 1
    cursor_dt: dt.datetime | None = (
        dt.datetime.fromisoformat(decoded[0]) if decoded is not None else None
    )

    def _cursor_filter(stmt, order_col, *, date_col: bool = False):
        if cursor_dt is None:
            return stmt
        bound = cursor_dt.date() if date_col else cursor_dt
        op = order_col.__le__ if date_col else order_col.__lt__
        return stmt.where(op(bound))

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
                        Decision.kind.in_(["approval", "hold_payment"]),
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

    result = build_activity(
        sites=sites, photos=photos, updates=updates, milestones=milestones,
        weekly_summaries=weekly, changes=changes, requests=requests,
        decisions=decisions, findings=findings,
        now=dt.datetime.now(dt.UTC), limit=page_size, cursor=decoded,
    )
    return ActivityPageOut(
        items=result["items"], summary=result["summary"],
        next_cursor=encode_activity_cursor(result["next_cursor"]),
    )
