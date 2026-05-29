"""Cursor pagination helpers shared by all list endpoints.

Convention: ?limit=50&cursor=...  ->  {"items": [...], "next_cursor": ...}
Cursors are opaque, URL-safe base64 strings so callers never depend on their contents.
"""
import base64
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def encode_cursor(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    return base64.urlsafe_b64encode(value.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: Optional[str]) -> Optional[str]:
    if cursor is None:
        return None
    try:
        return base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
    except Exception as exc:  # malformed / tampered cursor
        raise ValueError("invalid cursor") from exc


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: Optional[str] = None
