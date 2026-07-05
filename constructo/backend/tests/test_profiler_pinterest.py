"""Design Profiler — Pinterest paste-a-link: og:image parse, host guard, SSRF
guard, and the from-link endpoint that re-hosts the pin image into our R2."""
import httpx
import pytest

from app.auth.jwt import create_access_token
from app.common.errors import AppError
from app.main import app
from app.models import UserRole
from app.profiler.pinterest import (
    HttpPinResolver,
    get_pin_resolver,
    is_pinterest_url,
    parse_og_image,
)
from app.storage import get_storage


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


# --- unit: pure parsing/guarding (no network) -------------------------------


def test_parse_og_image_extracts_url():
    html = (
        '<html><head>'
        '<meta property="og:title" content="A kitchen"/>'
        '<meta property="og:image" content="https://i.pinimg.com/originals/ab/cd.jpg"/>'
        '</head></html>'
    )
    assert parse_og_image(html) == "https://i.pinimg.com/originals/ab/cd.jpg"


def test_parse_og_image_none_when_absent():
    assert parse_og_image("<html><head></head></html>") is None


def test_parse_og_image_matches_real_pinterest_attribute_order():
    """Real Pinterest pin pages emit `content` BEFORE `name`/`property` (plus an
    extra `data-app` attribute in between) — the opposite of the fixture above.
    Every real pin page was silently failing to match before this test."""
    html = (
        '<html><head>'
        '<meta content="A kitchen" data-app="true" name="og:title" property="og:title"/>'
        '<meta content="https://i.pinimg.com/736x/a7/66/56/abc123.jpg" data-app="true" '
        'name="og:image" property="og:image"/>'
        '</head></html>'
    )
    assert parse_og_image(html) == "https://i.pinimg.com/736x/a7/66/56/abc123.jpg"


def test_is_pinterest_url_accepts_pin_hosts():
    assert is_pinterest_url("https://www.pinterest.com/pin/12345/")
    assert is_pinterest_url("https://pin.it/abc123")
    assert is_pinterest_url("https://in.pinterest.com/pin/9/")


def test_is_pinterest_url_rejects_others():
    assert not is_pinterest_url("https://example.com/x.jpg")
    assert not is_pinterest_url("https://notpinterest.evil.com/")


# --- SSRF: the scraped og:image URL is guarded before fetch -----------------


def _mock_resolver(og_image_url: str) -> HttpPinResolver:
    """A resolver whose network is a MockTransport: pin.it redirects to a real
    pin page (mirrors live Pinterest's pin.it -> pinterest.com/pin/<id>/ hop —
    see test_resolver_gives_actionable_error_when_shortlink_has_no_real_pin for
    what happens when that hop DOESN'T land on a /pin/ path), the pin page
    returns an og:image of ``og_image_url``, and everything else returns image
    bytes."""

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "pin.it" in url:
            return httpx.Response(302, headers={"location": "https://www.pinterest.com/pin/1/"})
        if "pinterest.com/pin/" in url:
            return httpx.Response(
                200,
                headers={"content-type": "text/html"},
                text=f'<meta property="og:image" content="{og_image_url}"/>',
            )
        return httpx.Response(
            200, headers={"content-type": "image/jpeg"}, content=b"\xff\xd8\xff IMG"
        )

    return HttpPinResolver(transport=httpx.MockTransport(handler))


async def test_resolver_blocks_internal_og_image_ssrf():
    # A pin whose og:image points at the cloud-metadata endpoint must be rejected
    # BEFORE the server fetches it (SSRF).
    resolver = _mock_resolver("http://169.254.169.254/latest/meta-data/")
    with pytest.raises(AppError) as ei:
        await resolver.fetch("https://pin.it/evil")
    assert ei.value.code in ("blocked_media_url", "pinterest_unresolved")


async def test_resolver_fetches_safe_public_image():
    # A public image URL (literal public IP, no DNS needed) resolves to bytes.
    resolver = _mock_resolver("http://93.184.216.34/pin.jpg")
    data, content_type, resolved = await resolver.fetch("https://pin.it/ok")
    assert data and content_type.startswith("image/")
    assert resolved == "http://93.184.216.34/pin.jpg"


async def test_resolver_refuses_redirect_off_pinterest_without_fetching_internal():
    # A pin that 302-redirects to the metadata endpoint must be refused BEFORE the
    # internal host is ever requested (no blind SSRF).
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if "169.254" in str(request.url):
            return httpx.Response(200, content=b"SECRET")
        return httpx.Response(302, headers={"location": "http://169.254.169.254/latest/"})

    resolver = HttpPinResolver(transport=httpx.MockTransport(handler))
    with pytest.raises(AppError) as ei:
        await resolver.fetch("https://pin.it/redir")
    assert ei.value.code == "pinterest_unresolved"
    assert not any("169.254" in u for u in requested)  # internal host never hit


