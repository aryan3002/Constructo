"""Derive **Site Changes** (the field → designer feedback loop) from revision threads.

Tenth-pass enrichment over the real Tripathi import (see
``scripts.import_whatsapp_export``): both project threads carry as-built /
scope-change requests — "move the shower to the other wall", "increase the
shower width by 8 inch", "reduce the passage", "do vertical bricks". This pass
reads those threads with the smart-tier LLM and turns each DISTINCT change item
it can see into a :class:`SiteChange` row (the designer's review queue).

GROUNDED, NOT FABRICATED: the model is told to extract only change requests that
are actually present in the supplied messages — no logistics, no money, no small
talk. An empty corpus yields zero rows (asserted by the test). Every row uses a
deterministic ``uuid5`` id derived from the site + a stable slug of the change
title, so re-running upserts the same rows and never duplicates.

SAFE BY DEFAULT for tests: real Azure creds are only pulled into the environment
inside :func:`main` (via ``scripts._bootstrap_env.load``), never at import time,
so importing this module in a test stays on the network-free ``FakeLLMClient``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_site_changes
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.models import (
    ChatMessage,
    Conversation,
    Site,
    SiteChange,
    SiteChangeStatus,
)

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")

# How many messages to hand the model per extraction call.
_CHUNK = 40

_SYSTEM = (
    "You read a chronological slice of a WhatsApp thread about building a house. "
    "Extract the DISTINCT design / scope CHANGE requests that actually appear — "
    "an as-built or layout change such as \"move the shower to the other wall\", "
    "\"increase the shower width by 8 inch\", \"reduce the passage\", \"do "
    "vertical bricks\". Do NOT invent changes that are not in the text; do NOT "
    "include small talk, logistics, money, or generic progress updates. For each "
    "change capture a short title, the request note (verbatim-ish), the room if "
    "one is named, and who requested it. Return JSON only."
)

_SCHEMA = {
    "changes": [
        {
            "title": "short imperative title of the change",
            "note": "the change request (verbatim-ish)",
            "room": "the room/area named, or null",
            "requested_by": "name of the person who asked, or null",
        }
    ]
}


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _slug(text: str) -> str:
    """Stable lowercase slug of a change title (idempotency key material)."""
    keep = [c.lower() if c.isalnum() else " " for c in (text or "")]
    return "-".join("".join(keep).split())[:120]


def _chunks(items: list, n: int):
    for i in range(0, len(items), n):
        yield items[i : i + n]


def _format_messages(msgs: list[ChatMessage]) -> str:
    lines = []
    for m in msgs:
        body = (m.body or "").strip()
        if not body:
            continue
        who = m.sender_side.value if m.sender_side is not None else "?"
        lines.append(f"[{who}] {body}")
    return "\n".join(lines)


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
    """Read both threads and upsert a SiteChange per extracted change.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``enrich_decisions``); defaults to the real ``SessionLocal``.
    Returns ``{"scanned", "site_changes"}``.
    """
    site_id = _id("site")
    company_id = _id("company")
    llm = get_llm_client("smart")
    scanned = site_changes = 0

    async with session_factory() as s:
        site = await s.get(Site, site_id)
        if site is not None:
            company_id = site.company_id

        # Both project threads (site + homeowner), chronological.
        msgs = (
            await s.execute(
                select(ChatMessage)
                .join(Conversation, ChatMessage.conversation_id == Conversation.id)
                .where(
                    Conversation.site_id == site_id,
                    ChatMessage.body.is_not(None),
                )
                .order_by(ChatMessage.seq, ChatMessage.created_at)
            )
        ).scalars().all()

        if not msgs:
            return {"scanned": 0, "site_changes": 0}

        seen_slugs: set[str] = set()
        for batch in _chunks(msgs, _CHUNK):
            scanned += len(batch)
            convo = _format_messages(batch)
            if not convo.strip():
                continue

            out = await llm.complete(_SYSTEM, convo, _SCHEMA)
            for item in (out or {}).get("changes", []) or []:
                if not isinstance(item, dict):
                    continue
                title = (item.get("title") or "").strip()
                if not title:
                    continue
                slug = _slug(title)
                if not slug or slug in seen_slugs:
                    continue  # de-dupe within this run (also covered by uuid5)
                seen_slugs.add(slug)

                note = (item.get("note") or "").strip() or title
                room = (item.get("room") or "").strip() or None

                await _upsert(
                    s,
                    SiteChange,
                    _id("site_change", slug),
                    company_id=company_id,
                    site_id=site_id,
                    room=room,
                    title=title[:200],
                    note=note,
                    impact=None,
                    reported_by=None,
                    status=SiteChangeStatus.new,
                )
                site_changes += 1

        await s.commit()

    return {"scanned": scanned, "site_changes": site_changes}


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched site changes:", counts)


if __name__ == "__main__":
    main()
