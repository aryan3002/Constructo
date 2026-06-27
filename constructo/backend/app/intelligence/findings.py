"""Persistence for proactive findings: dedupe on rerun, auto-resolve when cleared.

The engine produces the full current finding set each night. ``persist_findings``
reconciles that set against the site's existing open/acknowledged rows:
  - a finding whose ``dedupe_key`` already exists is UPDATED in place (one row per
    recurring condition, never a nightly pile-up);
  - an acknowledged finding that recurs stays acknowledged (don't re-nag);
  - an open/acknowledged finding NOT in tonight's set is auto-RESOLVED (the
    condition cleared on its own).
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.intelligence.detectors.base import Finding
from app.models import SiteFinding

ACTIVE = ("open", "acknowledged")


def dedupe_key(finding_type: str, phase: str | None) -> str:
    """Stable identity for a recurring condition."""
    return f"{finding_type}:{phase or '-'}"


async def persist_findings(
    session: AsyncSession,
    site_id: UUID,
    findings: list[Finding],
    *,
    detected_on: date,
) -> list[SiteFinding]:
    """Reconcile tonight's findings into ``site_findings`` and return the active rows."""
    existing = list(
        (
            await session.execute(
                select(SiteFinding)
                .where(SiteFinding.site_id == site_id)
                .where(SiteFinding.status.in_(ACTIVE))
            )
        ).scalars()
    )
    by_key = {row.dedupe_key: row for row in existing}
    seen: set[str] = set()

    for f in findings:
        key = dedupe_key(f.finding_type, f.phase)
        seen.add(key)
        row = by_key.get(key)
        if row is None:
            row = SiteFinding(
                site_id=site_id,
                finding_type=f.finding_type,
                severity=f.severity,
                status="open",
                headline=f.headline,
                detail=f.detail,
                phase=f.phase,
                dedupe_key=key,
                evidence=list(f.evidence_event_ids),
                detected_on=detected_on,
            )
            session.add(row)
            by_key[key] = row
        else:
            # Refresh content; preserve status (acknowledged stays acknowledged).
            row.severity = f.severity
            row.headline = f.headline
            row.detail = f.detail
            row.evidence = list(f.evidence_event_ids)
            row.detected_on = detected_on

    # Auto-resolve anything still active but no longer firing.
    for row in existing:
        if row.dedupe_key not in seen:
            row.status = "resolved"
            row.resolved_on = detected_on

    await session.flush()
    return [row for row in by_key.values() if row.status in ACTIVE]
