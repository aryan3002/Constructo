"""Enrich imported photos → vision captions + a homeowner timeline event.

Second-pass enrichment over the real Tripathi import (see
``scripts.import_whatsapp_export``): every :class:`PublishedPhoto` on the site is
*looked at* by the vision-tier LLM (``app.extraction.vision.caption_photo``) and
turned into product data:

  * the photo's ``caption`` (when blank) + ``room_tag`` are filled in, and
  * one :class:`SiteEventModel` is created per photo (uuid5 ⇒ idempotent),
    mapping the vision category to an event type:
      progress              → progress_update
      drawing|design_option → drawing_shared
      document              → (no event)
      other                 → progress_update

Vision can't fetch a bare storage key or a local file path, so every image is
resolved to a **base64 data URI** (``data:image/...;base64,...``) from the stored
bytes before the call — works for BOTH the local backend (read under MEDIA_DIR)
and R2 (presigned GET → fetch → encode), so the same path runs in local
validation and in prod.

SAFE BY DEFAULT for tests: real Azure creds are only pulled into the environment
inside :func:`main` (via ``scripts._bootstrap_env.load``), never at import time,
so importing this module in a test stays on the network-free ``FakeLLMClient``.

    export PATH="$HOME/.local/bin:$PATH"
    uv run python -m scripts.enrich_photos
"""
from __future__ import annotations

import asyncio
import base64
import os
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, UUID, uuid5

from sqlalchemy import select

from app.db import SessionLocal
from app.extraction.llm import get_llm_client
from app.extraction.vision import caption_photo
from app.models import ChatMessage, Conversation, PublishedPhoto, RawMessageModel, SiteEventModel
from app.storage import get_storage

EXTERNAL_GROUP_ID = "tripathi-dream-home"
NS = uuid5(NAMESPACE_URL, f"constructo.wa-import.{EXTERNAL_GROUP_ID}")


def _id(*parts: str) -> UUID:
    return uuid5(NS, ":".join(parts))


# Vision category → SiteEvent event_type. "document" maps to None (no event).
_CATEGORY_TO_EVENT = {
    "progress": "progress_update",
    "design_option": "drawing_shared",
    "drawing": "drawing_shared",
    "other": "progress_update",
    "document": None,
}

_MIME_BY_EXT = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "webp": "image/webp", "heic": "image/heic", "gif": "image/gif",
}


def _mime_for(ref: str, fallback: str = "image/jpeg") -> str:
    ext = ref.rsplit(".", 1)[-1].lower() if "." in ref.rsplit("/", 1)[-1] else ""
    return _MIME_BY_EXT.get(ext, fallback)


async def _read_bytes(ref: str) -> bytes | None:
    """Resolve a stored image ref to raw bytes, or ``None`` on any failure.

    The storage Protocol has no read method, so we resolve via ``url_for`` (the
    one resolver both backends share) and then read accordingly:
      * LOCAL backend → ``url_for`` returns a filesystem path (bare key joined to
        MEDIA_DIR) → read off disk.
      * S3/R2 backend → ``url_for`` returns a short-lived presigned http(s) GET
        URL → fetch with httpx.
    Also tolerates an already-absolute path or an http(s) url stored directly.
    """
    if not ref:
        return None
    try:
        # An existing local path wins (cheapest; also covers absolute refs).
        if os.path.isfile(ref):
            with open(ref, "rb") as fh:
                return fh.read()

        resolved = get_storage().url_for(ref) or ref
        low = resolved.lower()
        if low.startswith(("http://", "https://")):
            import httpx

            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                resp = await client.get(resolved)
                resp.raise_for_status()
                return resp.content
        if low.startswith("file://"):
            resolved = resolved[len("file://") :]
        if os.path.isfile(resolved):
            with open(resolved, "rb") as fh:
                return fh.read()
    except Exception:
        # Tolerant: a missing/unfetchable object yields no bytes (caller skips).
        return None
    return None


async def _data_uri(ref: str) -> str | None:
    """Resolve a stored image ref to a ``data:image/...;base64,...`` URI."""
    data = await _read_bytes(ref)
    if not data:
        return None
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{_mime_for(ref)};base64,{b64}"


async def _upsert(session, model, ident: UUID, **fields):
    obj = await session.get(model, ident)
    if obj is None:
        obj = model(id=ident, **fields)
        session.add(obj)
    else:
        for k, v in fields.items():
            setattr(obj, k, v)
    return obj


# Bounded concurrency for the (network-bound) vision calls. Override with
# VISION_CONCURRENCY. Kept modest so we stay under Azure's tokens/min limit.
_VISION_CONCURRENCY = int(os.environ.get("VISION_CONCURRENCY", "6"))


