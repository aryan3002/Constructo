"""Round-trip + tamper tests for the activity keyset cursor codec."""
from __future__ import annotations

import pytest

from app.activity.router import decode_activity_cursor, encode_activity_cursor
from app.common.errors import AppError


def test_none_roundtrips_to_none():
    assert encode_activity_cursor(None) is None
    assert decode_activity_cursor(None) is None


def test_roundtrip_preserves_tuple():
    cur = ("2026-07-03T12:00:00+00:00", "photo_shared:1a2b")
    token = encode_activity_cursor(cur)
    assert isinstance(token, str)
    assert decode_activity_cursor(token) == cur


def test_id_may_contain_no_delimiter_collision():
    # ids are "{kind}:{uuid}" which never contain '|', so split is unambiguous.
    cur = ("2026-07-03T00:00:00+00:00", "site_health_flag:deadbeef")
    assert decode_activity_cursor(encode_activity_cursor(cur)) == cur


def test_tampered_cursor_raises_apperror():
    with pytest.raises(AppError) as exc:
        decode_activity_cursor("!!!not-base64!!!")
    assert exc.value.status_code == 400
    assert exc.value.code == "invalid_cursor"


def test_missing_delimiter_raises_apperror():
    from app.common.pagination import encode_cursor

    bad = encode_cursor("no-pipe-here")  # valid base64, wrong payload shape
    with pytest.raises(AppError) as exc:
        decode_activity_cursor(bad)
    assert exc.value.status_code == 400
