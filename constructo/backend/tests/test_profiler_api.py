"""Design Profiler API — endpoint + e2e tests."""
from app.auth.jwt import create_access_token
from app.models import UserRole


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def test_create_and_get_profile_with_areas_and_contributors(client, factory):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)

    created = await client.post(
        "/api/v1/design/profiles",
        json={
            "site_id": str(site.id),
            "scope_type": "rooms",
            "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 2}],
            "contributors": [{"role": "co_owner", "is_decision_owner": True}],
        },
        headers=auth(architect),
    )
    assert created.status_code == 201
    pid = created.json()["id"]
    assert created.json()["status"] == "intake_started"

    detail = await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))
    assert detail.status_code == 200
    body = detail.json()
    assert len(body["areas"]) == 1 and body["areas"][0]["area_key"] == "kitchen"
    assert len(body["contributors"]) == 1 and body["contributors"][0]["role"] == "co_owner"


async def test_get_profile_is_company_scoped(client, factory):
    company_a = await factory.company()
    architect_a = await factory.user(company=company_a, role=UserRole.architect)
    site = await factory.site(company_a)
    created = await client.post(
        "/api/v1/design/profiles",
        json={"site_id": str(site.id), "areas": [], "contributors": []},
        headers=auth(architect_a),
    )
    pid = created.json()["id"]

    other = await factory.user(role=UserRole.architect)  # different company
    resp = await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(other))
    assert resp.status_code == 404


async def _profile_with_area_and_two_contributors(client, factory):
    company = await factory.company()
    architect = await factory.user(company=company, role=UserRole.architect)
    site = await factory.site(company)
    created = await client.post(
        "/api/v1/design/profiles",
        json={
            "site_id": str(site.id),
            "areas": [{"area_kind": "interior", "area_key": "kitchen", "recommended_count": 2}],
            "contributors": [{"role": "co_owner", "is_decision_owner": True}, {"role": "co_owner"}],
        },
        headers=auth(architect),
    )
    pid = created.json()["id"]
    detail = (await client.get(f"/api/v1/design/profiles/{pid}", headers=auth(architect))).json()
    area_id = detail["areas"][0]["id"]
    contrib_ids = [c["id"] for c in detail["contributors"]]
    return architect, pid, area_id, contrib_ids


async def test_add_reference_and_rank_per_contributor(client, factory):
    architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(
        client, factory
    )

    ref = await client.post(
        "/api/v1/design/references",
        json={"area_id": area_id, "contributor_id": contrib_ids[0], "source_type": "upload"},
        headers=auth(architect),
    )
    assert ref.status_code == 201
    ref_id = ref.json()["id"]

    for cid, stars in ((contrib_ids[0], 5), (contrib_ids[1], 1)):
        r = await client.post(
            f"/api/v1/design/references/{ref_id}/rankings",
            json={"contributor_id": cid, "stars": stars},
            headers=auth(architect),
        )
        assert r.status_code == 201

    # re-rank by the same contributor updates (upsert), does not duplicate
    again = await client.post(
        f"/api/v1/design/references/{ref_id}/rankings",
        json={"contributor_id": contrib_ids[0], "stars": 4},
        headers=auth(architect),
    )
    assert again.status_code == 201
