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
    """Run the detector engine for every site; return the ids successfully processed.

    Passes a vision LLM so the design-fidelity ``photo_vs_theme`` check runs in the
    nightly batch (it only makes a call where a taste-bearing area has a matching
    photo, so cost is naturally bounded)."""
    from app.extraction.llm import get_llm_client

    llm = get_llm_client("vision")
    site_ids = list((await session.execute(select(Site.id))).scalars().all())
    done: list[UUID] = []
    for site_id in site_ids:
        try:
            await run_site(session, site_id, today=today, llm=llm)
            await session.commit()
            done.append(site_id)
        except Exception:
            await session.rollback()
            logger.exception("intelligence sweep failed for site %s", site_id)
    return done
