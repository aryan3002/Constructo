"""In-process nightly brief scheduler (APScheduler).

When ``settings.enable_scheduler`` is true, :func:`start_scheduler` schedules
:func:`app.brief.schedule.run_nightly` to run daily at ``settings.brief_hour``
in ``settings.brief_timezone`` (default 07:00 Asia/Kolkata). It is wired into
the FastAPI lifespan in :mod:`app.main`. Disabled by default so tests/CI never
spin a background scheduler.
"""
from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)

_scheduler = None


async def _run_nightly_job() -> None:
    """Build + DELIVER the morning brief over WhatsApp for every company.

    Uses the bot's ``deliver_brief`` (build_brief + send to the owner + persist
    the number→decision ``reply_map`` into ``owner_briefs.payload``) so the owner
    can reply "1"/"approve"/"hold" right in WhatsApp. Per-company errors are
    isolated; never crashes the loop. (Outbound transport honours BOT_SEND_VIA;
    dry-run by default.) Imported lazily so module import stays side-effect free.
    """
    from sqlalchemy import select

    from app.bot.brief_delivery import deliver_brief
    from app.brief.schedule import _yesterday
    from app.db import SessionLocal
    from app.models import Company

    target = _yesterday()
    try:
        async with SessionLocal() as session:
            company_ids = list((await session.execute(select(Company.id))).scalars().all())
        delivered = 0
        for company_id in company_ids:
            try:
                async with SessionLocal() as session:
                    await deliver_brief(session, company_id, target)
                delivered += 1
            except Exception:
                logger.exception("nightly brief delivery failed for company %s", company_id)
        logger.info(
            "nightly brief job complete: delivered %d/%d brief(s)", delivered, len(company_ids)
        )
    except Exception:
        logger.exception("nightly brief job failed")


async def _run_sla_sweep_job() -> None:
    """Escalate overdue decisions. Owns its session; never crashes the loop.

    ``run_sla_sweep`` takes a session and sweeps all tenants when no
    ``company_id`` is given.
    """
    from app.approvals.sla import run_sla_sweep
    from app.db import SessionLocal

    try:
        async with SessionLocal() as session:
            escalated = await run_sla_sweep(session)
        logger.info("sla sweep job complete: %d escalated", len(escalated))
    except Exception:
        logger.exception("sla sweep job failed")


async def _run_permit_sweep_job() -> None:
    """Raise permit expiry/renewal/staleness alerts. Never crashes the loop.

    ``run_permit_sweep`` manages its own sessions via a session factory
    (defaults to ``app.db.SessionLocal``).
    """
    from app.permits.alerts import run_permit_sweep

    try:
        created = await run_permit_sweep()
        logger.info("permit sweep job complete: %d alert(s)", len(created))
    except Exception:
        logger.exception("permit sweep job failed")


async def _run_request_nudge_sweep_job() -> None:
    """Nudge overdue, still-open homeowner requests (one nudge each). Owns its
    session; never crashes the loop."""
    from app.db import SessionLocal
    from app.homeowner.nudge import run_request_nudge_sweep

    try:
        async with SessionLocal() as session:
            nudged = await run_request_nudge_sweep(session)
        logger.info("request nudge sweep job complete: %d nudged", len(nudged))
    except Exception:
        logger.exception("request nudge sweep job failed")


async def _run_quiet_period_sweep_job() -> None:
    """Detect quiet sites and raise one quiet card (or contractor nudge) each.
    Owns its session; never crashes the loop. Mirrors the request-nudge job."""
    from app.db import SessionLocal
    from app.homeowner.quiet import run_quiet_period_sweep

    try:
        async with SessionLocal() as session:
            acted = await run_quiet_period_sweep(session)
        logger.info("quiet-period sweep job complete: %d site(s) acted on", len(acted))
    except Exception:
        logger.exception("quiet-period sweep job failed")


