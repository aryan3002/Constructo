"""CP-T1: Company.logo_key + logo_url on CompanyOut.

Tests that:
  - GET /api/v1/auth/company returns logo_url: null when logo_key is unset.
  - PATCH /api/v1/auth/company with logo_key resolves logo_url via storage.
  - PATCH with logo_key: null clears it (logo_url back to null).
"""
import pytest
import pytest_asyncio

from app.auth.jwt import create_access_token
from app.models import UserRole
from app.storage import get_storage


def auth(user) -> dict[str, str]:
    token = create_access_token(str(user.id), user.role.value)
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def logo_ctx(factory):
    """A single owner + company for logo tests."""
    company = await factory.company(name="Logo Test Co")
    owner = await factory.user(company=company, role=UserRole.owner)
    return {"company": company, "owner": owner}


@pytest.mark.asyncio
async def test_company_out_includes_logo_url(client, logo_ctx, monkeypatch):
    owner = logo_ctx["owner"]
    owner_headers = auth(owner)

    # Storage resolves a bare key to a presigned GET URL.
    monkeypatch.setattr(
        type(get_storage()),
        "url_for",
        lambda self, ref: f"https://r2.example/{ref}" if ref else None,
    )

    # Unset → logo_url is null
    r = await client.get("/api/v1/auth/company", headers=owner_headers)
    assert r.status_code == 200
    assert r.json()["logo_url"] is None

    # Set the key via PATCH → logo_url resolves (key must be under THIS company)
    key = f"branding/{owner.company_id}/logo-abc.png"
    r = await client.patch(
        "/api/v1/auth/company",
        headers=owner_headers,
        json={"logo_key": key},
    )
    assert r.status_code == 200
    assert r.json()["logo_url"] == f"https://r2.example/{key}"

    # Clear it
    r = await client.patch(
        "/api/v1/auth/company",
        headers=owner_headers,
        json={"logo_key": None},
    )
    assert r.json()["logo_url"] is None


# ---------------------------------------------------------------------------
# CP-T2: presign endpoint
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def presign_ctx(factory):
    """Owner + supervisor in the same company for presign tests."""
    company = await factory.company(name="Presign Test Co")
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    return {"company": company, "owner": owner, "supervisor": supervisor}


@pytest.mark.asyncio
async def test_logo_presign_owner_ok(client, presign_ctx, monkeypatch):
    owner = presign_ctx["owner"]
    owner_headers = auth(owner)
    monkeypatch.setattr(
        type(get_storage()),
        "presigned_put",
        lambda self, key, ct: {
            "key": key,
            "url": f"https://put/{key}",
            "method": "PUT",
            "headers": {},
            "expires_in": 600,
        },
    )
    r = await client.post(
        "/api/v1/auth/company/logo/presign",
        headers=owner_headers,
        json={"content_type": "image/png"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["upload_mode"] == "presigned"
    assert body["key"].startswith("branding/") and body["key"].endswith(".png")
    assert body["put_url"].startswith("https://put/")


@pytest.mark.asyncio
async def test_logo_presign_rejects_bad_type(client, presign_ctx):
    owner = presign_ctx["owner"]
    owner_headers = auth(owner)
    r = await client.post(
        "/api/v1/auth/company/logo/presign",
        headers=owner_headers,
        json={"content_type": "image/gif"},
    )
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_logo_presign_unavailable_on_local(client, presign_ctx, monkeypatch):
    owner = presign_ctx["owner"]
    owner_headers = auth(owner)

    def _raise(self, key, ct):
        raise NotImplementedError

    monkeypatch.setattr(type(get_storage()), "presigned_put", _raise)
    r = await client.post(
        "/api/v1/auth/company/logo/presign",
        headers=owner_headers,
        json={"content_type": "image/jpeg"},
    )
    assert r.json()["upload_mode"] == "unavailable"
    assert r.json()["put_url"] is None


@pytest.mark.asyncio
async def test_logo_presign_non_owner_forbidden(client, presign_ctx):
    supervisor = presign_ctx["supervisor"]
    member_headers = auth(supervisor)
    r = await client.post(
        "/api/v1/auth/company/logo/presign",
        headers=member_headers,
        json={"content_type": "image/png"},
    )
    assert r.status_code in (401, 403)


@pytest.mark.asyncio
async def test_logo_key_must_be_own_company(client, logo_ctx, factory):
    """Tenant isolation: an owner can only set a logo_key under their own
    company's branding path — not another tenant's."""
    owner = logo_ctx["owner"]
    owner_headers = auth(owner)
    other = await factory.company(name="Other Co")
    # A key under another company's path is rejected.
    r = await client.patch(
        "/api/v1/auth/company",
        headers=owner_headers,
        json={"logo_key": f"branding/{other.id}/logo-evil.png"},
    )
    assert r.status_code == 422
    # A key under the caller's own company path is accepted.
    r = await client.patch(
        "/api/v1/auth/company",
        headers=owner_headers,
        json={"logo_key": f"branding/{owner.company_id}/logo-ok.png"},
    )
    assert r.status_code == 200
