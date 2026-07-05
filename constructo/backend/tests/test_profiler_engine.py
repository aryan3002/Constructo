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
