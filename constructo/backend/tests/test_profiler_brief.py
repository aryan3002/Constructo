"""Brief narration + clarifications: deterministic payload shaping + LLM proposes
(FakeLLM, no spend). The LLM phrases prose only; every number/material comes from
the deterministic payload."""
from app.extraction.llm import FakeLLMClient
from app.main import app
from app.profiler.brief import (
    PROFILER_BRIEF_SYSTEM,
    build_area_brief_payload,
    generate_clarifications,
    narrate_brief,
)
from app.profiler.extraction import get_llm
from tests.test_profiler_api import _profile_with_area_and_two_contributors, auth


def _brief_llm() -> FakeLLMClient:
    # One canned dict serves vision-extraction (on add_reference), theme narration,
    # brief narration, and clarifications — FakeLLM returns it for every complete()/
    # complete_vision() call; each helper reads only the keys it needs.
    return FakeLLMClient(
        canned={
            "headline": "A calm, warm space",
            "summary": "Light woods and soft tones.",
            "sections": [{"title": "Materials", "body": "Light oak throughout."}],
            "themes": [
                {
                    "name": "Soft Minimal",
                    "palette": ["beige"],
                    "materials": ["light oak"],
                    "rationale": "warm minimal",
                }
            ],
            "questions": ["Matte or glossy?"],
            "colors": ["dark"],
            "style": "minimal",
            "confidence": 0.9,
        }
    )


async def _seed_ranked_area(client, factory):
    architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(
        client, factory
    )
    ref_ids = []
    for _ in range(2):
        r = await client.post(
            "/api/v1/design/references",
            json={
                "area_id": area_id,
                "source_type": "upload",
                "source_url": "https://example.test/x.jpg",
            },
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
            json={"contributor_id": contrib_ids[1], "stars": 5},
            headers=auth(architect),
        )
    return architect, pid, area_id, contrib_ids


def test_build_area_brief_payload_keeps_reducer_numbers_and_approved_only():
    taste = {"dimensions": {"style": {"minimal": 2.0}}, "confidence": 1.0, "has_conflict": False}
    themes = [
        {"name": "Soft Minimal", "palette": ["oak"], "materials": ["light oak"],
         "status": "approved"},
        {"name": "Rejected One", "palette": [], "materials": ["chrome"], "status": "rejected"},
    ]
    conflicts = [
        {"dimension": "colors", "value": "dark", "decision_note": "go light",
         "resolution_status": "resolved"},
        {"dimension": "style", "value": "ornate", "decision_note": None,
         "resolution_status": "open"},
    ]
    payload = build_area_brief_payload("kitchen", taste, themes, conflicts)
    assert payload["area_key"] == "kitchen"
    assert payload["confidence"] == 1.0  # straight from the reducer
    # only APPROVED/adjusted themes flow into the brief; rejected dropped:
    assert [t["name"] for t in payload["themes"]] == ["Soft Minimal"]
    assert "light oak" in payload["material_families"]
    # only RESOLVED/deferred conflicts surface; open ones excluded:
    assert [c["value"] for c in payload["resolved_conflicts"]] == ["dark"]


async def test_narrate_brief_calls_complete_per_audience_and_returns_prose():
    canned = {"headline": "A calm, warm kitchen", "summary": "Light woods and soft tones.",
              "sections": [{"title": "Materials", "body": "Light oak throughout."}]}
    llm = FakeLLMClient(canned=canned)
    payload = {"scope_type": "rooms", "areas": [{"area_key": "kitchen", "confidence": 1.0,
               "material_families": ["light oak"], "themes": [{"name": "Soft Minimal"}],
               "resolved_conflicts": []}]}
    out = await narrate_brief(llm, "contractor", payload)
    assert out["headline"] == "A calm, warm kitchen"
    # the audience is named in the prompt; it used complete() (not vision):
    last = llm.calls[-1]
    assert "contractor" in last["user"].lower() or "contractor" in last["system"].lower()
    assert "image_url" not in llm.calls[-1]
    assert PROFILER_BRIEF_SYSTEM  # system prompt exists


async def test_generate_clarifications_returns_questions_from_signals():
    canned = {
        "questions": [
            "Do you prefer matte or glossy finishes?",
            "Warmer or cooler whites for the cabinets?",
        ]
    }
    llm = FakeLLMClient(canned=canned)
    taste = {
        "dimensions": {"style": {"minimal": 0.5, "ornate": -0.5}},
        "confidence": 0.3,
        "has_conflict": True,
    }
    qs = await generate_clarifications(llm, "kitchen", taste)
    assert len(qs) == 2
    assert qs[0].startswith("Do you prefer")
    assert "minimal" in llm.calls[-1]["user"]  # grounded in the taste signals


# ---------------------------------------------------------------------------
# Task 4: POST /profiles/{id}/brief  — brief generation
# ---------------------------------------------------------------------------


