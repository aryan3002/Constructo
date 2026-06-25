"""Site Health API (proactive intelligence).

``GET /api/v1/sites/{site_id}/health`` — the contractor Site Health surface:
score, band, and the active findings for a site. ``?refresh=true`` recomputes
live (runs the engine) before reading; otherwise it returns what the nightly
sweep persisted. ``POST /api/v1/findings/{id}/acknowledge|resolve`` update a
finding's status. Scoped (``effective_visible_site_ids``, homeowner blocked —
the homeowner gets a separate filtered surface in Phase 3).
"""
from __future__ import annotations

from collections import Counter
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.db import get_session
from app.intelligence.engine import run_site
from app.intelligence.score import health_band, health_score
from app.models import SiteFinding, User, UserRole
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["intelligence"])

_ACTIVE = ("open", "acknowledged")
_RANK = {"critical": 3, "high": 2, "medium": 1, "low": 0}


class FindingOut(BaseModel):
    id: UUID
    finding_type: str
    severity: str
    status: str
    headline: str
    detail: str
    phase: str | None = None
    evidence: list = []
    detected_on: date


class HealthOut(BaseModel):
    site_id: UUID
    score: int
    band: str
    counts: dict[str, int]
    findings: list[FindingOut]


async def _require_visible_site(session: AsyncSession, user: User, site_id: UUID) -> None:
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Site Health is a crew-side surface")
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")


async def _active_findings(session: AsyncSession, site_id: UUID) -> list[SiteFinding]:
    rows = list(
        (
            await session.execute(
                select(SiteFinding)
                .where(SiteFinding.site_id == site_id)
                .where(SiteFinding.status.in_(_ACTIVE))
            )
        ).scalars()
    )
    rows.sort(key=lambda r: _RANK.get(r.severity, 0), reverse=True)
    return rows


@router.get("/sites/{site_id}/health", response_model=HealthOut)
async def site_health(
    site_id: UUID,
    refresh: bool = Query(False),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> HealthOut:
    await _require_visible_site(session, user, site_id)
    if refresh:
        await run_site(session, site_id, today=date.today())
        await session.commit()
    rows = await _active_findings(session, site_id)
    score = health_score([r.severity for r in rows])
    return HealthOut(
        site_id=site_id,
        score=score,
        band=health_band(score),
        counts=dict(Counter(r.severity for r in rows)),
        findings=[FindingOut.model_validate(r, from_attributes=True) for r in rows],
    )


async def _get_scoped_finding(
    session: AsyncSession, user: User, finding_id: UUID
) -> SiteFinding:
    row = await session.get(SiteFinding, finding_id)
    if row is None:
        raise AppError(404, "not_found", "Finding not found")
    await _require_visible_site(session, user, row.site_id)
    return row


@router.post("/findings/{finding_id}/acknowledge", response_model=FindingOut)
async def acknowledge_finding(
    finding_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FindingOut:
    row = await _get_scoped_finding(session, user, finding_id)
    row.status = "acknowledged"
    await session.commit()
    return FindingOut.model_validate(row, from_attributes=True)


@router.post("/findings/{finding_id}/resolve", response_model=FindingOut)
async def resolve_finding(
    finding_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FindingOut:
    row = await _get_scoped_finding(session, user, finding_id)
    row.status = "resolved"
    row.resolved_on = date.today()
    await session.commit()
    return FindingOut.model_validate(row, from_attributes=True)
