"""Run the full enrichment suite over the imported Tripathi data, in order.

One command that derives every product object from the already-imported real
WhatsApp signal (see ``scripts.import_whatsapp_export``). Each enrichment pass is
idempotent (deterministic ``uuid5`` ids), so this driver is safe to re-run; it
upserts, never duplicates.

ORDER MATTERS — earlier passes create the rows later ones lean on (documents
build the room skeleton specs/audits reference; decisions/specs precede their
routing; etc.), so the passes run in this sequence:

  1  documents      → drawings + room skeleton (vision)
  2  photos         → captioned homeowner-feed photos (vision)
  3  decisions      → owner/homeowner approvals inbox (smart)
  4  specs          → interior specs (smart)
  5  profiler       → design-taste profile (smart)
  6  audits         → site-audit findings (smart)
  7  dpr            → daily progress reports (deterministic)
  8  action_items   → tracked to-dos (cheap)
  9  payments       → invoice → payment tracking (deterministic)
 10  site_changes   → field → designer change loop (smart)
 11  quiet_periods  → silent-window detection (deterministic)

Then a best-effort search-index pass makes the new events searchable.

EACH STEP IS ISOLATED: one pass failing is logged and the rest continue, so a
single flaky pass never aborts the whole enrichment.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_all
"""
from __future__ import annotations

import asyncio
import traceback
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import delete, select

# Import each pass's run() under a clear alias. The driver calls them in order.
import scripts.enrich_action_items as enrich_action_items
import scripts.enrich_audits as enrich_audits
import scripts.enrich_decisions as enrich_decisions
import scripts.enrich_documents as enrich_documents
import scripts.enrich_dpr as enrich_dpr
import scripts.enrich_payments as enrich_payments
import scripts.enrich_photos as enrich_photos
import scripts.enrich_profiler as enrich_profiler
import scripts.enrich_quiet_periods as enrich_quiet_periods
import scripts.enrich_site_changes as enrich_site_changes
import scripts.enrich_specs as enrich_specs
from app.db import SessionLocal

# (label, module) in dependency order. Run sequentially — see module docstring.
_STEPS = [
    ("documents", enrich_documents),
    ("photos", enrich_photos),
    ("decisions", enrich_decisions),
    ("specs", enrich_specs),
    ("profiler", enrich_profiler),
    ("audits", enrich_audits),
    ("dpr", enrich_dpr),
    ("action_items", enrich_action_items),
    ("payments", enrich_payments),
    ("site_changes", enrich_site_changes),
    ("quiet_periods", enrich_quiet_periods),
]


_NS = uuid5(NAMESPACE_URL, "constructo.wa-import.tripathi-dream-home")
_SITE_ID = uuid5(_NS, "site")


async def prune_noise_events(session_factory=SessionLocal) -> dict:
    """Delete redundant ``unknown`` site_events for the imported site.

    Every imported message is now a chat bubble (and RAG-indexed via the
    message), so an ``unknown`` event — chatter the classifier could not map to a
    construction event type — is duplicative noise that would only clutter the
    events feed/search. No signal is lost (the message is preserved in chat).
    Idempotent: re-running deletes any newly created unknowns.
    """
    from app.models import EventEmbedding, SiteEventModel

    async with session_factory() as s:
        ids = (
            await s.execute(
                select(SiteEventModel.id).where(
                    SiteEventModel.site_id == _SITE_ID,
                    SiteEventModel.event_type == "unknown",
                )
            )
        ).scalars().all()
        if ids:
            await s.execute(delete(EventEmbedding).where(EventEmbedding.site_event_id.in_(ids)))
            await s.execute(delete(SiteEventModel).where(SiteEventModel.id.in_(ids)))
            await s.commit()
        return {"pruned": len(ids)}


async def run_all() -> dict:
    """Run every enrichment pass in order, then index. Returns per-step results."""
    results: dict[str, object] = {}

    for label, module in _STEPS:
        try:
            counts = await module.run()
            results[label] = counts
            print(f"[{label}] {counts}")
        except Exception as exc:  # one bad pass must not abort the rest
            results[label] = {"error": str(exc)}
            print(f"[{label}] FAILED: {exc}")
            traceback.print_exc()

    # De-noise: drop redundant 'unknown' chatter events (preserved as chat
    # bubbles). Runs before indexing so we don't embed rows we're deleting.
    try:
        pruned = await prune_noise_events()
        results["pruned"] = pruned
        print(f"[prune] {pruned}")
    except Exception as exc:
        results["pruned"] = {"error": str(exc)}
        print(f"[prune] FAILED: {exc}")
        traceback.print_exc()

    # Best-effort: make any newly created events searchable. Never fatal.
    try:
        from app.search.index import index_all_unindexed

        async with SessionLocal() as s:
            indexed = await index_all_unindexed(s)
            await s.commit()
        results["indexed"] = indexed
        print(f"[index] {indexed} events indexed")
    except Exception as exc:
        results["indexed"] = {"error": str(exc)}
        print(f"[index] FAILED: {exc}")
        traceback.print_exc()

    print("\nEnrichment complete:", results)
    return results


def main() -> None:
    # Pull real Azure creds into os.environ for the vision/smart/cheap clients —
    # here in the CLI entry only (NOT at import) so test imports stay on the
    # FakeLLM.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    asyncio.run(run_all())


if __name__ == "__main__":
    main()