async def _vision_for(image_url: str, llm) -> dict | None:
    """Resolve a photo to a data URI and caption it (session-free, tolerant).

    Returns the vision result dict, or ``None`` when the object can't be fetched
    or the model errors (a re-run retries it — captioning is idempotent). One
    retry smooths a transient 429 / connection blip.
    """
    data_uri = await _data_uri(image_url)
    if data_uri is None:
        return None
    for attempt in range(2):
        try:
            return await caption_photo(data_uri, llm=llm)
        except Exception:
            if attempt == 0:
                await asyncio.sleep(2.0)
            else:
                return None
    return None


async def run(session_factory: Callable = SessionLocal) -> dict:
    """Caption every imported photo + create its timeline event (idempotent).

    The vision calls (network-bound, the slow part) run concurrently under a
    bounded semaphore; the DB writes stay serial on one session (so an injected
    rolled-back test session still works). ``session_factory`` is injectable for
    tests; defaults to the real ``SessionLocal``. Returns
    ``{"photos", "captioned", "events"}``.
    """
    site_id = _id("site")
    llm = get_llm_client("vision")
    photos = captioned = events = 0
    sem = asyncio.Semaphore(_VISION_CONCURRENCY)

    async def _visit(image_url: str):
        async with sem:
            return await _vision_for(image_url, llm)

    async with session_factory() as s:
        rows = (
            await s.execute(
                select(PublishedPhoto)
                .where(PublishedPhoto.site_id == site_id)
                .order_by(PublishedPhoto.published_at)
            )
        ).scalars().all()
        photos = len(rows)

        # Phase 1: caption all photos concurrently (no DB access in here).
        results = await asyncio.gather(*[_visit(p.image_url) for p in rows])

        # Phase 2: apply DB writes serially on the open session.
        for photo, result in zip(rows, results):
            if result is None:
                # No fetchable bytes or vision error — skip; a re-run retries it.
                continue

            caption = (result.get("caption") or "").strip()
            room_hint = result.get("room_hint")
            category = result.get("category") or "other"

            # Fill caption only when blank (never clobber a human caption).
            if not (photo.caption or "").strip():
                photo.caption = caption or photo.caption
                if caption:
                    captioned += 1
            # room_tag: set when we learned one and it isn't already populated.
            if room_hint and not photo.room_tag:
                photo.room_tag = room_hint

            event_type = _CATEGORY_TO_EVENT.get(category, "progress_update")
            # Skip event creation for documents or when there is no caption text.
            if event_type is None or not caption:
                continue

            # Resolve the photo's source message (via the import bridge:
            # PublishedPhoto.image_url == ChatMessage.attachment_key) to recover
            # the original send date + the linked RawMessage id.
            occurred_dt: datetime | None = None
            raw_id: UUID | None = None
            link = (
                await s.execute(
                    select(ChatMessage.created_at, ChatMessage.raw_message_id)
                    .join(Conversation, ChatMessage.conversation_id == Conversation.id)
                    .where(
                        Conversation.site_id == site_id,
                        ChatMessage.attachment_key == photo.image_url,
                    )
                    .order_by(ChatMessage.created_at)
                    .limit(1)
                )
            ).first()
            if link is not None:
                occurred_dt, raw_id = link[0], link[1]
                if raw_id is not None:
                    # Prefer the RawMessage's original send date if present.
                    rm_sent = (
                        await s.execute(
                            select(RawMessageModel.sent_at).where(RawMessageModel.id == raw_id)
                        )
                    ).scalar_one_or_none()
                    if rm_sent is not None:
                        occurred_dt = rm_sent

            occurred_on = (
                occurred_dt.date()
                if occurred_dt is not None
                else (photo.published_at or datetime.now(UTC)).date()
            )
            source_ids = [raw_id] if raw_id is not None else []

            await _upsert(
                s,
                SiteEventModel,
                _id("photo-event", str(photo.id)),
                site_id=site_id,
                event_type=event_type,
                occurred_on=occurred_on,
                summary=caption,
                fields={"description": caption, "room": room_hint},
                confidence=0.8,
                needs_clarification=False,
                source_message_ids=source_ids,
                version=1,
            )
            events += 1

        await s.commit()

    return {"photos": photos, "captioned": captioned, "events": events}


def main() -> None:
    from scripts._bootstrap_env import load as _load_env

    _load_env()
    counts = asyncio.run(run())
    print("Enriched photos:", counts)


if __name__ == "__main__":
    main()
