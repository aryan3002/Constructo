"""The ignition: ranking past the threshold auto-proposes; below it, silence."""
import pytest
from sqlalchemy import select

from app.auth.jwt import create_access_token
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.models.profiler import ProfilerArea, ProfilerTheme, ThemeStatus
from app.profiler.extraction import get_llm
from tests.test_profiler_presets import _profile_with_area  # architect+site+area+contributor

_CANNED = {
    "themes": [
        {"name": "Warm Contemporary", "palette": ["oak", "beige"],
         "materials": ["light oak"], "rationale": "You liked warm minimal."}
    ],
    # vision-extraction (on add_reference) also flows through this fake:
    "colors": ["warm"],
    "style": "minimal",
    "confidence": 0.9,
}


@pytest.fixture(autouse=True)
def _fake_llm():
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(canned=_CANNED)
    yield
    app.dependency_overrides.pop(get_llm, None)


def auth(user) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(str(user.id), user.role.value)}"}


async def _add_and_rank(client, hdrs, pid, area_id, contributor_id, n, stars=5):
    """n upload references, each ranked immediately (stars). Returns ref ids."""
    ids = []
    for i in range(n):
        ref = await client.post("/api/v1/design/references", json={
            "profile_id": pid, "area_id": area_id, "contributor_id": contributor_id,
            "source_type": "upload", "image_r2_key": f"design/test/{i}.jpg",
        }, headers=hdrs)
        assert ref.status_code == 201, ref.text
        rid = ref.json()["id"]
        rank = await client.post(f"/api/v1/design/references/{rid}/rankings", json={
            "contributor_id": contributor_id, "stars": stars, "tags": {},
        }, headers=hdrs)
        assert rank.status_code == 201, rank.text
        ids.append(rid)
    return ids


async def test_crossing_threshold_autoproposes_themes(client, factory, db_session):
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    area = await db_session.get(ProfilerArea, area_id)
    area.recommended_count = 3
    await db_session.commit()
    hdrs = auth(architect)
    await _add_and_rank(client, hdrs, pid, area_id, contributor_id, 3)
    themes = (await db_session.execute(
        select(ProfilerTheme).where(ProfilerTheme.area_id == area_id,
                                    ProfilerTheme.status == ThemeStatus.suggested)
    )).scalars().all()
    assert themes, "ranking past recommended_count must auto-propose themes"
    area = await db_session.get(ProfilerArea, area_id)
    assert area.last_proposal_ranked_count == 3
    assert area.taste_model  # persisted on write, not on GET


async def test_below_threshold_stays_silent(client, factory, db_session):
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    area = await db_session.get(ProfilerArea, area_id)
    area.recommended_count = 5
    await db_session.commit()
    await _add_and_rank(client, auth(architect), pid, area_id, contributor_id, 2)
    themes = (await db_session.execute(
        select(ProfilerTheme).where(ProfilerTheme.area_id == area_id)
    )).scalars().all()
    assert themes == []


async def test_get_taste_is_read_only(client, factory, db_session):
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    resp = await client.get(
        f"/api/v1/design/profiles/{pid}/areas/{area_id}/taste", headers=auth(architect))
    assert resp.status_code == 200
    area = await db_session.get(ProfilerArea, area_id)
    await db_session.refresh(area)
    assert area.taste_model == {}  # untouched by a GET (no rankings yet, nothing persisted)


async def test_second_contributor_disagreement_syncs_conflicts_without_new_refs(
    client, factory, db_session
):
    """Spouse A ranks both refs 5-stars (threshold fires, marker=2, no conflict yet
    since only one contributor has scored). Spouse B then ranks the SAME 2 refs
    1-star (fully opposing weight on the same dimension/value the FakeLLM always
    returns: colors=["warm"], style="minimal") — this MUST trip detect_conflicts's
    >=+0.5 / <=-0.5 threshold on both dimensions deterministically, since ranked_count
    stays 2 == marker (no NEW distinct ref), so propose_themes_for_area (the only
    _sync_conflicts caller before this fix) never runs again. Without the fix,
    GET /conflicts stays empty despite has_conflict=True on the area."""
    architect, site, pid, area_id, contributor_a = await _profile_with_area(client, factory)
    area = await db_session.get(ProfilerArea, area_id)
    area.recommended_count = 2
    await db_session.commit()
    hdrs_a = auth(architect)
    ref_ids = await _add_and_rank(client, hdrs_a, pid, area_id, contributor_a, 2, stars=5)

    marker_before = (await db_session.get(ProfilerArea, area_id)).last_proposal_ranked_count
    assert marker_before == 2  # threshold already fired for contributor A

    # Second contributor: another contractor-side user (pm) in the SAME company as
    # the architect, added via the real add_contributor endpoint (mirrors how
    # test_profiler_api.py builds multi-contributor profiles). A contractor-side
    # role keeps the membrane check to company-scope (no HomeownerMember needed),
    # same as `architect` above — this test is about conflict-sync, not membrane.
    from app.models import Company as _Company
    from app.models import UserRole as _UserRole

    company_obj = await db_session.get(_Company, architect.company_id)
    user_b = await factory.user(company=company_obj, role=_UserRole.pm)

    add_contrib = await client.post(
        f"/api/v1/design/profiles/{pid}/contributors",
        json={"role": "co_owner", "is_decision_owner": True, "user_id": str(user_b.id)},
        headers=hdrs_a,
    )
    assert add_contrib.status_code == 201, add_contrib.text
    contributor_b = add_contrib.json()["id"]

    hdrs_b = auth(user_b)
    for rid in ref_ids:
        rank = await client.post(f"/api/v1/design/references/{rid}/rankings", json={
            "contributor_id": contributor_b, "stars": 1, "tags": {},
        }, headers=hdrs_b)
        assert rank.status_code == 201, rank.text

    marker_after = (await db_session.get(ProfilerArea, area_id)).last_proposal_ranked_count
    assert marker_after == marker_before == 2  # no new distinct ref -> no re-propose

    conflicts_resp = await client.get(
        f"/api/v1/design/profiles/{pid}/conflicts", headers=hdrs_a
    )
    assert conflicts_resp.status_code == 200
    conflicts = conflicts_resp.json()
    assert conflicts, "second contributor's disagreement must surface an OPEN conflict"
    assert all(c["resolution_status"] == "open" for c in conflicts)


async def test_same_ranked_count_does_not_regenerate(client, factory, db_session):
    """Debounce: re-ranking the same reference (upsert, count unchanged) must not
    delete+recreate the suggested set."""
    architect, site, pid, area_id, contributor_id = await _profile_with_area(client, factory)
    area = await db_session.get(ProfilerArea, area_id)
    area.recommended_count = 2
    await db_session.commit()
    hdrs = auth(architect)
    ids = await _add_and_rank(client, hdrs, pid, area_id, contributor_id, 2)
    first = (await db_session.execute(
        select(ProfilerTheme.id).where(ProfilerTheme.area_id == area_id)
    )).scalars().all()
    # re-rank ref 0 (count still 2)
    await client.post(f"/api/v1/design/references/{ids[0]}/rankings", json={
        "contributor_id": contributor_id, "stars": 2, "tags": {},
    }, headers=hdrs)
    second = (await db_session.execute(
        select(ProfilerTheme.id).where(ProfilerTheme.area_id == area_id)
    )).scalars().all()
    assert set(first) == set(second)
