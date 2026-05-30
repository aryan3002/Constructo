"""H3 end-to-end (FakeLLM, no network): the full homeowner loop —
publisher → feed → push → decision response → request nudge sweep."""
from datetime import UTC, datetime, timedelta

from app.homeowner.nudge import run_request_nudge_sweep
from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    HomeownerRequest,
    HomeownerRequestStatus,
)
from app.push import sender

from .conftest import auth


async def test_publisher_feed_push_decision_and_nudge_loop(client, ctx, db_session):
    sender.reset_dry_run_log()
    owner, homeowner, site = ctx.owner, ctx.homeowner, ctx.site

    # The app registered an Expo push token into the member's notif_prefs.
    pref = await client.patch(
        f"/api/v1/homeowner/members/{ctx.member.id}",
        json={"notif_prefs": {"push_token": "ExponentPushToken[demo]"}},
        headers=auth(homeowner),
    )
    assert pref.status_code == 200, pref.text

    # Contractor publishes the property + a photo + an update.
    prop = await client.post(
        "/api/v1/publish/property",
        json={"site_id": str(site.id), "display_name": "Sharma Residence"},
        headers=auth(owner),
    )
    assert prop.status_code == 201, prop.text
    photo = await client.post(
        "/api/v1/publish/photo",
        json={
            "site_id": str(site.id),
            "image_url": "http://cdn/slab.jpg",
            "caption": "Slab poured",
        },
        headers=auth(owner),
    )
    assert photo.status_code == 201
    upd = await client.post(
        "/api/v1/publish/update",
        json={"site_id": str(site.id), "type": "progress", "title": "Slab poured"},
        headers=auth(owner),
    )
    assert upd.status_code == 201

    # The published update pushed to the homeowner's device (dry-run captured).
    assert any(m["to"] == "ExponentPushToken[demo]" for m in sender.dry_run_log())

    # The homeowner sees their project in the feed.
    home = await client.get("/api/v1/homeowner/home", headers=auth(homeowner))
    assert home.status_code == 200
    assert home.json()["property"]["display_name"] == "Sharma Residence"
    photos = await client.get("/api/v1/homeowner/photos", headers=auth(homeowner))
    assert len(photos.json()["items"]) == 1

    # The homeowner responds to a pending decision → resolved.
    decision = Decision(
        company_id=ctx.company.id, site_id=site.id, kind=DecisionKind.homeowner_question,
        title="Approve the tile sample?", state=DecisionState.pending,
    )
    db_session.add(decision)
    await db_session.flush()
    resp = await client.post(
        f"/api/v1/homeowner/decisions/{decision.id}/respond",
        json={"action": "approve", "note": "Looks great"},
        headers=auth(homeowner),
    )
    assert resp.status_code == 200
    assert resp.json()["state"] == "resolved"

    # An overdue request escalates via the one-nudge sweep (H3 scheduler callable).
    req = HomeownerRequest(
        site_id=site.id, title="Add a socket", status=HomeownerRequestStatus.sent,
        sla_due_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add(req)
    await db_session.flush()
    nudged = await run_request_nudge_sweep(db_session, now=datetime.now(UTC))
    assert req.id in nudged


async def test_request_status_change_pushes_homeowner(client, ctx, db_session):
    sender.reset_dry_run_log()
    owner, homeowner = ctx.owner, ctx.homeowner
    await client.patch(
        f"/api/v1/homeowner/members/{ctx.member.id}",
        json={"notif_prefs": {"push_token": "ExponentPushToken[req]"}},
        headers=auth(homeowner),
    )
    created = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Leaky tap"},
        headers=auth(homeowner),
    )
    req_id = created.json()["id"]
    sender.reset_dry_run_log()  # only assert on the status-change push

    moved = await client.patch(
        f"/api/v1/homeowner/requests/{req_id}",
        json={"status": "in_progress"},
        headers=auth(owner),
    )
    assert moved.status_code == 200
    assert any(m["to"] == "ExponentPushToken[req]" for m in sender.dry_run_log())
