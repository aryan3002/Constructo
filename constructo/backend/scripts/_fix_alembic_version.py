"""One-off: repoint the prod alembic_version off the deleted revision
``599a72bc7902`` (the duplicate spec_id migration dropped in PR #200) onto the
real fork point ``e6c9f3b1a528`` so ``alembic upgrade head`` can run again.

Reads DATABASE_URL from .env (no credentials on the command line). Run once:
    uv run python -m scripts._fix_alembic_version
then: uv run alembic upgrade head
"""
import asyncio

from scripts._bootstrap_env import load

load()

from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.config import settings  # noqa: E402

TARGET = "e6c9f3b1a528"


async def main() -> None:
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        before = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()
        print("before:", before)
        if before == TARGET:
            print("already at target — nothing to do")
            return
        await conn.execute(
            text("UPDATE alembic_version SET version_num = :v"), {"v": TARGET}
        )
        after = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar()
        print("after:", after)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
