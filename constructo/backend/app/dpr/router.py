"""PM Auto-DPR endpoints (C4).

The Daily Progress Report drafts itself from the day's ``site_events`` and the
PM *reviews, edits, and sends* it.

  - ``POST /api/v1/dpr/sites/{site_id}/draft?date=`` (owner/pm): generate (or
    re-fetch) today's auto-draft for a site. Idempotent per site+date — a
    second call returns the existing draft rather than duplicating, and never
    clobbers a DPR already ``sent``.
  - ``GET  /api/v1/dpr/sites/{site_id}?date=`` (owner/pm): fetch the stored DPR
    for a site+date (404 if none drafted yet).
  - ``PATCH /api/v1/dpr/{dpr_id}`` (owner/pm): the PM edits the sections of a
    still-``draft`` DPR. Editing a ``sent`` DPR is rejected.
  - ``POST /api/v1/dpr/{dpr_id}/send`` (owner/pm): the human commit — flips
    ``draft → sent`` and stamps ``sent_at``. Idempotent. THERE IS NO PATH THAT
    SENDS A DPR WITHOUT THIS EXPLICIT HUMAN ACTION (CA1 — never auto-sent).

All routes are site-scoped exactly like ``app/reconcile`` (``effective_visible_
site_ids``) and gated to owner/pm.
"""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_role
from app.common.errors import AppError
from app.db import get_session
from app.dpr.draft import draft_dpr
from app.models import Dpr, DprStatus, Site, User, UserRole
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/dpr", tags=["dpr"])


# --- schemas ----------------------------------------------------------------


class DprOut(BaseModel):
    id: UUID
    site_id: UUID
    report_date: dt.date
    sections: dict
    status: str
    generated_at: dt.datetime
    sent_at: dt.datetime | None
    evidence_event_ids: list[str]


class DprEditIn(BaseModel):
    # The PM may replace the whole sections object (reviewer edits inline).
    sections: dict


def _out(d: Dpr) -> DprOut:
    return DprOut(
        id=d.id,
        site_id=d.site_id,
        report_date=d.report_date,
        sections=d.sections or {},
        status=d.status.value if isinstance(d.status, DprStatus) else str(d.status),
        generated_at=d.generated_at,
        sent_at=d.sent_at,
        evidence_event_ids=list(d.evidence_event_ids or []),
    )


# --- scoping ----------------------------------------------------------------


async def _require_site_in_scope(
    session: AsyncSession, user: User, site_id: UUID
) -> Site:
    visible = await effective_visible_site_ids(session, user)
    site = await session.get(Site, site_id)
    if site is None:
        raise AppError(404, "not_found", "Site not found")
    if site_id not in visible:
        raise AppError(403, "forbidden", "Site not in scope")
    return site


async def _load_dpr_in_scope(
    session: AsyncSession, user: User, dpr_id: UUID
) -> Dpr:
    dpr = await session.get(Dpr, dpr_id)
    if dpr is None:
        raise AppError(404, "not_found", "DPR not found")
    await _require_site_in_scope(session, user, dpr.site_id)
    return dpr


def _resolve_date(value: dt.date | None) -> dt.date:
    return value or dt.datetime.now(dt.UTC).date()


# --- routes -----------------------------------------------------------------


@router.post("/sites/{site_id}/draft", response_model=DprOut)
async def generate_draft(
    site_id: UUID,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
    date: dt.date | None = Query(None),
) -> DprOut:
    """Auto-draft (or re-fetch) the DPR for a site+date from the day's events.

    Idempotent per site+date: if a DPR already exists it is returned unchanged
    — a ``sent`` DPR is never clobbered, and an existing ``draft`` is returned
    as-is so the PM's edits survive a re-open.
    """
    await _require_site_in_scope(session, user, site_id)
    report_date = _resolve_date(date)

    existing = (
        await session.execute(
            select(Dpr).where(
                Dpr.site_id == site_id, Dpr.report_date == report_date
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return _out(existing)

    drafted = await draft_dpr(session, site_id, report_date, llm=None)
    dpr = Dpr(
        site_id=drafted.site_id,
        report_date=drafted.report_date,
        sections=drafted.sections,
        status=DprStatus.draft,
        evidence_event_ids=drafted.evidence_event_ids,
    )
    session.add(dpr)
    await session.commit()
    await session.refresh(dpr)
    return _out(dpr)


@router.get("/sites/{site_id}", response_model=DprOut)
async def get_dpr(
    site_id: UUID,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
    date: dt.date | None = Query(None),
) -> DprOut:
    """Fetch the stored DPR for a site+date (404 if none drafted yet)."""
    await _require_site_in_scope(session, user, site_id)
    report_date = _resolve_date(date)

    dpr = (
        await session.execute(
            select(Dpr).where(
                Dpr.site_id == site_id, Dpr.report_date == report_date
            )
        )
    ).scalar_one_or_none()
    if dpr is None:
        raise AppError(404, "not_found", "No DPR for this site and date")
    return _out(dpr)


@router.patch("/{dpr_id}", response_model=DprOut)
async def edit_dpr(
    dpr_id: UUID,
    body: DprEditIn,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> DprOut:
    """PM edits the sections of a still-``draft`` DPR. A ``sent`` DPR is locked."""
    dpr = await _load_dpr_in_scope(session, user, dpr_id)
    if dpr.status is DprStatus.sent:
        raise AppError(409, "already_sent", "A sent DPR cannot be edited")
    dpr.sections = body.sections
    await session.commit()
    await session.refresh(dpr)
    return _out(dpr)


@router.post("/{dpr_id}/send", response_model=DprOut)
async def send_dpr(
    dpr_id: UUID,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> DprOut:
    """The human commit: flip ``draft → sent`` and stamp ``sent_at``.

    Idempotent — sending an already-``sent`` DPR returns it unchanged. This is
    the ONLY path that sets ``sent``; no draft/auto path ever does (CA1).
    """
    dpr = await _load_dpr_in_scope(session, user, dpr_id)
    if dpr.status is DprStatus.draft:
        dpr.status = DprStatus.sent
        dpr.sent_at = dt.datetime.now(dt.UTC)
        await session.commit()
        await session.refresh(dpr)
    return _out(dpr)
