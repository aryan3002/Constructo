"""Vision extraction proposes attributes from an image; a human never sees raw guesses."""
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import UserRole
from app.models.profiler import ProfilerReference, ProfilerReferenceAttributes
from app.profiler.extraction import extract_reference_attributes, get_llm


async def test_extract_passes_image_and_returns_attributes():
    canned = {"style": "minimal", "materials": ["oak"], "colors": ["light"],
              "lighting": "warm", "confidence": 0.9}
    llm = FakeLLMClient(canned=canned)
    out = await extract_reference_attributes(llm, "data:image/jpeg;base64,AAAA")
    assert out["style"] == "minimal"
    assert llm.calls[-1]["image_url"] == "data:image/jpeg;base64,AAAA"


def _auth(user):
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_reference_add_extracts_and_stores_attributes(client, factory):
    canned = {"style": "minimal", "materials": ["oak"], "colors": ["light"], "confidence": 0.8}
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=canned)
    try:
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        created = await client.post(
            "/api/v1/design/profiles",
            json={"site_id": str(site.id),
                  "areas": [{"area_kind": "interior", "area_key": "kitchen"}],
                  "contributors": []},
            headers=_auth(architect),
        )
        pid = created.json()["id"]
        detail = await client.get(f"/api/v1/design/profiles/{pid}", headers=_auth(architect))
        area_id = detail.json()["areas"][0]["id"]

        ref = await client.post(
            "/api/v1/design/references",
            json={"area_id": area_id, "source_type": "upload",
                  "source_url": "https://example.test/pin.jpg"},
            headers=_auth(architect),
        )
        assert ref.status_code == 201
        assert ref.json()["consistency_status"] == "consistent"  # empty taste -> consistent
    finally:
        app.dependency_overrides.pop(get_llm, None)


class _RaisingLLM(FakeLLMClient):
    """Extraction always throws — used to prove failures never fail the request."""

    async def complete_vision(self, system, user, image_url, json_schema):
        raise RuntimeError("vision provider is down")


async def test_reference_add_survives_extraction_failure_and_flags_status(
    client, factory, db_session
):
    app.dependency_overrides[get_llm] = lambda: _RaisingLLM()
    try:
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        created = await client.post(
            "/api/v1/design/profiles",
            json={"site_id": str(site.id),
                  "areas": [{"area_kind": "interior", "area_key": "kitchen"}],
                  "contributors": []},
            headers=_auth(architect),
        )
        pid = created.json()["id"]
        detail = await client.get(f"/api/v1/design/profiles/{pid}", headers=_auth(architect))
        area_id = detail.json()["areas"][0]["id"]

        ref = await client.post(
            "/api/v1/design/references",
            json={"area_id": area_id, "source_type": "upload",
                  "source_url": "https://example.test/pin.jpg"},
            headers=_auth(architect),
        )
        assert ref.status_code == 201
        assert ref.json()["extraction_status"] == "failed"

        row = (
            await db_session.execute(
                select(ProfilerReference).where(ProfilerReference.id == ref.json()["id"])
            )
        ).scalar_one()
        assert row.extraction_status == "failed"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_retry_extraction_replaces_stale_attributes_and_reports_ok(
    client, factory, db_session
):
    canned = {"style": "minimal", "materials": ["oak"], "colors": ["light"], "confidence": 0.8}
    app.dependency_overrides[get_llm] = lambda: _RaisingLLM()
    try:
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        created = await client.post(
            "/api/v1/design/profiles",
            json={"site_id": str(site.id),
                  "areas": [{"area_kind": "interior", "area_key": "kitchen"}],
                  "contributors": []},
            headers=_auth(architect),
        )
        pid = created.json()["id"]
        detail = await client.get(f"/api/v1/design/profiles/{pid}", headers=_auth(architect))
        area_id = detail.json()["areas"][0]["id"]

        ref = await client.post(
            "/api/v1/design/references",
            json={"area_id": area_id, "source_type": "upload",
                  "source_url": "https://example.test/pin.jpg"},
            headers=_auth(architect),
        )
        ref_id = ref.json()["id"]
        assert ref.json()["extraction_status"] == "failed"
    finally:
        app.dependency_overrides.pop(get_llm, None)

    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=canned)
    try:
        retry = await client.post(
            f"/api/v1/design/references/{ref_id}/extract",
            headers=_auth(architect),
        )
        assert retry.status_code == 200
        assert retry.json()["extraction_status"] == "ok"

        rows = (
            await db_session.execute(
                select(ProfilerReferenceAttributes).where(
                    ProfilerReferenceAttributes.reference_id == ref_id
                )
            )
        ).scalars().all()
        assert len(rows) == 1
        assert rows[0].attributes["style"] == "minimal"
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_retry_extraction_cross_company_is_404(client, factory):
    canned = {"style": "minimal", "materials": ["oak"], "colors": ["light"], "confidence": 0.8}
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=canned)
    try:
        company = await factory.company()
        architect = await factory.user(company=company, role=UserRole.architect)
        site = await factory.site(company)
        created = await client.post(
            "/api/v1/design/profiles",
            json={"site_id": str(site.id),
                  "areas": [{"area_kind": "interior", "area_key": "kitchen"}],
                  "contributors": []},
            headers=_auth(architect),
        )
        pid = created.json()["id"]
        detail = await client.get(f"/api/v1/design/profiles/{pid}", headers=_auth(architect))
        area_id = detail.json()["areas"][0]["id"]

        ref = await client.post(
            "/api/v1/design/references",
            json={"area_id": area_id, "source_type": "upload",
                  "source_url": "https://example.test/pin.jpg"},
            headers=_auth(architect),
        )
        ref_id = ref.json()["id"]

        stranger_company = await factory.company(name="Stranger Co")
        stranger = await factory.user(
            company=stranger_company, role=UserRole.homeowner
        )
        resp = await client.post(
            f"/api/v1/design/references/{ref_id}/extract",
            headers=_auth(stranger),
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides.pop(get_llm, None)
