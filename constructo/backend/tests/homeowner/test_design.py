"""H0 design: references, selections, AI-drafted design profile (FakeLLM), and
the advisory (never-gatekeeping) consistency check."""
from .conftest import auth


async def test_references_and_selections(client, ctx):
    ref = await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": "http://pin/1.jpg", "room_tag": "living", "source": "pinterest"},
        headers=auth(ctx.homeowner),
    )
    assert ref.status_code == 201, ref.text
    assert ref.json()["source"] == "pinterest"

    sel = await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "living room flooring", "choice": "oak engineered wood"},
        headers=auth(ctx.homeowner),
    )
    assert sel.status_code == 201, sel.text

    listed = await client.get(
        "/api/v1/homeowner/design/selections", headers=auth(ctx.homeowner)
    )
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["choice"] == "oak engineered wood"


async def test_ai_design_profile_generated_then_confirmed(client, ctx, fake_llm):
    # Seed intake so the AI draft has something to summarise.
    await client.post(
        "/api/v1/homeowner/design/references",
        json={"image_url": "http://pin/2.jpg", "room_tag": "kitchen"},
        headers=auth(ctx.homeowner),
    )
    await client.post(
        "/api/v1/homeowner/design/selections",
        json={"item": "kitchen counter", "choice": "quartz"},
        headers=auth(ctx.homeowner),
    )

    # No profile body -> server AI-drafts one (FakeLLM, no network).
    drafted = await client.put(
        "/api/v1/homeowner/design/profile", json={}, headers=auth(ctx.homeowner)
    )
    assert drafted.status_code == 200, drafted.text
    profile = drafted.json()["profile"]
    assert profile["profile"]  # non-empty drafted text
    assert "tone" in profile

    # Homeowner confirms/adjusts and PUTs the final profile verbatim.
    confirmed = await client.put(
        "/api/v1/homeowner/design/profile",
        json={"profile": {"profile": "warm, minimal, lots of wood", "tone": ["warm", "minimal"]}},
        headers=auth(ctx.homeowner),
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["profile"]["tone"] == ["warm", "minimal"]

    got = await client.get("/api/v1/homeowner/design/profile", headers=auth(ctx.homeowner))
    assert got.status_code == 200
    assert got.json()["profile"]["profile"] == "warm, minimal, lots of wood"


async def test_consistency_check_is_advisory_not_a_gate(client, ctx, fake_llm):
    resp = await client.post(
        "/api/v1/homeowner/design/consistency-check",
        json={"item": "bathroom tile", "choice": "neon pink"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Seek-feedback-not-gatekeep: never blocks (fits defaults true), always advises.
    assert body["fits"] is True
    assert body["feedback"]
