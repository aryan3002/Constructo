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
_META_TAG_RE = re.compile(r"<meta\b[^>]*>", re.I)
_OG_IMAGE_PROP_RE = re.compile(r'(?:property|name)=["\']og:image(?::secure_url)?["\']', re.I)
_TWITTER_IMAGE_PROP_RE = re.compile(r'(?:property|name)=["\']twitter:image["\']', re.I)
_CONTENT_ATTR_RE = re.compile(r'content=["\']([^"\']+)["\']', re.I)
_FETCH_TIMEOUT = 10.0
_MAX_IMAGE_BYTES = 15 * 1024 * 1024  # match the upload ceiling
_MAX_PAGE_REDIRECTS = 3


def is_pinterest_url(url: str) -> bool:
    """True only for pinterest.* / pin.it hosts (keeps the fetcher off arbitrary URLs)."""
    host = (urlparse(url).hostname or "").lower()
    return bool(_PIN_HOST_RE.search(host))


def parse_og_image(html: str) -> str | None:
    """The pin's preview image URL from its og:image / twitter:image meta, else None.

    Checked per-tag rather than with one order-sensitive regex: real Pinterest
    pages emit `content` BEFORE `name`/`property` (e.g. `<meta content="..."
    data-app="true" name="og:image" property="og:image"/>`) — the opposite of
    the usual og:-tag convention — so attribute order cannot be assumed.
    """
    twitter_fallback: str | None = None
    for tag in _META_TAG_RE.findall(html):
        content_match = _CONTENT_ATTR_RE.search(tag)
        if not content_match:
            continue
        if _OG_IMAGE_PROP_RE.search(tag):
            return content_match.group(1)
        if twitter_fallback is None and _TWITTER_IMAGE_PROP_RE.search(tag):
            twitter_fallback = content_match.group(1)
    return twitter_fallback


class PinResolver:
    """Resolve a pin URL to (image_bytes, content_type, resolved_image_url)."""

    async def fetch(self, url: str) -> tuple[bytes, str, str]:  # pragma: no cover - interface
        raise NotImplementedError


class HttpPinResolver(PinResolver):
    def __init__(self, transport: httpx.BaseTransport | None = None):
        # transport is injected in tests (httpx.MockTransport); None = real network.
        self._transport = transport

    async def _get_pinterest_page(
        self, hc: httpx.AsyncClient, url: str
    ) -> httpx.Response:
        """GET ``url`` resolving redirects one hop at a time, refusing to follow any
        Location that leaves Pinterest — so the request never reaches an internal
        host. ``url`` is already host-checked by the caller."""
        current = url
        for _ in range(_MAX_PAGE_REDIRECTS):
            resp = await hc.get(current, follow_redirects=False)
            if resp.is_redirect:
                location = resp.headers.get("location")
                if not location:
                    raise AppError(422, "pinterest_unresolved", "Bad redirect from Pinterest.")
                current = str(resp.url.join(location))
                if not is_pinterest_url(current):
                    raise AppError(
                        422, "pinterest_unresolved", "That link didn't stay on Pinterest."
                    )
                continue
            resp.raise_for_status()
            return resp
        raise AppError(422, "pinterest_unresolved", "Too many Pinterest redirects.")

    async def fetch(self, url: str) -> tuple[bytes, str, str]:
        if not is_pinterest_url(url):
            raise AppError(422, "pinterest_unresolved", "Paste a Pinterest pin link.")
        async with httpx.AsyncClient(
            timeout=_FETCH_TIMEOUT,
            headers={"User-Agent": "Mozilla/5.0 (compatible; NeevBot/1.0)"},
            transport=self._transport,
        ) as hc:
            # Resolve Pinterest's own redirects (pin.it -> pinterest.com) MANUALLY so
            # every hop is host-checked BEFORE it is fetched — a redirect can never
            # pivot the request to an internal/non-Pinterest host (SSRF). Mirrors the
            # follow_redirects=False discipline in app/extraction/pdf_read.py.
            page = await self._get_pinterest_page(hc, url)
            # A pin.it code that no longer maps to a real pin (deleted, made
            # private, or mistyped) is redirected by Pinterest's OWN servers to
            # the bare homepage rather than a 404 — that lands here as a
            # same-host, non-redirect 200 with no /pin/ path. Give an
            # actionable message instead of the generic "couldn't find an
            # image", which reads like our resolver is broken rather than the
            # link being stale.
            if "/pin/" not in urlparse(str(page.url)).path:
                raise AppError(
                    422,
                    "pinterest_unresolved",
                    "That link didn't lead to a specific pin — it may have expired or been "
                    "deleted. Copy a fresh link from an open pin and try again.",
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
