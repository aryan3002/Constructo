"""SSRF guard for server-side media fetches (Vuln 5).

A stored media ref can be attacker-controlled (chat ``attachment_key`` from any
authenticated user, or the ingest ``media_url``). Before our backend fetches an
http(s) ref (STT audio, PDF bytes) the host must not resolve to a private /
internal address, or a crafted ref could reach cloud metadata or internal
services. Bare keys / local paths / file:// are not network fetches and pass.
"""
from __future__ import annotations

import pytest

from app.common.errors import AppError
from app.extraction.url_guard import assert_safe_media_url


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/iam/security-credentials/",  # cloud metadata
        "http://127.0.0.1/internal",  # loopback
        "https://127.0.0.1:8000/admin",  # loopback + port
        "http://10.0.0.5/secret",  # private (RFC1918)
        "http://192.168.1.1/router",  # private
        "http://172.16.0.1/svc",  # private
        "http://0.0.0.0/",  # unspecified
        "http://localhost/internal",  # resolves to loopback
    ],
)
def test_blocks_private_and_internal_hosts(url):
    with pytest.raises(AppError) as ei:
        assert_safe_media_url(url)
    assert ei.value.status_code == 400
    assert ei.value.code == "blocked_media_url"


@pytest.mark.parametrize(
    "url",
    [
        "https://8.8.8.8/audio.ogg",  # public IP
        "https://1.1.1.1/doc.pdf",  # public IP
    ],
)
def test_allows_public_hosts(url):
    # Must not raise.
    assert_safe_media_url(url)


@pytest.mark.parametrize(
    "ref",
    [
        "chat/abc/def.ogg",  # bare storage key
        "captures/app_deadbeef.jpg",  # bare storage key
        "/var/media/local/file.pdf",  # absolute local path
        "file:///tmp/x.wav",  # file:// path
    ],
)
def test_allows_non_network_refs(ref):
    # Bare keys and local/file paths are not network fetches — never blocked.
    assert_safe_media_url(ref)


def test_blocks_url_without_host():
    with pytest.raises(AppError):
        assert_safe_media_url("http:///nohost")
