"""Design Profiler — image media layer: presign/multipart upload, ReferenceOut
image_url resolution, the vision-URL fix, and per-area ranking counters."""
from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models import UserRole
from app.profiler.extraction import get_llm
from app.storage import get_storage


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _profile_with_area_self_contributor(client, factory):
    """A profile whose single contributor is the requesting architect user, so
    my_contributor_id resolves (lets us exercise my_ranked_count + ranking)."""
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
    area_id = detail["areas"][0]["id"]
    contributor_id = detail["my_contributor_id"]
    assert contributor_id is not None
    return architect, site, pid, area_id, contributor_id


async def test_reference_out_exposes_resolvable_image_url(client, factory):
    architect, site, pid, area_id, contributor_id = await _profile_with_area_self_contributor(
        client, factory
    )
    key = f"design/{site.id}/abc123.jpg"
    ref = await client.post(
        "/api/v1/design/references",
        json={"area_id": area_id, "contributor_id": contributor_id,
              "source_type": "upload", "image_r2_key": key},
        headers=auth(architect),
    )
    assert ref.status_code == 201
    body = ref.json()
    assert body["image_r2_key"] == key
    assert body["image_url"] == get_storage().url_for(key)
    assert body["image_url"] and key in body["image_url"]


async def test_reference_out_image_url_null_without_key_or_url(client, factory):
    architect, site, pid, area_id, contributor_id = await _profile_with_area_self_contributor(
        client, factory
    )
    ref = await client.post(
        "/api/v1/design/references",
        json={"area_id": area_id, "contributor_id": contributor_id, "source_type": "preset"},
        headers=auth(architect),
    )
    assert ref.status_code == 201
    assert ref.json()["image_url"] is None


async def test_add_reference_passes_resolved_url_to_vision_not_bare_key(client, factory):
    """The latent bug: vision must receive a fetchable URL, never the bare R2 key."""
    fake = FakeLLMClient(canned={"colors": ["warm"], "style": "minimal", "confidence": 0.8})
    app.dependency_overrides[get_llm] = lambda: fake
    try:
        architect, site, pid, area_id, contributor_id = (
            await _profile_with_area_self_contributor(client, factory)
        )
        key = f"design/{site.id}/visiontest.jpg"
        ref = await client.post(
            "/api/v1/design/references",
            json={"area_id": area_id, "contributor_id": contributor_id,
                  "source_type": "upload", "image_r2_key": key},
            headers=auth(architect),
        )
        assert ref.status_code == 201
        passed_url = fake.calls[-1]["image_url"]
        assert passed_url == get_storage().url_for(key)
        assert passed_url != key  # the bug was passing the bare key
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_design_media_presign_is_multipart_under_local_storage(client, factory):
    architect, site, pid, area_id, contributor_id = await _profile_with_area_self_contributor(
        client, factory
    )
    resp = await client.post(
        "/api/v1/design/media/presign",
        json={"profile_id": pid, "kind": "image"},
        headers=auth(architect),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["upload_mode"] == "multipart"  # LocalStorage has no presigned PUT
    assert body["put_url"] is None
    assert body["key"].startswith(f"design/{site.id}/")


async def test_design_media_multipart_upload_stores_and_returns_key(client, factory):
    architect, site, pid, area_id, contributor_id = await _profile_with_area_self_contributor(
        client, factory
    )
    resp = await client.post(
        "/api/v1/design/media",
        files={"file": ("insp.jpg", b"\xff\xd8\xff fake-jpeg-bytes", "image/jpeg")},
        data={"profile_id": pid},
        headers=auth(architect),
    )
    assert resp.status_code == 200
    key = resp.json()["key"]
    assert key.startswith(f"design/{site.id}/")
    # The bytes are retrievable through the storage layer.
    assert get_storage().url_for(key) is not None


async def test_area_exposes_reference_and_my_ranked_counts(client, factory):
    architect, site, pid, area_id, contributor_id = await _profile_with_area_self_contributor(
        client, factory
    )

    def area_counts(detail):
        a = next(a for a in detail["areas"] if a["id"] == area_id)
        return a["reference_count"], a["my_ranked_count"]

    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    assert area_counts(detail) == (0, 0)

    ref_ids = []
    for _ in range(2):
        r = await client.post(
            "/api/v1/design/references",
            json={"area_id": area_id, "contributor_id": contributor_id, "source_type": "upload"},
            headers=auth(architect),
        )
        ref_ids.append(r.json()["id"])

    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    assert area_counts(detail) == (2, 0)

    await client.post(
        f"/api/v1/design/references/{ref_ids[0]}/rankings",
        json={"contributor_id": contributor_id, "stars": 5},
        headers=auth(architect),
    )
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    assert area_counts(detail) == (2, 1)
