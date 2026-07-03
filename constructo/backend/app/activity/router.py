"""GET /api/v1/activity — the Owner activity-first Command Center feed.

Company-scoped, keyset-paginated union over nine homeowner-feed / decision /
finding source tables. The session work (loading rows per source, ordered +
capped) lives here; the merge/sort/summary is the pure ``aggregate.build_activity``.

This module currently holds only the keyset cursor codec (Task A3). The
endpoint itself (Task A4) is added in a follow-up change; keeping the codec
importable and unit-testable on its own lets A4's endpoint depend on it
without a circular build-up.
"""
from __future__ import annotations

from app.common.errors import AppError
from app.common.pagination import decode_cursor, encode_cursor


def encode_activity_cursor(cursor: tuple[str, str] | None) -> str | None:
    """Pack ``(occurred_at_iso, id)`` into an opaque base64 token."""
    if cursor is None:
        return None
    occurred_at, item_id = cursor
    return encode_cursor(f"{occurred_at}|{item_id}")


def decode_activity_cursor(raw: str | None) -> tuple[str, str] | None:
    """Inverse of :func:`encode_activity_cursor`; 400 on tampered input."""
    if raw is None:
        return None
    try:
        payload = decode_cursor(raw)
    except ValueError as exc:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor") from exc
    if payload is None or "|" not in payload:
        raise AppError(400, "invalid_cursor", "Malformed pagination cursor")
    occurred_at, item_id = payload.split("|", 1)
    return (occurred_at, item_id)
