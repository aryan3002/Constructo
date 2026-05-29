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
    # Imported lazily so module import stays cheap and side-effect free.
    from app.brief.schedule import run_nightly

    try:
        ids = await run_nightly()
        logger.info("nightly brief job complete: %d brief(s)", len(ids))
    except Exception:
        logger.exception("nightly brief job failed")


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

    scheduler = AsyncIOScheduler(timezone=settings.brief_timezone)
    scheduler.add_job(
        _run_nightly_job,
        CronTrigger(hour=settings.brief_hour, minute=0, timezone=settings.brief_timezone),
        id="nightly_brief",
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "scheduler started: nightly brief at %02d:00 %s",
        settings.brief_hour,
        settings.brief_timezone,
    )
    return scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
