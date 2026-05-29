"""Nightly brief generation.

Wave 1 exposes :func:`run_nightly`, which builds (and persists) a brief for
every company for "yesterday". Wiring it to a real scheduler/cron is Wave 2; for
now the function is also runnable directly via ``python -m app.brief.schedule``.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from datetime import date, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.brief.generate import build_brief
from app.db import SessionLocal
from app.models import Company

logger = logging.getLogger(__name__)

# A zero-arg callable returning an async-session context manager (e.g. SessionLocal).
SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]


def _yesterday() -> date:
    return datetime.now().date() - timedelta(days=1)


async def run_nightly(
    session_factory: SessionFactory = SessionLocal,
    *,
    brief_date: date | None = None,
) -> list[UUID]:
    """Build and persist one brief per company for ``brief_date`` (default: yesterday).

    Args:
        session_factory: callable returning an ``AsyncSession`` context manager
            (defaults to :data:`app.db.SessionLocal`). Tests pass a factory bound
            to the transactional test session.
        brief_date: optional override; defaults to yesterday.

    Returns the ids of the persisted :class:`OwnerBrief` rows.
    """
    target = brief_date or _yesterday()
    brief_ids: list[UUID] = []

    async with session_factory() as session:
        company_ids = list(
            (await session.execute(select(Company.id))).scalars().all()
        )

    for company_id in company_ids:
        async with session_factory() as session:
            try:
                result = await build_brief(session, company_id, target)
                brief_ids.append(result["brief_id"])
            except Exception:  # never let one company abort the whole run
                logger.exception("run_nightly: failed to build brief for company %s", company_id)

    logger.info("run_nightly: built %d brief(s) for %s", len(brief_ids), target)
    return brief_ids


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    ids = asyncio.run(run_nightly())
    logger.info("run_nightly complete: %d briefs", len(ids))


if __name__ == "__main__":
    main()
