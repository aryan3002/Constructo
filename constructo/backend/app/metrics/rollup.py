"""Weekly rollup job: compute chat-bet kill-criteria for every company and
UPSERT into bet_metrics_weekly.

Run manually:
    DATABASE_URL=... python -m app.metrics.rollup

In production, wire to a weekly cron that calls rollup_last_week().
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.metrics.chat_bet import compute_week
from app.models.company import Company

logger = logging.getLogger(__name__)


async def rollup_last_week(session: AsyncSession) -> int:
    """Compute last week's snapshot for every company and UPSERT it.

    Returns the number of companies processed.
    """
    now = datetime.now(UTC)
    # Align to the most recent Monday midnight UTC.
    days_since_monday = now.weekday()
    week_start = (now - timedelta(days=days_since_monday)).replace(
        hour=0, minute=0, second=0, microsecond=0, tzinfo=UTC
    )
    last_week_start = week_start - timedelta(days=7)

    companies = (await session.execute(select(Company.id))).scalars().all()
    processed = 0
    for company_id in companies:
        try:
            payload = await compute_week(session, company_id, week_start=last_week_start)
            week_date = last_week_start.date()

            # UPSERT: on conflict update payload + computed_at.
            await session.execute(
                text(
                    """
                    INSERT INTO bet_metrics_weekly
                        (id, company_id, week_start, payload, computed_at)
                    VALUES
                        (gen_random_uuid(), :company_id, :week_start, :payload::jsonb, now())
                    ON CONFLICT (company_id, week_start)
                    DO UPDATE SET
                        payload = EXCLUDED.payload,
                        computed_at = now()
                    """
                ),
                {
                    "company_id": str(company_id),
                    "week_start": week_date.isoformat(),
                    "payload": __import__("json").dumps(payload),
                },
            )
            processed += 1
        except Exception:
            logger.exception("rollup failed for company %s", company_id)
    await session.commit()
    return processed


if __name__ == "__main__":
    import os

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    database_url = os.environ["DATABASE_URL"]
    engine = create_async_engine(database_url)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async def _run() -> None:
        async with SessionLocal() as session:
            n = await rollup_last_week(session)
            print(f"Processed {n} companies")

    asyncio.run(_run())
