"""S2a-E1: Drawings Register endpoint tests (Task 1 — register list).

  - owner with drawings on TWO sites → GET /api/v1/publish/drawings/register returns rows from both.
  - a drawing with a superseding revision → is_current flag computed correctly.
  - user from another company → does NOT see these drawings.
  - file_url is a resolved URL (not a bare key), mocking storage.url_for.
  - site_name is populated from the real Site.name.
  - optional site_id filter + 403 for out-of-scope site.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import PublishedDrawing, UserRole
from app.models.homeowner_drawings import DrawingKind

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def reg_ctx(factory, db_session):
    """Two-site world for register tests.

    company_a / owner_a → site_a, site_b (both visible as owner)
    company_b / owner_b → site_c (different company, must NOT leak)
    """
    company_a = await factory.company(name="Builders A")
    owner_a = await factory.user(company=company_a, role=UserRole.owner)
    site_a = await factory.site(company_a, name="Site Alpha")
    site_b = await factory.site(company_a, name="Site Beta")

    company_b = await factory.company(name="Builders B")
    owner_b = await factory.user(company=company_b, role=UserRole.owner)
    site_c = await factory.site(company_b, name="Site Gamma")

    # drawing on site_a — v1 (old revision, will be superseded)
    d_a1 = PublishedDrawing(
        site_id=site_a.id,
        title="Foundation Plan",
        version="v1",
        file_url="drawings/site_a/foundation_v1.pdf",
        kind=DrawingKind.plan,
        published_by=owner_a.id,
    )
    db_session.add(d_a1)
    await db_session.flush()

    # drawing on site_a — v2 supersedes d_a1
    d_a2 = PublishedDrawing(
        site_id=site_a.id,
        title="Foundation Plan",
        version="v2",
        file_url="drawings/site_a/foundation_v2.pdf",
        kind=DrawingKind.plan,
        published_by=owner_a.id,
        supersedes_id=d_a1.id,
    )
    db_session.add(d_a2)

    # drawing on site_b — standalone (current by definition)
    d_b = PublishedDrawing(
        site_id=site_b.id,
        title="Elevation East",
        version="v1",
        file_url="drawings/site_b/elevation.pdf",
        kind=DrawingKind.elevation,
        published_by=owner_a.id,
    )
    db_session.add(d_b)

    # drawing on site_c — other company, must NOT appear for owner_a
    d_c = PublishedDrawing(
        site_id=site_c.id,
        title="Secret Plan",
        version="v1",
        file_url="drawings/site_c/secret.pdf",
        kind=DrawingKind.plan,
        published_by=owner_b.id,
    )
    db_session.add(d_c)

    await db_session.flush()
    return SimpleNamespace(
        company_a=company_a,
        owner_a=owner_a,
        site_a=site_a,
        site_b=site_b,
        d_a1=d_a1,
        d_a2=d_a2,
        d_b=d_b,
        owner_b=owner_b,
        site_c=site_c,
        d_c=d_c,
    )


# ---------------------------------------------------------------------------
# Task 1: register list
# ---------------------------------------------------------------------------


async def test_register_returns_drawings_from_all_visible_sites(client, reg_ctx):
    """owner_a sees drawings from BOTH site_a and site_b (3 rows total)."""
    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        resp = await client.get(
            "/api/v1/publish/drawings/register",
            headers=auth(reg_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    items = resp.json()
    ids = {i["id"] for i in items}
    assert str(reg_ctx.d_a1.id) in ids
    assert str(reg_ctx.d_a2.id) in ids
    assert str(reg_ctx.d_b.id) in ids
    # other company's drawing must NOT appear
    assert str(reg_ctx.d_c.id) not in ids


async def test_register_is_current_flag(client, reg_ctx):
    """d_a1 is superseded → is_current=False; d_a2 (supersedes d_a1) → is_current=True."""
    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        resp = await client.get(
            "/api/v1/publish/drawings/register",
            headers=auth(reg_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    by_id = {i["id"]: i for i in resp.json()}

    assert by_id[str(reg_ctx.d_a1.id)]["is_current"] is False
    assert by_id[str(reg_ctx.d_a2.id)]["is_current"] is True
    assert by_id[str(reg_ctx.d_b.id)]["is_current"] is True


async def test_register_other_company_sees_nothing(client, reg_ctx):
    """owner_b's register should only contain site_c drawings, not site_a/site_b."""
    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        resp = await client.get(
            "/api/v1/publish/drawings/register",
            headers=auth(reg_ctx.owner_b),
        )

    assert resp.status_code == 200, resp.text
    ids = {i["id"] for i in resp.json()}
    assert str(reg_ctx.d_c.id) in ids
    assert str(reg_ctx.d_a1.id) not in ids
    assert str(reg_ctx.d_a2.id) not in ids
    assert str(reg_ctx.d_b.id) not in ids


