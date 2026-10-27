"""App-authenticated field capture.

The richer-than-WhatsApp capture path for supervisors/mukadams: a JWT-auth'd
multipart POST (NOT the bridge ``X-Ingest-Key``) that stores any attached media
to ``MEDIA_DIR`` and drops a ``RawMessage(source="app")`` into the SAME
extraction pipeline the WhatsApp bridge feeds. The worker resolves the site from
``external_group_id="app:{site_id}"`` (see ``app.extraction.worker``), so app
captures need no WhatsApp group mapping.

A capture may carry a ``client_capture_id`` the phone generated once, when the
capture was made. It is stored as ``provider_message_id = "{user_id}:{id}"`` so
the ``uq_raw_provider_message`` index (the one that drops repeat WhatsApp
deliveries) also makes a retried capture land once: a repeat answers with the
first row's id instead of filing it again (T9).

The caller must be assigned to ``site_id`` (owner/PM see all company sites). With
``EXTRACTION_SYNC=true`` the pipeline runs inline; otherwise it is enqueued.
"""
from __future__ import annotations

import json
import mimetypes
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.contracts.events import MediaType
from app.db import get_session
from app.models import RawMessageModel, User
from app.queue import enqueue_extraction
from app.sites.router import effective_visible_site_ids
from app.storage import get_storage

router = APIRouter(prefix="/api/v1", tags=["capture"])

# Max bytes accepted for an uploaded capture (10 MB — generous for a site photo
# or short voice note; guards against a runaway upload).
MAX_MEDIA_BYTES = 10 * 1024 * 1024

# A client capture id is a short opaque token from the phone.
MAX_CLIENT_CAPTURE_ID = 100


def _infer_media_type(content_type: str | None, filename: str | None) -> MediaType:
    ct = (content_type or "").lower()
    if ct.startswith("image/"):
        return MediaType.image
    if ct.startswith("audio/"):
        return MediaType.voice
    if ct.startswith("video/"):
        return MediaType.video
    if ct:
        return MediaType.document
    # Fall back to the extension when the client sent no content-type.
    ext = (os.path.splitext(filename or "")[1] or "").lower()
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"}:
        return MediaType.image
    if ext in {".m4a", ".mp3", ".wav", ".ogg", ".aac", ".opus"}:
        return MediaType.voice
    if ext in {".mp4", ".mov", ".webm", ".3gp"}:
        return MediaType.video
    return MediaType.document


def _ext_for(content_type: str | None, filename: str | None) -> str:
    ext = os.path.splitext(filename or "")[1]
    if ext:
        return ext
    guessed = mimetypes.guess_extension(content_type or "") if content_type else None
    return guessed or ".bin"


async def _store_media(media: UploadFile) -> tuple[str, str, MediaType]:
    """Persist an uploaded capture and return (media_ref, mime, type).

    ``media_ref`` is the storage key (a bare ``captures/app_<uuid>.<ext>``
    relative path). The extraction media-resolver turns it into a fetchable URL
    (presigned GET on S3/R2) or a local path — so this is durable on object
    storage instead of the container's ephemeral disk.
    """
    data = await media.read()
    if len(data) > MAX_MEDIA_BYTES:
        raise AppError(413, "media_too_large", "Capture media exceeds 10 MB")
    content_type = media.content_type or "application/octet-stream"
    key = f"captures/app_{uuid4().hex}{_ext_for(media.content_type, media.filename)}"
    ref = get_storage().put_bytes(key, data, content_type)
    return ref, content_type, _infer_media_type(media.content_type, media.filename)


async def _existing_capture(session: AsyncSession, provider_message_id: str) -> UUID | None:
    """The row an earlier send of the same capture created, if any."""
    return (
        await session.execute(
            select(RawMessageModel.id).where(
                RawMessageModel.source == "app",
                RawMessageModel.provider_message_id == provider_message_id,
            )
        )
    ).scalar_one_or_none()


def _duplicate(raw_message_id: UUID) -> dict[str, str]:
    return {"raw_message_id": str(raw_message_id), "status": "duplicate"}


@router.post("/capture", status_code=201)
async def capture(
    site_id: UUID = Form(...),
    type: str | None = Form(default=None),
    text: str | None = Form(default=None),
    fields: str | None = Form(default=None),
    client_capture_id: str | None = Form(default=None),
    media: UploadFile | None = File(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Capture a site update from the app and feed it to extraction.

    Multipart form: ``site_id`` (required), optional ``type`` hint
    (attendance|delivery|progress|issue|…), optional ``text``, optional ``fields``
    (a JSON object of structured field values from a typed card), optional
    ``media`` file. At least one of ``text`` / ``media`` / ``fields`` must be
    present.

    When ``type`` **and** ``fields`` are both provided (a typed card), extraction
    skips the LLM and books the event verbatim at confidence 1.0 (Phase 0.1).

    An optional ``client_capture_id`` makes the send idempotent per user: a
    repeat returns the first ``raw_message_id`` without storing media or
    queueing extraction again.
    """
    # Permission: the caller must be able to see (be assigned to) the site.
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "You are not assigned to this site")

    # Parse the optional structured field payload from a typed card.
    parsed_fields: dict | None = None
    if fields and fields.strip():
        try:
            loaded = json.loads(fields)
        except json.JSONDecodeError as exc:
            raise AppError(422, "invalid_fields", "fields must be valid JSON") from exc
        if not isinstance(loaded, dict):
            raise AppError(422, "invalid_fields", "fields must be a JSON object")
        parsed_fields = loaded

    if media is None and not (text and text.strip()) and parsed_fields is None:
        raise AppError(422, "empty_capture", "Provide text, fields, or a media file")

    provider_message_id: str | None = None
    cid = (client_capture_id or "").strip()
    if cid:
        if len(cid) > MAX_CLIENT_CAPTURE_ID:
            raise AppError(422, "invalid_client_capture_id", "client_capture_id is too long")
        provider_message_id = f"{user.id}:{cid}"
        existing = await _existing_capture(session, provider_message_id)
        if existing is not None:
            return _duplicate(existing)

    media_url: str | None = None
    media_mime: str | None = None
    media_type = MediaType.text
    if media is not None:
        media_url, media_mime, media_type = await _store_media(media)

    now = datetime.now(UTC)
    raw_payload: dict = {"client": "app", "capture_type": type, "site_id": str(site_id)}
    if parsed_fields is not None:
        raw_payload["fields"] = parsed_fields
    row = RawMessageModel(
        source="app",
        external_group_id=f"app:{site_id}",
        sender_id=str(user.id),
        sender_name=user.name,
        media_type=media_type.value,
        text=text,
        media_url=media_url,
        media_mime=media_mime,
        sent_at=now,
        received_at=now,
        raw=raw_payload,
        provider_message_id=provider_message_id,
    )
    session.add(row)
    try:
        await session.commit()
    except IntegrityError:
        # Two sends of the same capture raced past the lookup; the other one
        # committed first. Answer with its row and drop the media we stored.
        await session.rollback()
        if provider_message_id is None:
            raise
        existing = await _existing_capture(session, provider_message_id)
        if existing is None:
            raise
        if media_url is not None:
            try:
                get_storage().delete(media_url)
            except Exception:  # noqa: BLE001 - best-effort cleanup
                pass
        return _duplicate(existing)

    # Inline (EXTRACTION_SYNC) or enqueue; never raises into the request path.
    await enqueue_extraction(row.id)
    return {"raw_message_id": str(row.id), "status": "queued"}
