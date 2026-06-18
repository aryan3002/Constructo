"""Enrich imported PDFs → homeowner-visible drawings + a room skeleton (vision).

Second-pass enrichment over the real Tripathi import (see
``scripts.import_whatsapp_export``): every PDF that arrived as an in-app chat
attachment is *read* with the vision-tier LLM (``app.extraction.pdf_read``) and
turned into product data:

  * a :class:`PublishedDrawing` row (the homeowner's "Drawings" tab), and
  * when the PDF is a floor plan / layout, a :class:`Space` skeleton — one floor
    plus a child room per distinct room name the model could see — deduped (case
    insensitively) against rooms the site already has.

Idempotent by construction: every created row uses a deterministic ``uuid5`` id
(re-running upserts, never duplicates) and rooms are skipped when a same-named
space already exists for the site. Specs / components are deliberately NOT
created here — a later enrichment script owns those.

SAFE BY DEFAULT for tests: real Azure creds are only pulled into the environment
inside :func:`main` (via ``scripts._bootstrap_env.load``), never at import time,
so importing this module in a test stays on the network-free ``FakeLLMClient``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_documents
"""
from __future__ import annotations

import asyncio
from collections.abc import Callable
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.extraction.pdf_read import read_pdf
from app.models import (
    ChatMessage,
    Conversation,
    DrawingKind,
    PublishedDrawing,
    Space,
    SpaceKind,
)

# Same deterministic namespace + id helper the import uses, so ids created here
# are stable across runs and never collide with the import's own ids.
EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


# PDF kinds the reader returns (floor_plan|layout|render|other) → the homeowner
# DrawingKind enum. Floor plans/layouts read as "plan"; everything else "other".
_PDF_KIND_TO_DRAWING = {
    "floor_plan": DrawingKind.plan,
    "layout": DrawingKind.plan,
    "render": DrawingKind.other,
    "other": DrawingKind.other,
}
# Only these PDF kinds spawn a room skeleton.
_ROOMY_KINDS = {"floor_plan", "layout"}


def _title_from(attachment_key: str | None, summary: str) -> str:
    """A human title: the file's basename (sans extension), else the summary."""
    if attachment_key:
        base = attachment_key.rsplit("/", 1)[-1]
        stem = base.rsplit(".", 1)[0] if "." in base else base
        stem = stem.replace("_", " ").replace("-", " ").strip()
        if stem:
            return stem[:200]
    summary = (summary or "").strip()
    return (summary[:200] if summary else "Drawing")


def _norm_room(name: str) -> str:
    """Case/space-insensitive key for room dedupe."""
    return " ".join((name or "").split()).lower()


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
    """Read every imported PDF and upsert drawings (+ a room skeleton).

    ``session_factory`` is injectable so tests bind it to a rolled-back test
    session (mirrors ``scaffold_homeowner``); defaults to the real
    ``SessionLocal``. Returns ``{"pdfs_read", "drawings", "spaces"}``.
    """
    site_id = _id("site")
    llm = get_llm_client("vision")
    pdfs_read = drawings = spaces = 0

    async with session_factory() as s:
        # Every PDF that arrived as an in-app chat attachment on this site.
        rows = (
            await s.execute(
                select(ChatMessage)
                .join(Conversation, ChatMessage.conversation_id == Conversation.id)
                .where(
                    Conversation.site_id == site_id,
                    ChatMessage.media_type == "document",
                    ChatMessage.attachment_key.is_not(None),
                )
                .order_by(ChatMessage.created_at)
            )
        ).scalars().all()

        # Existing rooms (any kind) for case-insensitive dedupe across the site —
        # includes both the import scaffold's rooms and any added on prior runs.
        existing_spaces = (
            await s.execute(select(Space).where(Space.site_id == site_id))
        ).scalars().all()
        seen_rooms: set[str] = {_norm_room(sp.name) for sp in existing_spaces}

        # One generic floor to hang discovered rooms under. Created lazily (only
        # when a floor-plan PDF actually yields rooms) and reused thereafter.
        floor_id: UUID | None = None

        for msg in rows:
            info = await read_pdf(msg.attachment_key, llm=llm)
            pdfs_read += 1

            kind = info.get("kind") or "other"
            summary = (info.get("summary") or "").strip()

            # 1) Drawing row (one per PDF chat message; uuid5 ⇒ idempotent).
            await _upsert(
                s,
                PublishedDrawing,
                _id("drawing", str(msg.id)),
                site_id=site_id,
                title=_title_from(msg.attachment_key, summary),
                version="v1",
                file_url=msg.attachment_key,
                kind=_PDF_KIND_TO_DRAWING.get(kind, DrawingKind.other),
                plain_summary_en=summary or None,
            )
            drawings += 1

            # 2) Room skeleton — floor plans / layouts only, and only for room
            # names we have not already seen for this site.
            rooms = info.get("rooms") or []
            if kind not in _ROOMY_KINDS or not rooms:
                continue

            new_rooms = [
                r for r in rooms
                if isinstance(r, str) and r.strip() and _norm_room(r) not in seen_rooms
            ]
            if not new_rooms:
                continue

            if floor_id is None:
                floor_id = _id("space", "floor")
                await _upsert(
                    s, Space, floor_id,
                    site_id=site_id, parent_id=None, name="Floor Plan",
                    kind=SpaceKind.floor, order=0,
                )
                await s.flush()
                spaces += 1

            for room in new_rooms:
                norm = _norm_room(room)
                # Guard against duplicates *within* this PDF's room list too.
                if norm in seen_rooms:
                    continue
                seen_rooms.add(norm)
                await _upsert(
                    s, Space, _id("space", "room", norm),
                    site_id=site_id, parent_id=floor_id, name=room.strip(),
                    kind=SpaceKind.room, order=len(seen_rooms),
                )
                spaces += 1

        await s.commit()

    return {"pdfs_read": pdfs_read, "drawings": drawings, "spaces": spaces}


def main() -> None:
    # Pull real Azure creds into os.environ for the vision client — here in the
    # CLI entry only (NOT at import) so test imports stay on the FakeLLM.
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched documents:", counts)


if __name__ == "__main__":
    main()
