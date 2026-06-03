"""Media storage abstraction.

Two backends behind one interface:
  - LocalStorage — writes under MEDIA_DIR; ``url_for`` resolves bare refs to a
    local path (dev / tests, mirroring the legacy media-resolver behavior).
  - S3Storage — any S3-compatible store (Cloudflare R2 in prod). Stores only the
    object KEY in ``media_url`` and resolves it to a short-lived presigned GET
    URL (private bucket). ``presigned_put`` powers the homeowner direct upload.

Extraction (OCR/STT/vision) consumes URLs, so swapping the backend is a no-op for
the pipeline. Selected by ``settings.storage_backend`` ("local" | "s3").
"""
from __future__ import annotations

from functools import lru_cache

from app.config import settings
from app.storage.base import Storage
from app.storage.local import LocalStorage


@lru_cache(maxsize=1)
def get_storage() -> Storage:
    """Return the process-wide storage backend (cached)."""
    if settings.storage_backend == "s3":
        # Imported lazily so local/test runs never need boto3 configured.
        from app.storage.s3 import S3Storage

        return S3Storage()
    return LocalStorage()


__all__ = ["Storage", "LocalStorage", "get_storage"]
