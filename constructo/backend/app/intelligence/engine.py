"""The proactive-intelligence engine: orchestrates one site's nightly pass.

Loads the site's recent events + milestones, runs every deterministic detector,
reconciles findings (dedupe / auto-resolve), and computes the health score. Pure
detectors + a thin DB shell, so the heavy logic stays unit-tested offline.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.site_events import latest_event_clause
from app.intelligence.detectors import consistency, operational, quality, schedule
from app.intelligence.detectors.base import EventRow, Finding, MilestoneRow
from app.intelligence.findings import persist_findings
from app.intelligence.score import health_band, health_score
from app.models import Milestone, SiteEventModel, SiteFinding

# How far back to load events for the detectors (covers the longest window any
# detector cares about — vendor/issue lookbacks are 30d, idle/mismatch shorter).
HISTORY_DAYS = 120


@dataclass
class EngineResult:
    findings: list[SiteFinding]
    score: int
    band: str


async def _load_events(session: AsyncSession, site_id: UUID, *, since: date) -> list[EventRow]:
    rows = (
        await session.execute(
            select(SiteEventModel)
            .where(SiteEventModel.site_id == site_id)
            .where(SiteEventModel.occurred_on >= since)
            .where(latest_event_clause())
        )
    ).scalars().all()
    return [
        EventRow(
            id=str(e.id), event_type=e.event_type, occurred_on=e.occurred_on,
            summary=e.summary or "", fields=e.fields or {}, confidence=e.confidence,
        )
        for e in rows
    ]


async def _load_milestones(session: AsyncSession, site_id: UUID) -> list[MilestoneRow]:
    rows = (
        await session.execute(select(Milestone).where(Milestone.site_id == site_id))
    ).scalars().all()
    return [
        MilestoneRow(
            id=str(m.id), name=m.name, status=m.status.value,
            started_on=m.started_on, expected_on=m.expected_on, completed_on=m.completed_on,
        )
        for m in rows
    ]


def _run_detectors(
    events: list[EventRow], milestones: list[MilestoneRow], *, today: date
) -> list[Finding]:
    """Every deterministic detector, concatenated. Pure — no DB, no LLM."""
    return [
        *schedule.stale_milestone(milestones, today=today),
        *schedule.phase_sequence_violation(milestones, today=today),
        *consistency.material_work_mismatch(events, today=today),
        *operational.idle_gap(events, today=today),
        *operational.attendance_erosion(events, today=today),
        *operational.vendor_concentration(events, today=today),
        *operational.repeat_issue_pattern(events, today=today),
        *quality.curing_violation(events, today=today),
        *quality.missing_approval(events, today=today),
    ]


async def run_site(session: AsyncSession, site_id: UUID, *, today: date) -> EngineResult:
    """Run the full nightly intelligence pass for one site."""
    events = await _load_events(session, site_id, since=today - timedelta(days=HISTORY_DAYS))
    milestones = await _load_milestones(session, site_id)
    found = _run_detectors(events, milestones, today=today)
    active = await persist_findings(session, site_id, found, detected_on=today)
    score = health_score([f.severity for f in active])
    return EngineResult(findings=active, score=score, band=health_band(score))
