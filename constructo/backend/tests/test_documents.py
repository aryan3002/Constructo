"""S2b-E1: CompanyDocument CRUD + presign tests.

Scenarios:
  - owner POST a doc → 201
  - GET /api/v1/documents lists it
  - a different-company user sees none
  - GET resolves file_url (mock get_storage().url_for → https://signed/...)
  - PATCH updates expiry_on + notes
  - PATCH is_active=false archives; excluded from GET unless ?include_archived=true
  - supervisor role POST → 201 (part of the company-registers group)
  - accountant role POST → 403 (outside the group)
  - POST /api/v1/documents/presign in-scope → {key, put_url, mode}
  - presigned_put raises NotImplementedError → mode:"unavailable", 200
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import UserRole

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
async def doc_ctx(factory, db_session):
    """Two-company world for document tests."""
    company_a = await factory.company(name="BuildersA")
    owner_a = await factory.user(company=company_a, role=UserRole.owner)
    sup_a = await factory.user(company=company_a, role=UserRole.supervisor)
    acc_a = await factory.user(company=company_a, role=UserRole.accountant)
    site_a = await factory.site(company_a, name="Site Alpha")

    company_b = await factory.company(name="BuildersB")
    owner_b = await factory.user(company=company_b, role=UserRole.owner)

    await db_session.commit()

    return SimpleNamespace(
        company_a=company_a,
        owner_a=owner_a,
        sup_a=sup_a,
        acc_a=acc_a,
        site_a=site_a,
        company_b=company_b,
        owner_b=owner_b,
    )


# ---------------------------------------------------------------------------
# CRUD tests
# ---------------------------------------------------------------------------


async def test_owner_creates_document(client, doc_ctx):
    """owner POST → 201 with correct fields."""
    resp = await client.post(
        "/api/v1/documents",
        json={
            "doc_type": "contract",
            "title": "Main Contract",
            "file_url": "documents/abc/main_contract.pdf",
            "expiry_on": "2027-01-31",
            "notes": "Signed copy",
        },
        headers=auth(doc_ctx.owner_a),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "Main Contract"
    assert body["doc_type"] == "contract"
    assert body["expiry_on"] == "2027-01-31"
    assert body["is_active"] is True
    assert body["company_id"] == str(doc_ctx.company_a.id)


async def test_list_documents_returns_own_company(client, doc_ctx):
    """GET /api/v1/documents lists docs for the caller's company."""
    with patch("app.documents.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        await client.post(
            "/api/v1/documents",
            json={
                "doc_type": "noc",
                "title": "NOC Certificate",
                "file_url": "documents/abc/noc.pdf",
            },
            headers=auth(doc_ctx.owner_a),
        )

        resp = await client.get("/api/v1/documents", headers=auth(doc_ctx.owner_a))

    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 1
    assert items[0]["title"] == "NOC Certificate"


async def test_different_company_sees_nothing(client, doc_ctx):
    """owner_b cannot see owner_a's documents."""
    with patch("app.documents.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        await client.post(
            "/api/v1/documents",
            json={
                "doc_type": "license",
                "title": "Trade License",
                "file_url": "documents/abc/license.pdf",
            },
            headers=auth(doc_ctx.owner_a),
        )

        resp = await client.get("/api/v1/documents", headers=auth(doc_ctx.owner_b))

    assert resp.status_code == 200, resp.text
    assert resp.json() == []


async def test_get_resolves_file_url(client, doc_ctx):
    """GET list resolves bare R2 key to a presigned URL."""
    with patch("app.documents.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        await client.post(
            "/api/v1/documents",
            json={
                "doc_type": "boq",
                "title": "BOQ Sheet",
                "file_url": "documents/abc/boq.xlsx",
            },
            headers=auth(doc_ctx.owner_a),
        )

        resp = await client.get("/api/v1/documents", headers=auth(doc_ctx.owner_a))

    assert resp.status_code == 200, resp.text
    items = resp.json()
    assert len(items) == 1
    assert items[0]["file_url"].startswith("https://signed/"), items[0]["file_url"]


