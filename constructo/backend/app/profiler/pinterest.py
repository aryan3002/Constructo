"""Pinterest paste-a-link resolver for the Design Profiler.

A homeowner pastes a single pin URL; we read its public preview image and hand
back the bytes so the router can RE-HOST it into our own R2 bucket (Pinterest
URLs rotate, and re-hosting means the reference behaves exactly like an upload
through display + vision + ranking).

`PinResolver` is injected as a FastAPI dependency so tests stub the network.
The pure helpers (`parse_og_image`, `is_pinterest_url`) are network-free and
unit-tested directly. og:image scraping is intentionally simple; if Pinterest
changes its markup this one module is the only thing that breaks.
"""
from __future__ import annotations

import re
from urllib.parse import urlparse

import httpx

from app.common.errors import AppError
from app.extraction.url_guard import assert_safe_media_url

_PIN_HOST_RE = re.compile(r"(^|\.)(pinterest\.[a-z.]+|pin\.it)$", re.I)
_OG_IMAGE_RE = re.compile(
    r'<meta[^>]+(?:property|name)=["\'](?:og:image(?::secure_url)?|twitter:image)["\']'
    r'[^>]+content=["\']([^"\']+)["\']',
    re.I,
)
_FETCH_TIMEOUT = 10.0
_MAX_IMAGE_BYTES = 15 * 1024 * 1024  # match the upload ceiling


def is_pinterest_url(url: str) -> bool:
    """True only for pinterest.* / pin.it hosts (keeps the fetcher off arbitrary URLs)."""
    host = (urlparse(url).hostname or "").lower()
    return bool(_PIN_HOST_RE.search(host))


def parse_og_image(html: str) -> str | None:
    """The pin's preview image URL from its og:image / twitter:image meta, else None."""
    m = _OG_IMAGE_RE.search(html)
    return m.group(1) if m else None


class PinResolver:
    """Resolve a pin URL to (image_bytes, content_type, resolved_image_url)."""

    async def fetch(self, url: str) -> tuple[bytes, str, str]:  # pragma: no cover - interface
        raise NotImplementedError


class HttpPinResolver(PinResolver):
    def __init__(self, transport: httpx.BaseTransport | None = None):
        # transport is injected in tests (httpx.MockTransport); None = real network.
        self._transport = transport

    async def fetch(self, url: str) -> tuple[bytes, str, str]:
        if not is_pinterest_url(url):
            raise AppError(422, "pinterest_unresolved", "Paste a Pinterest pin link.")
        async with httpx.AsyncClient(
            timeout=_FETCH_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; NeevBot/1.0)"},
            transport=self._transport,
        ) as hc:
            # Page: pinterest host only; allow Pinterest's own redirects (pin.it ->
            # pinterest.com) but require the landing URL to STAY on Pinterest.
            page = await hc.get(url, follow_redirects=True)
            page.raise_for_status()
            if not is_pinterest_url(str(page.url)):
                raise AppError(
                    422, "pinterest_unresolved", "That link didn't stay on Pinterest."
                )
            image_url = parse_og_image(page.text)
            if not image_url:
                raise AppError(
                    422, "pinterest_unresolved", "Couldn't find an image on that pin."
                )
            # SSRF: the scraped og:image is attacker-influenceable — guard it against
            # private/loopback/link-local/metadata hosts BEFORE fetching, and do not
            # follow redirects on the image request (a 3xx would be rejected below).
            assert_safe_media_url(image_url)
            img = await hc.get(image_url, follow_redirects=False)
            img.raise_for_status()
            content_type = img.headers.get("content-type", "image/jpeg")
            if not content_type.startswith("image/"):
                raise AppError(
                    422, "pinterest_unresolved", "That link didn't resolve to an image."
                )
            data = img.content
            if not data or len(data) > _MAX_IMAGE_BYTES:
                raise AppError(422, "pinterest_unresolved", "That image is empty or too large.")
            return data, content_type, image_url


def get_pin_resolver() -> PinResolver:
    """Injectable resolver (overridden in tests with a network-free fake)."""
    return HttpPinResolver()
