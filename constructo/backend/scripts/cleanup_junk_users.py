"""Delete the blank auto-created owner accounts in 'Default Company'.

POST /auth/login mints a nameless Owner in "Default Company" for any unknown
phone (e.g. a mistyped login). Those accumulate as junk. This removes the
nameless ones; real users always have a name, so the filter is safe. The
Default Company row itself is kept (it's the auth fallback; recreated on demand).

    DATABASE_URL=... uv run python -m scripts.cleanup_junk_users
"""
from __future__ import annotations

import asyncio

from sqlalchemy import delete, select

from app.db import SessionLocal
from app.models import Company, User


async def run(session_factory=SessionLocal) -> dict:
    async with session_factory() as s:
        comp = (
            await s.execute(select(Company).where(Company.name == "Default Company"))
        ).scalar_one_or_none()
        if comp is None:
            return {"deleted": 0, "note": "no Default Company"}
        ids = (
            await s.execute(
                select(User.id).where(User.company_id == comp.id, User.name.is_(None))
            )
        ).scalars().all()
        if ids:
            await s.execute(delete(User).where(User.id.in_(ids)))
            await s.commit()
        return {"company": comp.name, "deleted": len(ids)}


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    print("Junk-user cleanup:", asyncio.run(run()))


if __name__ == "__main__":
    main()
