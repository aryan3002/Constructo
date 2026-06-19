"""One-time corrective for the homeowner-facing seed data (post-import fixes).

Three issues the first prod seed produced, fixed here against the live data so
the deployed app reflects them immediately (the app reads this same Neon):

  1. LANGUAGE — the importer set every user ``language="hi"``, so the homeowner
     API translated the (English) canonical captions/updates into Hindi. The
     product is English-first now, so set the imported users to ``en``.

  2. DECISION FLOOD — enrich_decisions left ~71 decisions ``pending``, which all
     surface as "NEEDS YOUR CHOICE" cards. A historical import should leave only
     the most-recent genuinely-open ones pending; resolve the rest.

  3. DESIGN REFERENCES — enrich_profiler created one ProfilerReference per photo
     (2,319), ALL pinned to the first area → "2319 of 6 ranked". Curate to a
     small set of genuine design references per area (photos the vision pass
     flagged design/drawing, matched to their room), capped at the area's
     ``recommended_count``; drop the rest. Themes' evidence is repointed to the
     survivors.

Idempotent: re-running converges (language already en, decisions already
resolved, references already curated). Run against prod with the Neon URL:

    DATABASE_URL=... STORAGE_BACKEND=s3 uv run python -m scripts.fix_homeowner_seed
"""
from __future__ import annotations

import asyncio
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import delete, select, update

from app.db import SessionLocal
from app.models import (
    Decision,
    ProfilerProfile,
    ProfilerReference,
    ProfilerTheme,
    User,
)
from app.models.decision import DecisionState

EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


COMPANY_ID = _id("company")
SITE_ID = _id("site")

# How many genuinely-open decisions to leave as "needs your choice".
KEEP_PENDING = 8


async def _fix_language(s) -> int:
    r = await s.execute(
        update(User).where(User.company_id == COMPANY_ID).values(language="en")
    )
    return r.rowcount or 0


async def _fix_decisions(s) -> dict:
    pend = (
        await s.execute(
            select(Decision)
            .where(Decision.site_id == SITE_ID, Decision.state == DecisionState.pending)
            .order_by(Decision.created_at.desc())
        )
    ).scalars().all()
    stale = pend[KEEP_PENDING:]
    for d in stale:
        d.state = DecisionState.resolved
        d.resolved_at = d.created_at
        d.resolution_note = (
            d.resolution_note or "Resolved as the build progressed (historical import)."
        )
    return {"kept_pending": min(len(pend), KEEP_PENDING), "resolved": len(stale)}


async def _fix_references(s) -> dict:
    """Clear the bogus auto-references (2,319 progress photos pinned to one area).

    Site-progress photos are not design inspiration — they already live in the
    Photos tab, and the real design content is in Plans (drawings), Selections
    (specs) and the brief. So drop the auto-references and clear theme evidence;
    the Inspiration tab returns to a clean, homeowner-curated upload surface.
    """
    profile = (
        await s.execute(select(ProfilerProfile).where(ProfilerProfile.site_id == SITE_ID))
    ).scalar_one_or_none()
    if profile is None:
        return {"deleted": 0}

    ref_ids = (
        await s.execute(
            select(ProfilerReference.id).where(ProfilerReference.profile_id == profile.id)
        )
    ).scalars().all()
    if ref_ids:
        await s.execute(delete(ProfilerReference).where(ProfilerReference.id.in_(ref_ids)))

    themes = (
        await s.execute(select(ProfilerTheme).where(ProfilerTheme.profile_id == profile.id))
    ).scalars().all()
    for t in themes:
        t.evidence_reference_ids = []

    return {"deleted": len(ref_ids), "themes_cleared": len(themes)}


async def run(session_factory=SessionLocal) -> dict:
    out: dict = {}
    async with session_factory() as s:
        out["users_set_en"] = await _fix_language(s)
        out["decisions"] = await _fix_decisions(s)
        out["references"] = await _fix_references(s)
        await s.commit()
    return out


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    print("Homeowner seed corrective:", asyncio.run(run()))


if __name__ == "__main__":
    main()
