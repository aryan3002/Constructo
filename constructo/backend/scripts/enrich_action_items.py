"""Derive **Action Items** (tracked to-dos) from task-bearing chat messages.

Eighth-pass enrichment over the real Tripathi import (see
``scripts.import_whatsapp_export``): the site crew thread is full of explicit
assignments — "share new layout with clearances", "make changes and share",
"Ramesh ko bolo …". This pass scans those messages and, for each one the
cheap-tier LLM judges to be an actionable to-do, upserts a badged
:class:`ActionItem` (the "added by Nivaan" inbox item) plus a ``created``
:class:`ActionItemEvent`.

GROUNDED, NOT FABRICATED: the model only flags a message that is genuinely a
task and lifts the title/assignee/due straight from the text; a corpus with no
task-bearing messages yields zero rows (asserted by the test). Every row uses a
deterministic ``uuid5`` id derived from the source message id, so re-running
upserts the same rows and never duplicates.

SAFE BY DEFAULT for tests: real Azure creds are only pulled into the environment
inside :func:`main` (via ``scripts._bootstrap_env.load``), never at import time,
so importing this module in a test stays on the network-free ``FakeLLMClient``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_action_items
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import date
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.models import (
    ActionItem,
    ActionItemEvent,
    ActionItemEventKind,
    ActionItemStatus,
    ChatMessage,
    Conversation,
    Site,
)

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")

_SYSTEM = (
    "You read ONE message from a construction-project WhatsApp thread. Decide "
    "whether it is an actionable TO-DO — an explicit task someone must do "
    "(\"share the new layout with clearances\", \"make the changes and send\", "
    "\"Ramesh ko bol do cement order kare\"). It is NOT a task if it is small "
    "talk, a status report of something already done, a question, a number, or a "
    "money/invoice note. If it IS a task, extract a short imperative title and "
    "any hint of who it is for and when it is due. Return JSON only."
)

_SCHEMA = {
    "is_task": "true | false",
    "title": "short imperative title of the task, or null",
    "assignee_hint": "name of the person the task is for, or null",
    "due_hint": "YYYY-MM-DD or a phrase like 'tomorrow', or null",
}


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _is_true(value) -> bool:
    """Coerce the LLM's is_task to a bool (handles bool / 'true' / 'yes')."""
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "yes", "1"}


def _parse_due(value) -> date | None:
    """Best-effort YYYY-MM-DD parse; a vague phrase ('tomorrow') stays NULL."""
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


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
    """Scan chat messages and upsert an ActionItem per task-bearing message.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``enrich_documents``); defaults to the real ``SessionLocal``.
    Returns ``{"scanned", "action_items"}``.
    """
    site_id = _id("site")
    company_id = _id("company")
    llm = get_llm_client("cheap")
    scanned = action_items = 0

    async with session_factory() as s:
        site = await s.get(Site, site_id)
        if site is not None:
            company_id = site.company_id

        # Every human-text message on the site (both threads), chronological.
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
            return {"scanned": 0, "action_items": 0}

        for msg in msgs:
            body = (msg.body or "").strip()
            if not body:
                continue
            scanned += 1

            out = await llm.complete(_SYSTEM, body, _SCHEMA) or {}
            if not _is_true(out.get("is_task")):
                continue
            title = (out.get("title") or body).strip()
            if not title:
                continue

            item_id = _id("action_item", str(msg.id))
            existed = await s.get(ActionItem, item_id) is not None
            await _upsert(
                s,
                ActionItem,
                item_id,
                company_id=company_id,
                site_id=site_id,
                source_message_id=msg.id,
                title=title[:200],
                detail=(out.get("assignee_hint") or None),
                created_by=None,
                created_by_ai=True,
                status=ActionItemStatus.open,
                due_on=_parse_due(out.get("due_hint")),
            )
            action_items += 1

            # One created event per item — only on first creation (the event log
            # is append-only; re-runs must not pile up duplicate created rows).
            if not existed:
                s.add(
                    ActionItemEvent(
                        id=_id("action_item_event", str(msg.id)),
                        action_item_id=item_id,
                        kind=ActionItemEventKind.created,
                        actor_is_ai=True,
                    )
                )

        await s.commit()

    return {"scanned": scanned, "action_items": action_items}


def main() -> None:
    # Pull real Azure creds into os.environ for the cheap client — here in the
    # CLI entry only (NOT at import) so test imports stay on the FakeLLM.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched action items:", counts)


if __name__ == "__main__":
    main()