async def _run_sentinel_sweep_job() -> None:
    """Raise one Standing-Sentinel nudge per site that has something slipping
    (one/site/day). Owns its session; never crashes the loop."""
    from app.db import SessionLocal
    from app.sentinel.nudge import run_sentinel_sweep

    try:
        async with SessionLocal() as session:
            nudged = await run_sentinel_sweep(session)
        logger.info("sentinel sweep job complete: %d site(s) nudged", len(nudged))
    except Exception:
        logger.exception("sentinel sweep job failed")


async def _run_intelligence_sweep_job() -> None:
    """Run the proactive-intelligence engine for every site (persist findings +
    compute health score), before the morning brief so findings are fresh. Owns
    its session; never crashes the loop."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from app.db import SessionLocal
    from app.intelligence.sweep import run_intelligence_sweep

    today = datetime.now(ZoneInfo(settings.brief_timezone)).date()
    try:
        async with SessionLocal() as session:
            done = await run_intelligence_sweep(session, today=today)
        logger.info("intelligence sweep job complete: %d site(s) processed", len(done))
    except Exception:
        logger.exception("intelligence sweep job failed")


def start_scheduler():
    """Create and start the AsyncIO scheduler if enabled. Returns it (or None)."""
    global _scheduler
    if not settings.enable_scheduler:
        logger.info("scheduler disabled (ENABLE_SCHEDULER not set)")
        return None
    if _scheduler is not None:
        return _scheduler

    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    scheduler = AsyncIOScheduler(timezone=settings.brief_timezone)
    scheduler.add_job(
        _run_nightly_job,
        CronTrigger(hour=settings.brief_hour, minute=0, timezone=settings.brief_timezone),
        id="nightly_brief",
        replace_existing=True,
    )
    # SLA escalation: frequent interval so overdue questions escalate promptly.
    scheduler.add_job(
        _run_sla_sweep_job,
        IntervalTrigger(minutes=settings.sla_sweep_minutes),
        id="sla_sweep",
        replace_existing=True,
    )
    # Permit alerts: once daily.
    scheduler.add_job(
        _run_permit_sweep_job,
        CronTrigger(
            hour=settings.permit_sweep_hour, minute=0, timezone=settings.brief_timezone
        ),
        id="permit_sweep",
        replace_existing=True,
    )
    # Homeowner request one-nudge sweep: frequent interval.
    scheduler.add_job(
        _run_request_nudge_sweep_job,
        IntervalTrigger(minutes=settings.request_nudge_sweep_minutes),
        id="request_nudge_sweep",
        replace_existing=True,
    )
    # Quiet-period detection: once daily at quiet_sweep_hour (local to
    # brief_timezone), before the 07:00 brief so the morning push window carries
    # coherent state. Mirrors the permit sweep's CronTrigger shape.
    scheduler.add_job(
        _run_quiet_period_sweep_job,
        CronTrigger(
            hour=settings.quiet_sweep_hour, minute=0, timezone=settings.brief_timezone
        ),
        id="quiet_period_sweep",
        replace_existing=True,
    )
    # Standing Sentinel: once daily (with the permit sweep) — one nudge/site/day
    # for whatever's slipping (absence / overdue / reorder). Phase 3.1.
    scheduler.add_job(
        _run_sentinel_sweep_job,
        CronTrigger(
            hour=settings.permit_sweep_hour, minute=30, timezone=settings.brief_timezone
        ),
        id="sentinel_sweep",
        replace_existing=True,
    )
    # Proactive intelligence: once daily, just before the 07:00 brief so fresh
    # findings + health scores are available to the brief and the dashboard.
    scheduler.add_job(
        _run_intelligence_sweep_job,
        CronTrigger(
            hour=settings.quiet_sweep_hour, minute=15, timezone=settings.brief_timezone
        ),
        id="intelligence_sweep",
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "scheduler started: nightly brief at %02d:00 %s; sla sweep every %dm; "
        "permit sweep at %02d:00 %s; request nudge sweep every %dm; "
        "quiet sweep at %02d:00 %s",
        settings.brief_hour,
        settings.brief_timezone,
        settings.sla_sweep_minutes,
        settings.permit_sweep_hour,
        settings.brief_timezone,
        settings.request_nudge_sweep_minutes,
        settings.quiet_sweep_hour,
        settings.brief_timezone,
    )
    return scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
