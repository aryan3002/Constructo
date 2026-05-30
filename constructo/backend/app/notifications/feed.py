"""Bell-feed derivation: turn open ledger decisions into per-recipient items.

The feed is exceptions-only (open/escalated decisions) and per-role routed. A
decision routes to a role; the role fans out to the concrete users in the
recipient's company who hold that role. Homeowner questions route to their
explicit ``assigned_to`` owner when set, otherwise to all owners.

Threshold-awareness: when a decision is tied to a site, its severity can be
sharpened by the site's baseline (e.g. a payment hold on a site that is also
short-staffed reads as higher risk). The baseline read is best-effort.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Decision, SiteBaseline, User, UserRole
from app.notifications import routing, store


@dataclass(slots=True)
class FeedItem:
    id: UUID  # == decision id (one item per decision per recipient view)
    recipient_id: UUID
    role: UserRole
    decision_id: UUID
    site_id: UUID | None
    kind: str
    title: str
    body: str | None
    severity: str
    read_at: datetime | None
    created_at: datetime


async def _recipients_for(
    session: AsyncSession, company_id: UUID, decision: Decision
) -> list[User]:
    """Resolve the concrete users a decision's feed item should reach."""
    role = routing.role_for_kind(decision.kind)

    # Homeowner questions go to their assigned owner specifically (if set).
    if decision.assigned_to is not None:
        target = await session.get(User, decision.assigned_to)
        if target is not None and target.company_id == company_id:
            return [target]

    rows = await session.execute(
        select(User).where(User.company_id == company_id, User.role == role)
    )
    return list(rows.scalars().all())


async def _baseline_for(session: AsyncSession, site_id: UUID | None) -> SiteBaseline | None:
    if site_id is None:
        return None
    rows = await session.execute(
        select(SiteBaseline).where(SiteBaseline.site_id == site_id)
    )
    return rows.scalar_one_or_none()


def _sharpen_severity(base: str, baseline: SiteBaseline | None) -> str:
    """Threshold-aware bump: an at-risk site escalates a warn item to risk."""
    if base == "warn" and baseline is not None and baseline.expected_daily_headcount:
        # A site with an explicit staffing expectation is one we actively watch;
        # treat its open exceptions as higher priority.
        return "risk"
    return base


async def build_feed(
    session: AsyncSession, *, company_id: UUID, recipient: User
) -> list[FeedItem]:
    """Build ``recipient``'s exceptions-only bell feed for their company."""
    rows = await session.execute(
        select(Decision)
        .where(Decision.company_id == company_id)
        .order_by(Decision.created_at.desc())
    )
    items: list[FeedItem] = []
    for d in rows.scalars().all():
        if not routing.is_exception(d.state):
            continue
        recipients = await _recipients_for(session, company_id, d)
        if recipient.id not in {r.id for r in recipients}:
            continue
        baseline = await _baseline_for(session, d.site_id)
        severity = _sharpen_severity(
            routing.severity_for(d.kind, d.state), baseline
        )
        items.append(
            FeedItem(
                id=d.id,
                recipient_id=recipient.id,
                role=routing.role_for_kind(d.kind),
                decision_id=d.id,
                site_id=d.site_id,
                kind=d.kind.value,
                title=d.title,
                body=d.detail,
                severity=severity,
                read_at=None
                if not store.is_read(recipient.id, d.id)
                else d.updated_at,
                created_at=d.created_at,
            )
        )
    return items


async def unread_count(
    session: AsyncSession, *, company_id: UUID, recipient: User
) -> int:
    feed = await build_feed(session, company_id=company_id, recipient=recipient)
    return sum(1 for it in feed if it.read_at is None)