async def test_patch_updates_expiry_and_notes(client, doc_ctx):
    """PATCH updates expiry_on and notes."""
    created = await client.post(
        "/api/v1/documents",
        json={
            "doc_type": "insurance",
            "title": "Insurance Policy",
            "file_url": "documents/abc/insurance.pdf",
        },
        headers=auth(doc_ctx.owner_a),
    )
    assert created.status_code == 201, created.text
    doc_id = created.json()["id"]

    resp = await client.patch(
        f"/api/v1/documents/{doc_id}",
        json={"expiry_on": "2028-06-30", "notes": "Renewed policy"},
        headers=auth(doc_ctx.owner_a),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["expiry_on"] == "2028-06-30"
    assert body["notes"] == "Renewed policy"


async def test_archive_hides_from_default_list(client, doc_ctx):
    """PATCH is_active=false → excluded from GET; visible with ?include_archived=true."""
    with patch("app.documents.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.url_for.side_effect = lambda key: f"https://signed/{key}"
        mock_gs.return_value = mock_storage

        created = await client.post(
            "/api/v1/documents",
            json={
                "doc_type": "other",
                "title": "Old Contract",
                "file_url": "documents/abc/old.pdf",
            },
            headers=auth(doc_ctx.owner_a),
        )
        doc_id = created.json()["id"]

        await client.patch(
            f"/api/v1/documents/{doc_id}",
            json={"is_active": False},
            headers=auth(doc_ctx.owner_a),
        )

        default = await client.get("/api/v1/documents", headers=auth(doc_ctx.owner_a))
        assert default.status_code == 200
        assert default.json() == []

        archived = await client.get(
            "/api/v1/documents?include_archived=true", headers=auth(doc_ctx.owner_a)
        )
        assert archived.status_code == 200
        rows = archived.json()
        assert len(rows) == 1
        assert rows[0]["is_active"] is False


async def test_supervisor_can_create_document(client, doc_ctx):
    """supervisor role → 201 on POST (part of the company-registers group)."""
    resp = await client.post(
        "/api/v1/documents",
        json={
            "doc_type": "contract",
            "title": "Site Engineer Upload",
            "file_url": "documents/abc/site-eng.pdf",
        },
        headers=auth(doc_ctx.sup_a),
    )
    assert resp.status_code == 201, resp.text


async def test_accountant_cannot_create_document(client, doc_ctx):
    """accountant role → 403 on POST (outside the company-registers group)."""
    resp = await client.post(
        "/api/v1/documents",
        json={
            "doc_type": "contract",
            "title": "Should Fail",
            "file_url": "documents/abc/fail.pdf",
        },
        headers=auth(doc_ctx.acc_a),
    )
    assert resp.status_code == 403, resp.text


# ---------------------------------------------------------------------------
# Presign tests
# ---------------------------------------------------------------------------


async def test_presign_in_scope_returns_ticket(client, doc_ctx):
    """POST /api/v1/documents/presign → 200 with mode=presigned."""
    from app.storage.base import PresignedUpload

    fake_ticket: PresignedUpload = {
        "key": "documents/abc/foo.pdf",
        "url": "https://r2.example.com/presigned-doc",
        "method": "PUT",
        "headers": {},
        "expires_in": 300,
    }

    with patch("app.documents.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.presigned_put.return_value = fake_ticket
        mock_gs.return_value = mock_storage

        resp = await client.post(
            "/api/v1/documents/presign",
            json={
                "filename": "contract.pdf",
                "content_type": "application/pdf",
            },
            headers=auth(doc_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "presigned"
    assert body["put_url"] == "https://r2.example.com/presigned-doc"
    assert "key" in body
    assert body["key"].endswith(".pdf")
    assert body["key"].startswith("documents/")


async def test_presign_local_storage_returns_unavailable(client, doc_ctx):
    """When presigned_put raises NotImplementedError → mode='unavailable', 200."""
    with patch("app.documents.router.get_storage") as mock_gs:
        mock_storage = MagicMock()
        mock_storage.presigned_put.side_effect = NotImplementedError("local has no presign")
        mock_gs.return_value = mock_storage

        resp = await client.post(
            "/api/v1/documents/presign",
            json={
                "filename": "noc.pdf",
                "content_type": "application/pdf",
            },
            headers=auth(doc_ctx.owner_a),
        )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "unavailable"
    assert body["put_url"] is None
    assert "key" in body
