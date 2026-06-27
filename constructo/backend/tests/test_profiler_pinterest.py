"""Design Profiler — Pinterest paste-a-link: og:image parse, host guard, and the
from-link endpoint that re-hosts the pin image into our R2 + creates a reference."""
from app.auth.jwt import create_access_token
from app.common.errors import AppError
from app.main import app
from app.models import UserRole
from app.profiler.pinterest import get_pin_resolver, is_pinterest_url, parse_og_image
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


def test_is_pinterest_url_accepts_pin_hosts():
    assert is_pinterest_url("https://www.pinterest.com/pin/12345/")
    assert is_pinterest_url("https://pin.it/abc123")
    assert is_pinterest_url("https://in.pinterest.com/pin/9/")


def test_is_pinterest_url_rejects_others():
    assert not is_pinterest_url("https://example.com/x.jpg")
    assert not is_pinterest_url("https://notpinterest.evil.com/")


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
