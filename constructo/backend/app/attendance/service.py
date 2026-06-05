"""Attendance domain logic, kept free of FastAPI so it's unit-testable.

Two concerns:
  * Persisting a captured attendance as an ``attendance`` SiteEvent (the shared
    event ledger the rest of Constructo already reads).
  * Computing planned-vs-actual headcount against the B0 ``site_baselines`` row.

Voice/photo captures from the WhatsApp feed already land as attendance events
via ``app/extraction``; the app's write path produces the *same* event shape so
the timeline, briefs, and risk detection stay consistent.
"""
from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Payment, SiteBaseline, SiteEventModel

# A shortfall up to this fraction of the expected headcount is a "warn"; beyond
# it (or fully absent labour) is a "risk". Mirrors the brief's risk tone.
_WARN_TOLERANCE = 0.15

# Total app-captured attendance reuses the SiteEvent contract; we tag the
# capture source + proof inside ``fields`` so we don't need a new table/migration.
ATTENDANCE_EVENT_TYPE = "attendance"


def build_summary(headcount: int, by_trade: dict[str, int] | None, note: str | None) -> str:
    """A short, human, Hindi-friendly summary line for the timeline.

    The number leads (it's what a supervisor scans for); trade breakdown and any
    note follow. Kept plain so it reads the same in the app and the brief.
    """
    worker_word = "worker" if headcount == 1 else "workers"
    summary = f"{headcount} {worker_word} present"
    if by_trade:
        parts = ", ".join(f"{n} {trade}" for trade, n in by_trade.items())
        summary += f" ({parts})"
    if note:
        summary += f" — {note.strip()}"
    return summary


def classify_variance(expected: int | None, actual: int) -> tuple[int | None, str]:
    """Return ``(variance, status)`` on the shared status spine.

    ``variance = actual - expected`` (negative = short). With no baseline we
    can't judge, so it's neutral ``info``.
    """
    if expected is None:
        return None, "info"
    variance = actual - expected
    if variance >= 0:
        return variance, "ok"
    shortfall = -variance
    if shortfall <= max(1, round(expected * _WARN_TOLERANCE)):
        return variance, "warn"
    return variance, "risk"


async def create_attendance_event(
    session: AsyncSession,
    *,
    site_id: UUID,
    occurred_on: date,
    headcount: int,
    by_trade: dict[str, int] | None,
    note: str | None,
    source: str,
    proof_media_urls: list[str],
    client_capture_id: str | None,
) -> SiteEventModel:
    """Persist an app-captured attendance as an ``attendance`` SiteEvent.

    Idempotent on ``client_capture_id`` within a site: a retried capture (e.g.
    the offline queue flushing twice) returns the already-stored event rather
    than duplicating it.
    """
    if client_capture_id:
        existing = await _find_by_client_capture_id(session, site_id, client_capture_id)
        if existing is not None:
            return existing

    fields: dict = {
        "headcount": headcount,
        "by_trade": by_trade,
        "raw_phrase": note,
        "capture_source": source,
        "proof_media_urls": proof_media_urls,
    }
    if client_capture_id:
        fields["client_capture_id"] = client_capture_id

    event = SiteEventModel(
        site_id=site_id,
        event_type=ATTENDANCE_EVENT_TYPE,
        occurred_on=occurred_on,
        summary=build_summary(headcount, by_trade, note),
        fields=fields,
        # App captures are first-party (a human pressed the button), so unlike a
        # parsed WhatsApp message they're high-confidence and never need clarifying.
        confidence=1.0,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    session.add(event)
    await session.flush()
    return event


async def _find_by_client_capture_id(
    session: AsyncSession, site_id: UUID, client_capture_id: str
) -> SiteEventModel | None:
    stmt = (
        select(SiteEventModel)
        .where(
            SiteEventModel.site_id == site_id,
            SiteEventModel.event_type == ATTENDANCE_EVENT_TYPE,
            SiteEventModel.fields["client_capture_id"].astext == client_capture_id,
        )
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def planned_vs_actual(
    session: AsyncSession, *, site_id: UUID, occurred_on: date
) -> tuple[int | None, int, int | None, str, int]:
    """Compute ``(expected, actual, variance, status, capture_count)`` for a day.

    ``expected`` comes from the site baseline (may be unset). ``actual`` is the
    headcount from the *latest* attendance capture that day (the freshest count
    supersedes earlier ones), and ``capture_count`` is how many captures landed.
    """
    baseline = (
        await session.execute(
            select(SiteBaseline.expected_daily_headcount).where(
                SiteBaseline.site_id == site_id
            )
        )
    ).scalar_one_or_none()

    rows = (
        await session.execute(
            select(SiteEventModel)
            .where(
                SiteEventModel.site_id == site_id,
                SiteEventModel.event_type == ATTENDANCE_EVENT_TYPE,
                SiteEventModel.occurred_on == occurred_on,
            )
            # id is a deterministic tiebreak: created_at can now hold a back-dated
            # message time (imports), so two same-day attendance messages may share
            # an identical created_at — without the tiebreak "latest wins" would be
            # non-deterministic. Mirrors the timeline query's (created_at, id) order.
            .order_by(SiteEventModel.created_at, SiteEventModel.id)
        )
    ).scalars().all()

    actual = 0
    for ev in rows:
        hc = (ev.fields or {}).get("headcount")
        if isinstance(hc, int):
            actual = hc  # latest non-null wins (rows are oldest -> newest)

    variance, status = classify_variance(baseline, actual)
    return baseline, actual, variance, status, len(rows)


async def my_recorded_payments(
    session: AsyncSession,
    *,
    company_id: UUID,
    counterparty_name: str,
    site_ids: list[UUID] | None,
    limit: int,
) -> list[Payment]:
    """Payments the contractor recorded against this mukadam (read-only).

    Matched by ``counterparty_name`` within the caller's company, optionally
    constrained to the sites they're scoped to. Money is never moved here.
    """
    if not counterparty_name:
        return []
    stmt = select(Payment).where(
        Payment.company_id == company_id,
        func.lower(Payment.counterparty_name) == counterparty_name.strip().lower(),
    )
    if site_ids is not None:
        # Allow company-level (site_id NULL) payments plus the caller's sites.
        stmt = stmt.where(
            (Payment.site_id.is_(None)) | (Payment.site_id.in_(site_ids))
        )
    stmt = stmt.order_by(Payment.paid_on.desc(), Payment.created_at.desc()).limit(limit)
    return list((await session.execute(stmt)).scalars().all())
