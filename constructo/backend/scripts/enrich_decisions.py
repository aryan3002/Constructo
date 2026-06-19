"""Derive owner/homeowner **Decisions** from the real client⇄firm design thread.

Third-pass enrichment over the real Tripathi import (see
``scripts.import_whatsapp_export``): the *homeowner* conversation
(``ConversationKind.homeowner``) is the curated client⇄firm back-and-forth — the
actual design questions and approvals ("do vertical bricks", "move the shower to
the other wall…", "98% there", "yes / approved", niche / vanity / fireplace
choices). This pass reads that thread with the smart-tier LLM and turns the
distinct *decisions* it can see into :class:`Decision` rows (the owner's
approvals / homeowner-questions inbox).

GROUNDED, NOT FABRICATED: the model is told to extract only decisions that are
actually present in the supplied messages. An empty homeowner conversation yields
zero rows (asserted by the test). ``approval`` / ``drawing_shared`` site events
are passed as *supporting* context only — they never invent a decision on their
own.

Idempotent by construction: every row uses a deterministic ``uuid5`` id derived
from the site + a stable slug of the decision title, so re-running upserts the
same rows and never duplicates. Specs are NOT linked here (``spec_id`` stays
NULL) — spec routing owns that link.

SAFE BY DEFAULT for tests: real Azure creds are only pulled into the environment
inside :func:`main` (via ``scripts._bootstrap_env.load``), never at import time,
so importing this module in a test stays on the network-free ``FakeLLMClient``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_decisions
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import UTC, date, datetime, time
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    Decision,
    DecisionKind,
    DecisionState,
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    SiteEventModel,
)

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")

# How many homeowner messages to hand the model per extraction call. Big enough
# to keep a decision's question + its later resolution in the same window.
_CHUNK = 40

# Supporting (never decision-spawning) site events: approvals + shared drawings.
_SUPPORT_EVENT_TYPES = ("approval", "drawing_shared")

_SYSTEM = (
    "You read a chronological slice of a WhatsApp thread between a homeowner "
    "family and their architecture/construction firm about building a house. "
    "Extract the DISTINCT design/approval DECISIONS that actually appear in "
    "these messages — e.g. a finish/material choice (vertical bricks, granite "
    "top, vanity size), a layout change (move the shower / niche), or an "
    "approval ('yes', 'approved', 'go ahead'). Do NOT invent decisions that are "
    "not in the text; do NOT include small talk, logistics, or money requests. "
    "If a decision is clearly settled in the text, mark it resolved and capture "
    "the resolution; otherwise mark it open. Return JSON only."
)

_SCHEMA = {
    "decisions": [
        {
            "title": "short imperative title of the decision",
            "context": "the question / what was being decided (verbatim-ish)",
            "resolution": "how it was settled, or null if still open",
            "status": "open | resolved",
            "decided_on": "YYYY-MM-DD or null",
            "who_asked": "name of the person who raised it, or null",
        }
    ]
}


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


def _slug(text: str) -> str:
    """Stable lowercase slug of a decision title (idempotency key material)."""
    keep = [c.lower() if c.isalnum() else " " for c in (text or "")]
    return "-".join("".join(keep).split())[:120]


def _parse_date(value) -> date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip()[:10])
    except ValueError:
        return None


def _resolved_at(d: date | None) -> datetime | None:
    """A resolved decision gets a stamp: the decided date (if any) at midnight UTC."""
    if d is None:
        return None
    return datetime.combine(d, time.min, tzinfo=UTC)


async def _primary_homeowner_id(s, site_id: UUID) -> UUID | None:
    """The site's primary homeowner user id (for ``raised_by``); tolerate None.

    Falls back to any active homeowner member with a user when there is no
    primary_owner. ``raised_by`` is a bare UUID (no FK), so a missing user is
    simply left NULL.
    """
    rows = (
        await s.execute(
            select(HomeownerMember).where(
                HomeownerMember.site_id == site_id,
                HomeownerMember.user_id.is_not(None),
                HomeownerMember.status == MemberStatus.active,
            )
        )
    ).scalars().all()
    if not rows:
        return None
    primary = next(
        (m for m in rows if m.sub_role == HomeownerSubRole.primary_owner), None
    )
    return (primary or rows[0]).user_id


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


def _format_support(events: list[SiteEventModel]) -> str:
    if not events:
        return ""
    lines = [
        f"- {e.event_type} ({e.occurred_on}): {(e.summary or '').strip()[:160]}"
        for e in events
    ]
    return "Supporting site events (context only — do not treat as decisions):\n" + "\n".join(
        lines
    )


async def run(session_factory: Callable = SessionLocal) -> dict:
    """Read the homeowner thread and upsert a Decision per extracted decision.

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``enrich_documents``); defaults to the real ``SessionLocal``.
    Returns ``{"messages_scanned", "decisions"}``.
    """
    site_id = _id("site")
    company_id = _id("company")
    llm = get_llm_client("smart")
    messages_scanned = decisions = 0

    async with session_factory() as s:
        # The curated client⇄firm thread, in chronological order.
        msgs = (
            await s.execute(
                select(ChatMessage)
                .join(Conversation, ChatMessage.conversation_id == Conversation.id)
                .where(
                    Conversation.site_id == site_id,
                    Conversation.kind == ConversationKind.homeowner,
                )
                .order_by(ChatMessage.seq, ChatMessage.created_at)
            )
        ).scalars().all()

        if not msgs:
            return {"messages_scanned": 0, "decisions": 0}

        # Supporting signal (context only): approvals + shared drawings.
        support = (
            await s.execute(
                select(SiteEventModel)
                .where(
                    SiteEventModel.site_id == site_id,
                    SiteEventModel.event_type.in_(list(_SUPPORT_EVENT_TYPES)),
                )
                .order_by(SiteEventModel.occurred_on)
            )
        ).scalars().all()
        support_text = _format_support(support)

        raised_by = await _primary_homeowner_id(s, site_id)

        seen_slugs: set[str] = set()
        for batch in _chunks(msgs, _CHUNK):
            messages_scanned += len(batch)
            convo = _format_messages(batch)
            if not convo.strip():
                continue
            user = convo if not support_text else f"{convo}\n\n{support_text}"

            out = await llm.complete(_SYSTEM, user, _SCHEMA)
            for item in (out or {}).get("decisions", []) or []:
                if not isinstance(item, dict):
                    continue
                title = (item.get("title") or "").strip()
                if not title:
                    continue
                slug = _slug(title)
                if not slug or slug in seen_slugs:
                    continue  # de-dupe within this run (also covered by uuid5)
                seen_slugs.add(slug)

                resolved = (item.get("status") or "").strip().lower() == "resolved"
                state = DecisionState.resolved if resolved else DecisionState.pending
                decided = _parse_date(item.get("decided_on"))
                detail = (item.get("context") or "").strip() or None
                resolution = (item.get("resolution") or "").strip() or None

                await _upsert(
                    s,
                    Decision,
                    _id("decision", slug),
                    company_id=company_id,
                    site_id=site_id,
                    kind=DecisionKind.homeowner_question,
                    title=title[:200],
                    detail=detail,
                    raised_by=raised_by,
                    state=state,
                    resolution_note=resolution if resolved else None,
                    resolved_at=_resolved_at(decided) if resolved else None,
                )
                decisions += 1

        await s.commit()

    return {"messages_scanned": messages_scanned, "decisions": decisions}


def main() -> None:
    # Pull real Azure creds into os.environ for the smart client — here in the
    # CLI entry only (NOT at import) so test imports stay on the FakeLLM.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched decisions:", counts)


if __name__ == "__main__":
    main()
