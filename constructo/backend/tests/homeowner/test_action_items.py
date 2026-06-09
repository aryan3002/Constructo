"""Homeowner action items (Slice C) — a homeowner may keep her OWN to-dos for a
site she's on, but never sees or edits the crew's internal to-do list."""
from tests.homeowner.conftest import auth


async def test_homeowner_creates_lists_and_toggles_own_todo(client, ctx):
    r = await client.post(
        "/api/v1/action-items",
        headers=auth(ctx.homeowner),
        json={"site_id": str(ctx.site.id), "title": "Pick bathroom tiles"},
    )
    assert r.status_code == 201, r.text
    item = r.json()
    assert item["created_by"] == str(ctx.homeowner.id)

    r2 = await client.get(
        f"/api/v1/action-items?site_id={ctx.site.id}", headers=auth(ctx.homeowner)
    )
    assert r2.status_code == 200, r2.text
    assert "Pick bathroom tiles" in [i["title"] for i in r2.json()]

    r3 = await client.patch(
        f"/api/v1/action-items/{item['id']}",
        headers=auth(ctx.homeowner),
        json={"status": "done"},
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["status"] == "done"


async def test_homeowner_cannot_see_or_touch_crew_todo(client, ctx):
    # The contractor owner creates an internal crew to-do on the same site.
    r = await client.post(
        "/api/v1/action-items",
        headers=auth(ctx.owner),
        json={"site_id": str(ctx.site.id), "title": "Crew internal task"},
    )
    assert r.status_code == 201, r.text
    crew = r.json()

    # She does not see it in her list…
    r2 = await client.get(
        f"/api/v1/action-items?site_id={ctx.site.id}", headers=auth(ctx.homeowner)
    )
    assert "Crew internal task" not in [i["title"] for i in r2.json()]

    # …and cannot toggle it.
    r3 = await client.patch(
        f"/api/v1/action-items/{crew['id']}",
        headers=auth(ctx.homeowner),
        json={"status": "done"},
    )
    assert r3.status_code == 403, r3.text