async def test_generate_brief_snapshots_three_renderings_with_deterministic_numbers(
    client, factory
):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, pid, area_id, _ = await _seed_ranked_area(client, factory)
        # approve a theme so it flows into the brief
        await client.post(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes",
            headers=auth(architect),
        )
        themes = (
            await client.get(
                f"/api/v1/design/profiles/{pid}/areas/{area_id}/themes",
                headers=auth(architect),
            )
        ).json()
        await client.post(
            f"/api/v1/design/themes/{themes[0]['id']}/decision",
            json={"action": "approve"},
            headers=auth(architect),
        )

        gen = await client.post(
            f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect)
        )
        assert gen.status_code == 201
        brief = gen.json()
        assert brief["version"] == 1
        assert brief["state"] == "homeowner_review"
        assert len(brief["renderings"]) == 3
        auds = {r["audience"] for r in brief["renderings"]}
        assert auds == {"homeowner", "architect", "contractor"}
        # determinism: confidence in every rendering's content == reducer's 1.0, not LLM's 0.9
        for r in brief["renderings"]:
            areas = r["content_json"]["areas"]
            assert areas[0]["confidence"] == 1.0
        # contractor rendering carries material families straight from the approved theme
        contractor = next(r for r in brief["renderings"] if r["audience"] == "contractor")
        assert "light oak" in contractor["content_json"]["areas"][0]["material_families"]
        # second generate bumps the version
        gen2 = await client.post(
            f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect)
        )
        assert gen2.json()["version"] == 2
    finally:
        app.dependency_overrides.pop(get_llm, None)


# ---------------------------------------------------------------------------
# Task 5: POST /briefs/{id}/approval  — state-machine transitions
# ---------------------------------------------------------------------------


async def test_brief_state_machine_transitions_and_records_actor(client, factory):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        architect, pid, area_id, _ = await _seed_ranked_area(client, factory)
        brief = (
            await client.post(f"/api/v1/design/profiles/{pid}/brief", headers=auth(architect))
        ).json()
        bid = brief["id"]
        assert brief["state"] == "homeowner_review"

        # illegal transition from homeowner_review -> 409
        bad = await client.post(
            f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"},
            headers=auth(architect),
        )
        assert bad.status_code == 409

        # homeowner_review --send_to_architect--> architect_review
        r1 = await client.post(
            f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "send_to_architect"},
            headers=auth(architect),
        )
        assert r1.status_code == 200 and r1.json()["state"] == "architect_review"

        # architect_review --architect_sign_off--> contractor_brief_ready
        r2 = await client.post(
            f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "architect_sign_off"},
            headers=auth(architect),
        )
        assert r2.json()["state"] == "contractor_brief_ready"

        # contractor_brief_ready --approve--> approved
        r3 = await client.post(
            f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "approve"},
            headers=auth(architect),
        )
        assert r3.json()["state"] == "approved"

        # approved --contractor_received--> locked
        r4 = await client.post(
            f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "contractor_received"},
            headers=auth(architect),
        )
        assert r4.json()["state"] == "locked"

        # bad action rejected by schema
        bad2 = await client.post(
            f"/api/v1/design/briefs/{bid}/approval",
            json={"action": "nope"},
            headers=auth(architect),
        )
        assert bad2.status_code == 422
    finally:
        app.dependency_overrides.pop(get_llm, None)


# ---------------------------------------------------------------------------
# Task 6: Clarifications — generate / list / answer
# ---------------------------------------------------------------------------


async def test_clarifications_generate_list_and_answer(client, factory):
    app.dependency_overrides[get_llm] = _brief_llm
    try:
        # low confidence (recommended_count high, few ranked) -> questions generated
        architect, pid, area_id, contrib_ids = await _profile_with_area_and_two_contributors(
            client, factory
        )
        r = await client.post(
            "/api/v1/design/references",
            json={
                "area_id": area_id,
                "source_type": "upload",
                "source_url": "https://example.test/x.jpg",
            },
            headers=auth(architect),
        )
        rid = r.json()["id"]
        await client.post(
            f"/api/v1/design/references/{rid}/rankings",
            json={"contributor_id": contrib_ids[0], "stars": 5},
            headers=auth(architect),
        )

        gen = await client.post(
            f"/api/v1/design/profiles/{pid}/areas/{area_id}/clarifications",
            headers=auth(architect),
        )
        assert gen.status_code == 201
        created = gen.json()
        assert len(created) >= 1 and created[0]["answer"] is None

        listed = (
            await client.get(
                f"/api/v1/design/profiles/{pid}/clarifications",
                headers=auth(architect),
            )
        ).json()
        assert len(listed) >= 1
        qid = listed[0]["id"]

        ans = await client.post(
            f"/api/v1/design/clarifications/{qid}/answer",
            json={"answer": "Matte, please."},
            headers=auth(architect),
        )
        assert ans.status_code == 200
        assert ans.json()["answer"] == "Matte, please."
        assert ans.json()["answered_at"] is not None
    finally:
        app.dependency_overrides.pop(get_llm, None)
