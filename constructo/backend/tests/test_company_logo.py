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

    # Set the key via PATCH → logo_url resolves
    r = await client.patch(
        "/api/v1/auth/company",
        headers=owner_headers,
        json={"logo_key": "branding/x/logo-abc.png"},
    )
    assert r.status_code == 200
    assert r.json()["logo_url"] == "https://r2.example/branding/x/logo-abc.png"

    # Clear it
    r = await client.patch(
        "/api/v1/auth/company",
        headers=owner_headers,
        json={"logo_key": None},
    )
    assert r.json()["logo_url"] is None
