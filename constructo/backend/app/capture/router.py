"""App-authenticated field capture.

The richer-than-WhatsApp capture path for supervisors/mukadams: a JWT-auth'd
multipart POST (NOT the bridge ``X-Ingest-Key``) that stores any attached media
to ``MEDIA_DIR`` and drops a ``RawMessage(source="app")`` into the SAME
extraction pipeline the WhatsApp bridge feeds. The worker resolves the site from
``external_group_id="app:{site_id}"`` (see ``app.extraction.worker``), so app
captures need no WhatsApp group mapping.

The caller must be assigned to ``site_id`` (owner/PM see all company sites). With
``EXTRACTION_SYNC=true`` the pipeline runs inline; otherwise it is enqueued.
"""
from __future__ import annotations

import mimetypes
import os
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.common.errors import AppError
from app.config import settings
from app.contracts.events import MediaType
from app.db import get_session
from app.models import RawMessageModel, User
from app.queue import enqueue_extraction
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1", tags=["capture"])

# Max bytes accepted for an uploaded capture (10 MB — generous for a site photo
# or short voice note; guards against a runaway upload).
MAX_MEDIA_BYTES = 10 * 1024 * 1024


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
    """Persist an uploaded file under MEDIA_DIR. Returns (media_url, mime, type).

    ``media_url`` is the bare filename (relative to MEDIA_DIR), matching the
    convention the extraction media-resolver expects — it resolves bare paths
    against ``settings.media_dir``.
    """
    data = await media.read()
    if len(data) > MAX_MEDIA_BYTES:
        raise AppError(413, "media_too_large", "Capture media exceeds 10 MB")
    os.makedirs(settings.media_dir, exist_ok=True)
    filename = f"app_{uuid4().hex}{_ext_for(media.content_type, media.filename)}"
    with open(os.path.join(settings.media_dir, filename), "wb") as fh:
        fh.write(data)
    return filename, media.content_type or "application/octet-stream", _infer_media_type(
        media.content_type, media.filename
    )


@router.post("/capture", status_code=201)
async def capture(
    site_id: UUID = Form(...),
    type: str | None = Form(default=None),
    text: str | None = Form(default=None),
    media: UploadFile | None = File(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Capture a site update from the app and feed it to extraction.

    Multipart form: ``site_id`` (required), optional ``type`` hint
    (attendance|delivery|progress|issue|…), optional ``text``, optional ``media``
    file. At least one of ``text`` / ``media`` must be present.
    """
    # Permission: the caller must be able to see (be assigned to) the site.
    visible = await effective_visible_site_ids(session, user)
    if site_id not in visible:
        raise AppError(403, "forbidden", "You are not assigned to this site")

    if media is None and not (text and text.strip()):
        raise AppError(422, "empty_capture", "Provide text or a media file")

    media_url: str | None = None
    media_mime: str | None = None
    media_type = MediaType.text
    if media is not None:
        media_url, media_mime, media_type = await _store_media(media)

    now = datetime.now(UTC)
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
        raw={"client": "app", "capture_type": type, "site_id": str(site_id)},
    )
    session.add(row)
    await session.commit()

    # Inline (EXTRACTION_SYNC) or enqueue; never raises into the request path.
    await enqueue_extraction(row.id)
    return {"raw_message_id": str(row.id), "status": "queued"}