async def test_register_file_url_is_resolved(client, reg_ctx):
    """Each returned row's file_url must be the resolved URL, not the bare key."""
    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        resp = await client.get(
            "/api/v1/publish/drawings/register",
            headers=auth(reg_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    for item in resp.json():
        assert item["file_url"].startswith("https://signed/"), (
            f"Expected resolved URL, got: {item['file_url']}"
        )


async def test_register_site_name_included(client, reg_ctx):
    """Each returned row must include site_name matching the real Site.name."""
    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        resp = await client.get(
            "/api/v1/publish/drawings/register",
            headers=auth(reg_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    by_id = {i["id"]: i for i in resp.json()}

    # site_a drawings should carry "Site Alpha"
    assert by_id[str(reg_ctx.d_a1.id)]["site_name"] == "Site Alpha"
    assert by_id[str(reg_ctx.d_a2.id)]["site_name"] == "Site Alpha"
    # site_b drawing should carry "Site Beta"
    assert by_id[str(reg_ctx.d_b.id)]["site_name"] == "Site Beta"


async def test_register_filtered_by_site_id(client, reg_ctx):
    """When site_id query param supplied → only that site's drawings returned."""
    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        resp = await client.get(
            f"/api/v1/publish/drawings/register?site_id={reg_ctx.site_b.id}",
            headers=auth(reg_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    ids = {i["id"] for i in resp.json()}
    assert str(reg_ctx.d_b.id) in ids
    assert str(reg_ctx.d_a1.id) not in ids
    assert str(reg_ctx.d_a2.id) not in ids


async def test_register_site_id_out_of_scope_is_403(client, reg_ctx):
    """owner_a requesting site_c (other company) → 403."""
    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        resp = await client.get(
            f"/api/v1/publish/drawings/register?site_id={reg_ctx.site_c.id}",
            headers=auth(reg_ctx.owner_a),
        )

    assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Task 2: presign endpoint
# ---------------------------------------------------------------------------


async def test_presign_in_scope_returns_ticket(client, reg_ctx):
    """In-scope site + S3 storage → 200 with presigned ticket."""
    from app.storage.base import PresignedUpload

    fake_ticket: PresignedUpload = {
        "key": "drawings/abc/foo.pdf",
        "url": "https://r2.example.com/presigned",
        "method": "PUT",
        "headers": {},
        "expires_in": 300,
    }

    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.presigned_put.return_value = fake_ticket
        mock_gs.return_value = mock_storage

        resp = await client.post(
            "/api/v1/publish/drawings/presign",
            json={
                "site_id": str(reg_ctx.site_a.id),
                "filename": "foundation.pdf",
                "content_type": "application/pdf",
            },
            headers=auth(reg_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "presigned"
    assert body["put_url"] == "https://r2.example.com/presigned"
    assert body["key"].endswith(".pdf")
    assert body["key"].startswith("drawings/")


async def test_presign_out_of_scope_returns_403(client, reg_ctx):
    """owner_a requesting a presign on site_c (other company) → 403 or 404."""
    resp = await client.post(
        "/api/v1/publish/drawings/presign",
        json={
            "site_id": str(reg_ctx.site_c.id),
            "filename": "secret.pdf",
            "content_type": "application/pdf",
        },
        headers=auth(reg_ctx.owner_a),
    )
    assert resp.status_code in (403, 404), resp.text


async def test_presign_local_storage_returns_unavailable(client, reg_ctx):
    """When presigned_put raises NotImplementedError → mode='unavailable', status 200."""
    with patch("app.publish.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.presigned_put.side_effect = NotImplementedError("local has no presign")
        mock_gs.return_value = mock_storage

        resp = await client.post(
            "/api/v1/publish/drawings/presign",
            json={
                "site_id": str(reg_ctx.site_a.id),
                "filename": "plan.pdf",
                "content_type": "application/pdf",
            },
            headers=auth(reg_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "unavailable"
    assert body["put_url"] is None
    assert "key" in body
