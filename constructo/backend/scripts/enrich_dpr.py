"""Derive a daily progress report (:class:`Dpr`) per active build day.

Enrichment over the real Tripathi import (see ``scripts.import_whatsapp_export``):
the construction-phase ``site_events`` are grouped by ``occurred_on`` and one
``Dpr`` *draft* is assembled for every day that actually had activity.

Mostly deterministic. The structured sections (labour / materials / work-done /
blockers / next) and the evidence anchor are assembled in pure Python by reusing
:func:`app.dpr.draft.draft_dpr` (the same builder the live C4 PM Auto-DPR uses);
the only LLM touch is that builder's one prose-summary call, which degrades to a
deterministic fallback without a model — so a deterministic concatenation is the
worst case, never invented content.

GROUNDED, NOT FABRICATED: a day with no events produces no DPR; a site with no
events produces zero DPRs (asserted by the test). Every DPR cites the real
``site_event`` ids it was built from in ``evidence_event_ids``.

Idempotent by construction: each DPR uses a deterministic ``uuid5`` id derived
from the site + the ISO day, so re-running upserts the same rows and never
duplicates. DPRs are born as ``draft`` (CA1: nothing auto-sends).

SAFE BY DEFAULT for tests: real Azure creds are only pulled into the environment
inside :func:`main` (via ``scripts._bootstrap_env.load``), never at import time,
so importing this module in a test stays on the network-free ``FakeLLMClient``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_dpr
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.dpr.draft import draft_dpr
from app.extraction.llm import get_llm_client
from app.models import Dpr, SiteEventModel

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


async def _upsert(session, model, ident: UUID, **fields):
    """Insert-or-update by primary-key id (idempotent re-runs)."""
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


async def run(session_factory: Callable = SessionLocal) -> dict:
    """Assemble + upsert one Dpr draft per active day on the imported site.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``enrich_decisions``); defaults to the real ``SessionLocal``.
    Returns ``{"days", "dprs"}``.
    """
    site_id = _id("site")
    # The DPR's only LLM touch is the prose summary, which falls back
    # deterministically; "cheap" keeps it inexpensive when a model is configured.
    llm = get_llm_client("cheap")
    dprs = 0

    async with session_factory() as s:
        # Distinct calendar days that had ANY site activity, oldest first.
        days = sorted(
            set(
                (
                    await s.execute(
                        select(SiteEventModel.occurred_on).where(
                            SiteEventModel.site_id == site_id
                        )
                    )
                ).scalars().all()
            )
        )

        for day in days:
            drafted = await draft_dpr(s, site_id, day, llm=llm)
            await _upsert(
                s,
                Dpr,
                _id("dpr", day.isoformat()),
                site_id=site_id,
                report_date=day,
                sections=drafted.sections,
                evidence_event_ids=drafted.evidence_event_ids,
            )
            dprs += 1

        await s.commit()

    return {"days": len(days), "dprs": dprs}


def main() -> None:
    # Pull real Azure creds into os.environ for the prose-summary client — here in
    # the CLI entry only (NOT at import) so test imports stay on the FakeLLM.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched DPRs:", counts)


if __name__ == "__main__":
    main()
