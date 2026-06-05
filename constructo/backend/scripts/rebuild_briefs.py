"""Rebuild persisted owner briefs in place so they pick up newer payload fields
(e.g. the resolved `evidence` proof rows added in PR #72).

Safe + idempotent: `build_brief` now replaces the brief for a (company, day)
in place (PR #73), so this updates existing rows — it does NOT create duplicates.
By default it only rebuilds the (company, day) pairs that ALREADY have a brief,
so it touches nothing new.

Reads DB/storage from the ambient env (backend/.env). Dry-run by default — prints
the plan and exits. Add --run to actually rebuild.

    # Plan only (no writes):
    uv run python -m scripts.rebuild_briefs

    # Rebuild every existing brief in place:
    uv run python -m scripts.rebuild_briefs --run

    # Scope to one company:
    uv run python -m scripts.rebuild_briefs --company <uuid> --run
"""
from __future__ import annotations

import argparse
import asyncio
from uuid import UUID

from sqlalchemy import select

from app.brief.generate import build_brief
from app.db import SessionLocal
from app.models import Company, OwnerBrief


async def _plan(company_id: UUID | None) -> list[tuple[UUID, str, list]]:
    """Return [(company_id, company_name, [brief_date, ...])] for existing briefs."""
    async with SessionLocal() as s:
        stmt = select(OwnerBrief.company_id, OwnerBrief.brief_date)
        if company_id is not None:
            stmt = stmt.where(OwnerBrief.company_id == company_id)
        rows = (await s.execute(stmt)).all()

        by_company: dict[UUID, set] = {}
        for cid, bdate in rows:
            by_company.setdefault(cid, set()).add(bdate)

        out = []
        for cid, dates in by_company.items():
            company = await s.get(Company, cid)
            name = company.name if company else "(unknown)"
            out.append((cid, name, sorted(dates)))
        return out


async def rebuild(company_id: UUID | None, *, do_run: bool) -> None:
    plan = await _plan(company_id)
    if not plan:
        print("No existing briefs found — nothing to rebuild.")
        return

    total_days = sum(len(dates) for _, _, dates in plan)
    print(f"{'REBUILD' if do_run else 'DRY RUN'} — {len(plan)} company(ies), "
          f"{total_days} brief-day(s):")
    for cid, name, dates in plan:
        print(f"  {name}  [{cid}]  {len(dates)} day(s): "
              f"{dates[0]} → {dates[-1]}")

    if not do_run:
        print("\nDry run only. Re-run with --run to rebuild these in place.")
        return

    rebuilt = 0
    for cid, name, dates in plan:
        for bdate in dates:
            # Each in its own session so one failure can't abort the rest.
            try:
                async with SessionLocal() as s:
                    await build_brief(s, cid, bdate, llm=None)
                rebuilt += 1
            except Exception as exc:  # noqa: BLE001 — keep going, report at end
                print(f"  ! failed {name} {bdate}: {exc}")
        print(f"  ✓ {name}: rebuilt {len(dates)} day(s)")
    print(f"\n✅ Rebuilt {rebuilt}/{total_days} brief(s) in place.")


def main() -> None:
    p = argparse.ArgumentParser(description="Rebuild persisted owner briefs in place.")
    p.add_argument("--company", type=UUID, default=None,
                   help="Only rebuild this company id (default: all companies).")
    p.add_argument("--run", action="store_true",
                   help="Actually rebuild (default: dry-run plan only).")
    opts = p.parse_args()
    asyncio.run(rebuild(opts.company, do_run=opts.run))


if __name__ == "__main__":
    main()
