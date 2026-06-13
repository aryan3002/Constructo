"""Theme narration: pure evidence selection + LLM proposes (FakeLLM, no spend)."""
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.profiler.extraction import get_llm
from app.profiler.themes import narrate_themes, top_reference_ids
from tests.test_profiler_api import _profile_with_area_and_two_contributors, auth


def test_top_reference_ids_picks_highest_starred_deterministically():
    rankings = [
        {"reference_id": "r1", "contributor_id": "A", "stars": 5, "tags": {}},
        {"reference_id": "r2", "contributor_id": "A", "stars": 2, "tags": {}},
        {"reference_id": "r3", "contributor_id": "B", "stars": 4, "tags": {}},
        {"reference_id": "r1", "contributor_id": "B", "stars": 3, "tags": {}},  # r1 max stays 5
    ]
    assert top_reference_ids(rankings, limit=2) == ["r1", "r3"]  # 5, then 4
    assert top_reference_ids([], limit=3) == []


async def test_narrate_themes_calls_complete_and_returns_list():
    canned = {"themes": [{"name": "Warm Contemporary", "palette": ["oak", "beige"],
                          "materials": ["light oak"], "rationale": "You liked warm minimal."}]}
    llm = FakeLLMClient(canned=canned)
    taste = {"dimensions": {"style": {"minimal": 2.0, "ornate": -1.0}, "colors": {"light": 1.5}}}
    out = await narrate_themes(llm, "kitchen", taste)
    assert out[0]["name"] == "Warm Contemporary"
    # it used complete() (not vision) and the prompt mentions the liked/disliked signals
    assert "minimal" in llm.calls[-1]["user"]
    assert "ornate" in llm.calls[-1]["user"]
    assert "image_url" not in llm.calls[-1]  # complete(), not complete_vision()


async def test_generate_themes_persists_with_reducer_confidence_and_syncs_conflicts(  # noqa: E501
    client, factory
):
    # Two owners rank same dark reference oppositely -> real conflict; FakeLLM proposes a theme.
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(
        canned={
            "themes": [
                {"name": "Soft Minimal", "palette": ["beige"],
                 "materials": ["oak"], "rationale": "warm minimal"}
            ],
            # vision-extraction (on add_reference) also goes through this fake:
            "colors": ["dark"],
            "style": "ornate",
            "confidence": 0.9,
        }
    )
    try:
        architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(
            client, factory
        )
        ref_ids = []
        for _ in range(2):
            r = await client.post(
                "/api/v1/design/references",
                json={"area_id": area_id, "source_type": "upload",
                      "source_url": "https://example.test/dark.jpg"},
                headers=auth(architect),
            )
            ref_ids.append(r.json()["id"])
        for ref_id in ref_ids:
            await client.post(
                f"/api/v1/design/references/{ref_id}/rankings",
                json={"contributor_id": contrib_ids[0], "stars": 5},
                headers=auth(architect),
            )
            await client.post(
                f"/api/v1/design/references/{ref_id}/rankings",
                json={"contributor_id": contrib_ids[1], "stars": 1},
                headers=auth(architect),
            )

        gen = await client.post(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect)
        )
        assert gen.status_code == 201
        themes = gen.json()
        assert themes[0]["name"] == "Soft Minimal"
        # confidence comes from the deterministic reducer (2 ranked refs / recommended 2 == 1.0),
        # NOT from the LLM canned payload (which has 0.9):
        assert themes[0]["confidence"] == 1.0
        assert themes[0]["evidence_reference_ids"]  # deterministically chosen

        # conflicts were synced as rows:
        conflicts = (
            await client.get(
                f"/api/v1/design/profiles/{pid}/conflicts", headers=auth(architect)
            )
        ).json()
        assert any(c["dimension"] == "colors" and c["value"] == "dark" for c in conflicts)

        # listing themes returns the generated one:
        listed = (
            await client.get(
                f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect)
            )
        ).json()
        assert len(listed) == 1
    finally:
        app.dependency_overrides.pop(get_llm, None)


async def test_theme_decision_and_conflict_resolve(client, factory):
    app.dependency_overrides[get_llm] = lambda: FakeLLMClient(
        canned={"themes": [{"name": "Soft Minimal", "palette": ["beige"], "materials": ["oak"],
                            "rationale": "warm"}], "colors": ["dark"], "confidence": 0.9})
    try:
        architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(
            client, factory
        )
        for _ in range(2):
            r = await client.post("/api/v1/design/references",
                json={"area_id": area_id, "source_type": "upload",
                      "source_url": "https://example.test/x.jpg"}, headers=auth(architect))
            rid = r.json()["id"]
            await client.post(f"/api/v1/design/references/{rid}/rankings",
                json={"contributor_id": contrib_ids[0], "stars": 5}, headers=auth(architect))
            await client.post(f"/api/v1/design/references/{rid}/rankings",
                json={"contributor_id": contrib_ids[1], "stars": 1}, headers=auth(architect))
        themes = (
            await client.post(
                f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes", headers=auth(architect)
            )
        ).json()
        theme_id = themes[0]["id"]

        # approve the theme
        dec = await client.post(f"/api/v1/design/themes/{theme_id}/decision",
            json={"action": "approve"}, headers=auth(architect))
        assert dec.status_code == 200
        assert dec.json()["status"] == "approved"

        # bad action rejected by schema
        bad = await client.post(f"/api/v1/design/themes/{theme_id}/decision",
            json={"action": "nope"}, headers=auth(architect))
        assert bad.status_code == 422

        # resolve a conflict
        conflicts = (await client.get(
            f"/api/v1/design/profiles/{pid}/conflicts", headers=auth(architect))).json()
        cid = conflicts[0]["id"]
        res = await client.post(f"/api/v1/design/conflicts/{cid}/resolve",
            json={"resolution": "compromise", "note": "light oak + subtle contrast"},
            headers=auth(architect))
        assert res.status_code == 200
        assert res.json()["resolution_status"] == "resolved"
        assert res.json()["decision_note"] == "light oak + subtle contrast"
    finally:
        app.dependency_overrides.pop(get_llm, None)
