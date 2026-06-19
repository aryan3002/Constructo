"""Parallel extraction pass over un-extracted in-app-chat messages for the site.

Decoupled from the importer: when the import runs with ``--skip-extraction`` it
seeds chat + media FAST (no inline Azure), leaving the bridged
``RawMessage(source="app_chat")`` rows at status ``pending``. This pass then runs
the SAME ``handle_ingested`` extraction CONCURRENTLY (bounded), which is ~8× the
sequential inline rate — the per-message Azure+Neon latency overlaps instead of
serializing.

Idempotent + safe: only raws with status in (``pending``, ``failed``) are
processed (an already-``done`` raw has its events and is skipped → no
double-booking). Captionless photos (no text) and PDFs (``document``) are
excluded — photos get their event from ``enrich_photos`` and PDFs from
``enrich_documents``; this pass owns only real text/caption messages.

    cd constructo/backend && uv run python -m scripts.extract_pending
"""
from __future__ import annotations

import asyncio
import os
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import func, select

from app.db import SessionLocal
from app.extraction.worker import handle_ingested
from app.models import RawMessageModel

EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")
SITE_ID = uuid5(NS, "site")
APP_GROUP = f"app:{SITE_ID}"

_CONCURRENCY = int(os.environ.get("EXTRACT_CONCURRENCY", "8"))


def _candidate_filter():
    """Raws to (re)extract: this site's app_chat, not yet done, with real text,
    excluding documents (PDFs are handled by enrich_documents)."""
    return (
        RawMessageModel.external_group_id == APP_GROUP,
        RawMessageModel.status.in_(["pending", "failed"]),
        RawMessageModel.media_type != "document",
        RawMessageModel.text.is_not(None),
        func.length(func.trim(RawMessageModel.text)) > 0,
    )


async def run(session_factory=SessionLocal) -> dict:
    async with session_factory() as s:
        ids: list[UUID] = (
            await s.execute(select(RawMessageModel.id).where(*_candidate_filter()))
        ).scalars().all()

    sem = asyncio.Semaphore(_CONCURRENCY)
    done = 0
    failed = 0

    async def _one(rid: UUID) -> bool:
        async with sem:
            try:
                await handle_ingested(rid)
                return True
            except Exception:
                return False

    # Process in chunks so a huge corpus doesn't build 10k pending tasks at once.
    CHUNK = 200
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i : i + CHUNK]
        results = await asyncio.gather(*[_one(r) for r in chunk])
        done += sum(1 for r in results if r)
        failed += sum(1 for r in results if not r)
        print(f"  … extracted {done}/{len(ids)} ({failed} failed)")

    return {"candidates": len(ids), "extracted": done, "failed": failed}


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    print("Extract-pending:", asyncio.run(run()))


if __name__ == "__main__":
    main()
