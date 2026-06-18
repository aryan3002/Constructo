"""Per-role census + quality gates for the imported CivilArch / Tripathi site.

Prints, for the deterministic importer company/site (same ids local + prod), the
populated-row counts behind each of the four focus roles' surfaces, plus the
extraction-quality gate (unknown share of events). Exits non-zero when a
focus-role surface is empty or unknown share exceeds the threshold — so it can
double as a CI/operational gate after an import + ``enrich_all`` run.

    cd constructo/backend && uv run python -m scripts.census_roles
    DATABASE_URL="<neon>" uv run python -m scripts.census_roles   # against prod
"""
from __future__ import annotations

import asyncio
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal

NS = uuid5(NAMESPACE_URL, "constructo.wa-import.tripathi-dream-home")


def _id(*parts: str):
    return uuid5(NS, ":".join(parts))


COMPANY_ID = _id("company")
SITE_ID = _id("site")

UNKNOWN_MAX_PCT = 25  # gate: unknown events must be below this share


async def _count(s: AsyncSession, table: str, where: str) -> int:
    try:
        async with s.begin_nested():  # isolate so a bad table doesn't poison the tx
            return (
                await s.execute(text(f"select count(*) from {table} where {where}"), {
                    "site": str(SITE_ID), "company": str(COMPANY_ID),
                })
            ).scalar() or 0
    except Exception:  # missing table / column drift — report -1, don't crash
        return -1


async def main() -> None:
    failures: list[str] = []
    async with SessionLocal() as s:
        comp = (
            await s.execute(
                text("select name from companies where id=:c"), {"c": str(COMPANY_ID)}
            )
        ).scalar()
        print(f"Company: {COMPANY_ID} ({'FOUND: ' + comp if comp else 'MISSING'})")
        print(f"Site:    {SITE_ID}\n")
        if comp is None:
            raise SystemExit("Importer company not found — run the import first.")

        # --- extraction quality gate ---
        ev = (
            await s.execute(
                text("select event_type, count(*) from site_events where site_id=:s group by 1"),
                {"s": str(SITE_ID)},
            )
        ).all()
        total = sum(n for _, n in ev)
        unknown = dict(ev).get("unknown", 0)
        pct = (100 * unknown // total) if total else 0
        print(f"=== EVENTS: {total} total · unknown {unknown} ({pct}%) ===")
        for t, n in sorted(ev, key=lambda r: -r[1]):
            print(f"   {t:18} {n}")
        if total == 0:
            failures.append("no site_events")
        elif pct > UNKNOWN_MAX_PCT:
            failures.append(f"unknown share {pct}% > {UNKNOWN_MAX_PCT}%")

        # --- per-surface counts (table, where) ---
        cm = "chat_messages m join conversations c on c.id=m.conversation_id"
        cm_named = f"{cm} join users u on u.id=m.sender_id"
        surfaces = {
            "chat: site thread": (cm, "c.site_id=:site and c.kind='site'"),
            "chat: homeowner thread": (cm, "c.site_id=:site and c.kind='homeowner'"),
            "chat: named senders": (cm_named, "c.site_id=:site"),
            "published_photos": ("published_photos", "site_id=:site"),
            "published_photos w/ caption": ("published_photos",
                                            "site_id=:site and caption is not null"),
            "published_drawings": ("published_drawings", "site_id=:site"),
            "spaces (rooms/floors)": ("spaces", "site_id=:site"),
            "milestones": ("milestones", "site_id=:site"),
            "updates (homeowner timeline)": ("updates", "site_id=:site"),
            "decisions": ("decisions", "site_id=:site"),
            "specs": ("specs", "site_id=:site"),
            "materials": ("materials", "company_id=:company"),
            "profiler_profiles": ("profiler_profiles", "site_id=:site"),
            "audits": ("audits", "site_id=:site"),
            "dprs": ("dprs", "site_id=:site"),
            "action_items": ("action_items", "site_id=:site"),
            "payments": ("payments", "site_id=:site"),
            "site_changes": ("site_changes", "site_id=:site"),
            "quiet_periods": ("quiet_periods", "site_id=:site"),
            "owner_briefs": ("owner_briefs", "company_id=:company"),
        }
        print("\n=== SURFACE ROW COUNTS ===")
        counts: dict[str, int] = {}
        for label, (table, where) in surfaces.items():
            n = await _count(s, table, where)
            counts[label] = n
            flag = "  ⚠️ EMPTY" if n == 0 else ("  (table?)" if n < 0 else "")
            print(f"   {label:32} {n}{flag}")

        # --- focus-role readiness ---
        roles = {
            "HOMEOWNER": ["chat: homeowner thread", "published_photos", "updates (homeowner timeline)",
                          "decisions", "published_drawings"],
            "OWNER": ["owner_briefs", "decisions", "specs", "payments", "audits", "chat: site thread"],
            "SUPERVISOR": ["chat: site thread", "audits", "dprs", "action_items", "published_photos"],
            "ARCHITECT": ["specs", "spaces (rooms/floors)", "published_drawings", "profiler_profiles",
                          "decisions"],
        }
        print("\n=== FOCUS-ROLE READINESS ===")
        for role, needs in roles.items():
            empties = [s2 for s2 in needs if counts.get(s2, 0) <= 0]
            status = "✅ ready" if not empties else f"⚠️ thin: {', '.join(empties)}"
            print(f"   {role:12} {status}")
            for e in empties:
                failures.append(f"{role} surface empty: {e}")

        print("\n" + ("✅ CENSUS PASS" if not failures else f"⚠️ {len(failures)} gate issue(s):"))
        for f in failures:
            print(f"   - {f}")
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
