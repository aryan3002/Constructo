"""Storage backend behavior — local round-trip + S3 ref resolution (mocked)."""
from __future__ import annotations

import os
from unittest.mock import MagicMock

import pytest

from app.storage.local import LocalStorage


def test_local_put_and_url_for_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr("app.config.settings.media_dir", str(tmp_path))
    s = LocalStorage()
    ref = s.put_bytes("captures/app_abc.jpg", b"hello", "image/jpeg")
    assert ref == "captures/app_abc.jpg"
    # bytes landed under MEDIA_DIR (subdir created)
    assert (tmp_path / "captures" / "app_abc.jpg").read_bytes() == b"hello"
    # url_for resolves a bare key to the MEDIA_DIR path (legacy behavior)
    assert s.url_for(ref) == os.path.join(str(tmp_path), "captures/app_abc.jpg")


def test_local_url_for_passthrough_and_file_uri():
    s = LocalStorage()
    assert s.url_for("https://cdn.example/x.jpg") == "https://cdn.example/x.jpg"
    assert s.url_for("file:///abs/p.jpg") == "/abs/p.jpg"
    assert s.url_for("/already/abs.jpg") == "/already/abs.jpg"
    assert s.url_for(None) is None


def test_s3_url_for_presigns_keys_and_passes_urls(monkeypatch):
    # Configure S3 settings so the backend constructs, but stub boto3.
    monkeypatch.setattr("app.config.settings.s3_endpoint_url", "https://acct.r2.cloudflarestorage.com")
    monkeypatch.setattr("app.config.settings.s3_bucket", "constructo-media")
    monkeypatch.setattr("app.config.settings.s3_access_key_id", "ak")
    monkeypatch.setattr("app.config.settings.s3_secret_access_key", "sk")

    fake_client = MagicMock()
    fake_client.generate_presigned_url.return_value = "https://signed.example/get"
    monkeypatch.setattr("boto3.client", lambda *a, **k: fake_client)

    from app.storage.s3 import S3Storage

    s = S3Storage()
    # a real URL passes through untouched (no signing)
    assert s.url_for("https://cdn/x.jpg") == "https://cdn/x.jpg"
    # a bare key is presigned for GET
    assert s.url_for("captures/x.jpg") == "https://signed.example/get"
    fake_client.generate_presigned_url.assert_called_with(
        "get_object",
        Params={"Bucket": "constructo-media", "Key": "captures/x.jpg"},
        ExpiresIn=3600,
    )
    # put_bytes proxies to put_object and returns the key
    assert s.put_bytes("k.jpg", b"d", "image/jpeg") == "k.jpg"
    fake_client.put_object.assert_called_once()


def test_s3_missing_config_raises(monkeypatch):
    monkeypatch.setattr("app.config.settings.s3_endpoint_url", None)
    monkeypatch.setattr("app.config.settings.s3_bucket", None)
    from app.storage.s3 import S3Storage

    with pytest.raises(RuntimeError, match="missing config"):
        S3Storage()
