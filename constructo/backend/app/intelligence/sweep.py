"""Nightly intelligence sweep: run the engine for every site, error-isolated.

Mirrors the other nightly sweeps (permit, quiet, sentinel): one failing site
never aborts the rest. Commits per site so partial progress survives a mid-sweep
crash. Called by the scheduler's nightly job.
"""
from __future__ import annotations

import logging
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.intelligence.engine import run_site
from app.models import Site

logger = logging.getLogger(__name__)


async def run_intelligence_sweep(session: AsyncSession, *, today: date) -> list[UUID]:
    """Run the detector engine for every site; return the ids successfully processed."""
    site_ids = list((await session.execute(select(Site.id))).scalars().all())
    done: list[UUID] = []
    for site_id in site_ids:
        try:
            await run_site(session, site_id, today=today)
            await session.commit()
            done.append(site_id)
        except Exception:
            await session.rollback()
            logger.exception("intelligence sweep failed for site %s", site_id)
    return done
