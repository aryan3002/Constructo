"""Backfill milestone ``started_on`` where null, so the By-Milestone photo view
buckets photos across real construction phases (not all into one).

Deterministic: a phase's start = the PREVIOUS phase's completion date (falling
back to its start / expected date), walking milestones per site in ``order``.
Idempotent — only fills nulls; never overwrites an existing start. Reads
DATABASE_URL from the environment (export it; .env is not overridden).

    uv run python -m scripts.backfill_milestone_starts
"""
import asyncio

from scripts._bootstrap_env import load

load()

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402
from app.models import Milestone, Site  # noqa: E402


async def main() -> None:
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    filled = 0
    async with Session() as s:
        site_ids = (await s.execute(select(Site.id))).scalars().all()
        for sid in site_ids:
            rows = (
                await s.execute(
                    select(Milestone)
                    .where(Milestone.site_id == sid)
                    .order_by(Milestone.order, Milestone.id)
                )
            ).scalars().all()
            prev_end = None
            for m in rows:
                if m.started_on is None and prev_end is not None:
                    m.started_on = prev_end
                    filled += 1
                # The watermark the NEXT phase starts from.
                prev_end = m.completed_on or m.started_on or m.expected_on or prev_end
        await s.commit()
    await engine.dispose()
    print(f"filled started_on for {filled} milestone(s)")


if __name__ == "__main__":
    asyncio.run(main())
