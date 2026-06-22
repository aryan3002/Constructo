"""SSRF guard for server-side media fetches.

Stored media refs can be attacker-controlled — the chat ``attachment_key`` is a
free-form string from any authenticated user, and the ingest ``media_url`` comes
over the bridge. Before our backend fetches an http(s) ref (STT audio bytes, PDF
bytes) we reject any URL whose host resolves to a private / loopback /
link-local / reserved address, so a crafted ref cannot reach cloud metadata
(169.254.169.254) or internal-only services.

Bare storage keys, absolute local paths and ``file://`` refs are not network
fetches — they pass through untouched. Public hosts (our R2/S3 presigned URLs,
the WhatsApp media CDN, the Unsplash stopgap) resolve to public addresses and
are allowed.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from app.common.errors import AppError

_BLOCKED = "blocked_media_url"


def _is_blocked_address(ip: str) -> bool:
    addr = ipaddress.ip_address(ip.split("%", 1)[0])  # drop any IPv6 zone id
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


def assert_safe_media_url(url: str) -> None:
    """Raise ``AppError(400, blocked_media_url)`` if ``url`` is an http(s) URL
    whose host resolves to a non-public address (SSRF). Non-http(s) refs (bare
    keys, local/``file://`` paths) are not network fetches and are allowed."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return
    host = parsed.hostname
    if not host:
        raise AppError(400, _BLOCKED, "Media URL has no host")
    try:
        infos = socket.getaddrinfo(host, parsed.port or None)
    except (socket.gaierror, UnicodeError) as exc:
        raise AppError(400, _BLOCKED, "Media host did not resolve") from exc
    for info in infos:
        ip = info[4][0]
        if _is_blocked_address(ip):
            raise AppError(400, _BLOCKED, "Media URL host is not allowed")
