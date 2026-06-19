"""H0 interactions: homeowner requests (+ status flow + one-nudge sweep) and
responding to decisions."""
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.homeowner.nudge import NUDGE_TAG, run_request_nudge_sweep
from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    HomeownerRequest,
    HomeownerRequestStatus,
)

from .conftest import auth


async def test_create_and_track_request(client, ctx):
    created = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Leak under the sink", "detail": "Dripping since morning"},
        headers=auth(ctx.homeowner),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["status"] == "sent"
    assert body["sla_due_at"] is not None  # default SLA set for the nudge sweep
    req_id = body["id"]

    # Contractor moves it along the lifecycle.
    moved = await client.patch(
        f"/api/v1/homeowner/requests/{req_id}",
        json={"status": "in_progress"},
        headers=auth(ctx.owner),
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["status"] == "in_progress"

    listed = await client.get("/api/v1/homeowner/requests", headers=auth(ctx.homeowner))
    assert listed.status_code == 200
    assert listed.json()[0]["status"] == "in_progress"


async def test_request_nudge_sweep_fires_once(client, ctx, db_session):
    # An overdue, still-open request.
    req = HomeownerRequest(
        site_id=ctx.site.id,
        raised_by=ctx.homeowner.id,
        title="Overdue ask",
        status=HomeownerRequestStatus.sent,
        sla_due_at=datetime.now(UTC) - timedelta(days=1),
    )
    db_session.add(req)
    await db_session.flush()

    now = datetime.now(UTC)
    first = await run_request_nudge_sweep(db_session, now=now)
    assert first == [req.id]
    await db_session.refresh(req)
    assert req.nudged_at is not None

    # A contractor-facing nudge Decision was raised, tagged so it never dupes.
    nudges = (
        await db_session.execute(
            select(Decision).where(
                Decision.company_id == ctx.company.id, Decision.title.like(f"{NUDGE_TAG}%")
            )
        )
    ).scalars().all()
    assert len(nudges) == 1

    # One-nudge rule: a second sweep raises nothing new.
    second = await run_request_nudge_sweep(db_session, now=now + timedelta(hours=1))
    assert second == []


async def test_decision_detail_humanizes_leaked_enum_token(client, ctx, db_session):
    """P2-1: a leaked internal token (e.g. 'unverified_invoice' from the real-data
    import path) must never reach the homeowner as a raw enum string in the
    'why this is coming up now' copy — it's rewritten to calm prose."""
    decision = Decision(
        company_id=ctx.company.id,
        site_id=ctx.site.id,
        kind=DecisionKind.approval,
        title="Approve the invoice?",
        detail="unverified_invoice",  # raw token, as the import leaked it
        state=DecisionState.pending,
    )
    db_session.add(decision)
    await db_session.flush()

    pending = await client.get("/api/v1/homeowner/decisions", headers=auth(ctx.homeowner))
    item = next(d for d in pending.json() if d["id"] == str(decision.id))
    assert item["detail"] != "unverified_invoice"
    assert "invoice" in item["detail"].lower()
    assert " " in item["detail"]  # real prose, not a bare token


async def test_decision_detail_passes_prose_through(client, ctx, db_session):
    """Genuine prose detail is returned unchanged (humanizer only rewrites bare
    single-token enum values)."""
    prose = "Invoice bills 120 bags but the site logged 100. ~₹12,000 at risk."
    decision = Decision(
        company_id=ctx.company.id, site_id=ctx.site.id, kind=DecisionKind.approval,
        title="Approve?", detail=prose, state=DecisionState.pending,
    )
    db_session.add(decision)
    await db_session.flush()
    pending = await client.get("/api/v1/homeowner/decisions", headers=auth(ctx.homeowner))
    item = next(d for d in pending.json() if d["id"] == str(decision.id))
    assert item["detail"] == prose


async def test_respond_to_decision_resolves_it(client, ctx, db_session):
    decision = Decision(
        company_id=ctx.company.id,
        site_id=ctx.site.id,
        kind=DecisionKind.homeowner_question,
        title="Approve the tile sample?",
        state=DecisionState.pending,
    )
    db_session.add(decision)
    await db_session.flush()

    # It shows in the homeowner's pending decisions.
    pending = await client.get("/api/v1/homeowner/decisions", headers=auth(ctx.homeowner))
    assert pending.status_code == 200, pending.text
    assert any(d["id"] == str(decision.id) for d in pending.json())

    # Approving resolves it.
    resp = await client.post(
        f"/api/v1/homeowner/decisions/{decision.id}/respond",
        json={"action": "approve", "note": "Looks great"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["state"] == "resolved"

    # Resolved decisions drop out of the pending list.
    after = await client.get("/api/v1/homeowner/decisions", headers=auth(ctx.homeowner))
    assert all(d["id"] != str(decision.id) for d in after.json())


async def test_create_request_alerts_site_leads(client, ctx, db_session):
    """A homeowner report must actively reach the site team — the company's
    owner/PM get a push so it doesn't sit unseen."""
    from app.models import PushToken
    from app.push import sender

    sender.reset_dry_run_log()
    db_session.add(
        PushToken(user_id=ctx.owner.id, token="ExponentPushToken[lead]", platform="ios")
    )
    await db_session.flush()

    resp = await client.post(
        "/api/v1/homeowner/requests",
        json={"title": "Crack in the stair wall", "detail": "near the landing"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code in (200, 201), resp.text
    tos = {m["to"] for m in sender.dry_run_log()}
    assert "ExponentPushToken[lead]" in tos


async def test_comment_does_not_change_decision_state(client, ctx, db_session):
    """A comment is upward voice, NOT a decision. It must leave the decision
    ``pending`` so it stays on the homeowner's Home "needs your input" — and the
    typed note must be preserved (regression: comment used to flip it to
    ``acknowledged``, dropping it off Home)."""
    decision = Decision(
        company_id=ctx.company.id,
        site_id=ctx.site.id,
        kind=DecisionKind.homeowner_question,
        title="Approve the tile sample?",
        state=DecisionState.pending,
    )
    db_session.add(decision)
    await db_session.flush()

    resp = await client.post(
        f"/api/v1/homeowner/decisions/{decision.id}/respond",
        json={"action": "comment", "note": "Can we see a warmer shade?"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    # State unchanged — still pending, NOT acknowledged.
    assert resp.json()["state"] == "pending"

    # Still listed as a pending decision (i.e. still on Home).
    after = await client.get("/api/v1/homeowner/decisions", headers=auth(ctx.homeowner))
    assert any(d["id"] == str(decision.id) for d in after.json())

    # And it still surfaces on Home's needs_attention.
    home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    assert home.status_code == 200, home.text
    assert any(a["id"] == str(decision.id) for a in home.json()["needs_attention"])

    # The note was preserved.
    await db_session.refresh(decision)
    assert decision.resolution_note == "Can we see a warmer shade?"


async def test_cannot_respond_to_other_sites_decision(client, ctx, factory, db_session):
    other_site = await factory.site(ctx.company, name="Not Mine")
    decision = Decision(
        company_id=ctx.company.id,
        site_id=other_site.id,
        kind=DecisionKind.homeowner_question,
        title="Someone else's call",
        state=DecisionState.pending,
    )
    db_session.add(decision)
    await db_session.flush()

    resp = await client.post(
        f"/api/v1/homeowner/decisions/{decision.id}/respond",
        json={"action": "approve"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 404
