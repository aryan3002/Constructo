"""Filesystem storage (dev / tests). Mirrors the legacy MEDIA_DIR resolver."""
from __future__ import annotations

import os

from app.config import settings
from app.storage.base import PresignedUpload


class LocalStorage:
    """Stores bytes under ``settings.media_dir``; refs are bare relative keys."""

    def put_bytes(self, key: str, data: bytes, content_type: str) -> str:
        path = os.path.join(settings.media_dir, key)
        os.makedirs(os.path.dirname(path) or settings.media_dir, exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(data)
        return key

    def url_for(self, ref: str | None) -> str | None:
        # Exact legacy behavior (was extract._normalize_media_ref): pass http(s)
        # through, strip file://, keep absolute paths, resolve bare keys against
        # MEDIA_DIR so OCR/STT/Fakes see the same path they always have.
        if not ref:
            return ref
        ref = ref.strip()
        low = ref.lower()
        if low.startswith(("http://", "https://")):
            return ref
        if low.startswith("file://"):
            return ref[len("file://") :]
        if os.path.isabs(ref):
            return ref
        return os.path.join(settings.media_dir, ref)

    def presigned_put(self, key: str, content_type: str) -> PresignedUpload:
        # Local dev has no presigned upload; the homeowner-upload flow (R1) adds
        # a server-side fallback endpoint for the local backend.
        raise NotImplementedError(
            "Local storage has no presigned upload; use STORAGE_BACKEND=s3 (R2) "
            "or the server-side local upload fallback."
        )

    def delete(self, key: str) -> None:
        try:
            os.remove(os.path.join(settings.media_dir, key))
        except OSError:
            pass