async def test_resolver_follows_redirect_that_stays_on_pinterest():
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == "https://pin.it/go":
            return httpx.Response(302, headers={"location": "https://www.pinterest.com/pin/1/"})
        if "pinterest.com" in url:
            return httpx.Response(
                200,
                headers={"content-type": "text/html"},
                text='<meta property="og:image" content="http://93.184.216.34/p.jpg"/>',
            )
        return httpx.Response(200, headers={"content-type": "image/jpeg"}, content=b"\xff\xd8\xff")

    resolver = HttpPinResolver(transport=httpx.MockTransport(handler))
    data, content_type, resolved = await resolver.fetch("https://pin.it/go")
    assert data and resolved == "http://93.184.216.34/p.jpg"


async def test_resolver_gives_actionable_error_when_shortlink_has_no_real_pin():
    """A pin.it code that no longer maps to a real pin (deleted, made private, or
    mistyped) is redirected by Pinterest's OWN servers to the bare homepage —
    not a 404. Confirmed live: pin.it/<stale-code> -> api.pinterest.com/url_
    shortener/.../redirect/ -> https://www.pinterest.com (no /pin/ path at all).
    The homeowner needs an actionable message here, not the generic "couldn't
    find an image" (which reads like a resolver bug, not a stale link)."""
    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == "https://pin.it/dead":
            return httpx.Response(302, headers={"location": "https://www.pinterest.com"})
        return httpx.Response(200, headers={"content-type": "text/html"}, text="<html></html>")

    resolver = HttpPinResolver(transport=httpx.MockTransport(handler))
    with pytest.raises(AppError) as ei:
        await resolver.fetch("https://pin.it/dead")
    assert ei.value.code == "pinterest_unresolved"
    assert "fresh link" in ei.value.message.lower()


# --- e2e: the from-link endpoint --------------------------------------------


class _FakeResolver:
    def __init__(self, *, exc: Exception | None = None):
        self._exc = exc

    async def fetch(self, url: str):
        if self._exc is not None:
            raise self._exc
        return (b"\xff\xd8\xff fake-jpeg", "image/jpeg", "https://i.pinimg.com/x.jpg")


async def _profile_with_area(client, factory):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    created = await client.post(
        "/api/v1/design/profiles",
        json={
            "site_id": str(site.id),
            "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 6}],
            "contributors": [
                {"role": "co_owner", "is_decision_owner": True, "user_id": str(architect.id)}
            ],
        },
        headers=auth(architect),
    )
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    return architect, site, pid, detail["areas"][0]["id"], detail["my_contributor_id"]


async def test_reference_from_link_rehosts_and_creates(client, factory):
    app.dependency_overrides[get_pin_resolver] = lambda: _FakeResolver()
    try:
        architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
        resp = await client.post(
            "/api/v1/design/references/from-link",
            json={
                "area_id": area_id,
                "contributor_id": contributor_id,
                "url": "https://pin.it/abc123",
            },
            headers=auth(architect),
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["source_type"] == "pinterest_link"
        assert body["source_url"] == "https://pin.it/abc123"
        assert body["image_r2_key"] and body["image_r2_key"].startswith(f"design/{site.id}/")
        assert body["image_url"] == get_storage().url_for(body["image_r2_key"])
    finally:
        app.dependency_overrides.pop(get_pin_resolver, None)


async def test_reference_from_link_unresolved_is_422(client, factory):
    app.dependency_overrides[get_pin_resolver] = lambda: _FakeResolver(
        exc=RuntimeError("network boom")
    )
    try:
        architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
        resp = await client.post(
            "/api/v1/design/references/from-link",
            json={"area_id": area_id, "contributor_id": contributor_id, "url": "https://pin.it/x"},
            headers=auth(architect),
        )
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "pinterest_unresolved"
    finally:
        app.dependency_overrides.pop(get_pin_resolver, None)


async def test_reference_from_link_cross_company_stranger_404(client, factory):
    """A user from another company cannot add to a profile they can't access."""
    app.dependency_overrides[get_pin_resolver] = lambda: _FakeResolver()
    try:
        _architect, _site, _pid, area_id, _contributor_id = await _profile_with_area(
            client, factory
        )
        stranger = await factory.user(role=UserRole.architect)  # different company
        resp = await client.post(
            "/api/v1/design/references/from-link",
            json={"area_id": area_id, "url": "https://pin.it/x"},
            headers=auth(stranger),
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_pin_resolver, None)


async def test_reference_from_link_propagates_app_error(client, factory):
    app.dependency_overrides[get_pin_resolver] = lambda: _FakeResolver(
        exc=AppError(422, "pinterest_unresolved", "Paste a Pinterest pin link.")
    )
    try:
        architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
        resp = await client.post(
            "/api/v1/design/references/from-link",
            json={"area_id": area_id, "contributor_id": contributor_id, "url": "https://x.com/y"},
            headers=auth(architect),
        )
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "pinterest_unresolved"
    finally:
        app.dependency_overrides.pop(get_pin_resolver, None)
