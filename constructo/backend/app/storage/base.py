"""Storage interface shared by the local and S3 backends."""
from __future__ import annotations

from typing import Protocol, TypedDict


class PresignedUpload(TypedDict):
    """A direct-to-storage upload ticket (homeowner R1 flow)."""

    key: str
    url: str
    method: str  # always "PUT"
    headers: dict[str, str]  # headers the client must send with the PUT
    expires_in: int


class Storage(Protocol):
    """Where uploaded media lives. Implementations are cheap to construct."""

    def put_bytes(self, key: str, data: bytes, content_type: str) -> str:
        """Store ``data`` under ``key`` (server-side upload). Returns the stored
        ref to persist in ``media_url`` (the bare key)."""
        ...

    def url_for(self, ref: str | None) -> str | None:
        """Resolve a stored ref into something OCR/STT/vision (and the app) can
        fetch: an http(s) URL is passed through; a bare key becomes a presigned
        GET URL (S3) or a local filesystem path (local)."""
        ...

    def presigned_put(self, key: str, content_type: str) -> PresignedUpload:
        """Mint a short-lived direct-upload ticket for the client (R1)."""
        ...
