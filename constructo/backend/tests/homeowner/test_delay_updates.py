"""Structured delay updates (Calm Cockpit §5/§8).

A ``delay`` update is the only red card the homeowner ever sees, so the design
rule is strict: a delay must carry a *revised date + reason + impact* or it is
not a delay at all. These tests pin the write-time contract (publish validation)
and the read-side exposure of the structured fields.
"""
from .conftest import auth


async def _publish(client, ctx, **fields):
    payload = {"site_id": str(ctx.site.id), **fields}
    return await client.post("/api/v1/publish/update", json=payload, headers=auth(ctx.owner))


async def test_publish_full_delay_exposes_structured_fields(client, ctx):
    r = await _publish(
        client,
        ctx,
        type="delay",
        title="Slab pour pushed",
        body="Rain stalled the pour.",
        revised_date="2026-07-15",
        impact_days=6,
        impact_cost_delta=40000,
        reason="Three days of unseasonal rain made the formwork unsafe to pour.",
    )
    assert r.status_code == 201, r.text

    updates = await client.get("/api/v1/homeowner/updates", headers=auth(ctx.homeowner))
    assert updates.status_code == 200
    item = updates.json()["items"][0]
    assert item["type"] == "delay"
    assert item["revised_date"] == "2026-07-15"
    assert item["impact_days"] == 6
    assert item["impact_cost_delta"] == 40000
    assert item["reason"].startswith("Three days")


async def test_delay_may_carry_a_single_impact(client, ctx):
    # Days-only delay (no cost) is valid — at least one impact is enough.
    r = await _publish(
        client,
        ctx,
        type="delay",
        title="Tiling slips a week",
        revised_date="2026-08-01",
        impact_days=7,
        reason="The tile batch is held at the depot.",
    )
    assert r.status_code == 201, r.text
    item = (await client.get("/api/v1/homeowner/updates", headers=auth(ctx.homeowner))).json()[
        "items"
    ][0]
    assert item["impact_days"] == 7
    assert item["impact_cost_delta"] is None


async def test_delay_without_revised_date_is_rejected(client, ctx):
    r = await _publish(
        client,
        ctx,
        type="delay",
        title="Something slipped",
        impact_days=3,
        reason="A reason without a date.",
    )
    assert r.status_code == 422, r.text


async def test_delay_without_reason_is_rejected(client, ctx):
    r = await _publish(
        client,
        ctx,
        type="delay",
        title="Something slipped",
        revised_date="2026-07-15",
        impact_days=3,
    )
    assert r.status_code == 422, r.text


async def test_delay_without_any_impact_is_rejected(client, ctx):
    r = await _publish(
        client,
        ctx,
        type="delay",
        title="Something slipped",
        revised_date="2026-07-15",
        reason="A reason and a date but no measured impact.",
    )
    assert r.status_code == 422, r.text


async def test_non_delay_update_rejects_delay_fields(client, ctx):
    r = await _publish(
        client,
        ctx,
        type="progress",
        title="Plastering started",
        revised_date="2026-07-15",
    )
    assert r.status_code == 422, r.text


async def test_non_delay_update_returns_null_delay_fields(client, ctx):
    r = await _publish(client, ctx, type="progress", title="Plastering started")
    assert r.status_code == 201, r.text
    item = (await client.get("/api/v1/homeowner/updates", headers=auth(ctx.homeowner))).json()[
        "items"
    ][0]
    assert item["revised_date"] is None
    assert item["impact_days"] is None
    assert item["impact_cost_delta"] is None
    assert item["reason"] is None
