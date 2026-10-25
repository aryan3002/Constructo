"""T4 — the builder's internal approvals never reach the homeowner.

Only decisions whose ``audience`` is ``homeowner`` appear on the homeowner's
Home "needs your input", the decisions list, or can be responded to; internal
ones (an invoice approval with vendor and price) stay with the team, while
spec-routed sign-offs and homeowner questions still come through.
"""
from sqlalchemy import select

from app.models import (
    Component,
    ComponentStatus,
    Decision,
    DecisionAudience,
    DecisionKind,
    DecisionState,
    Space,
    SpaceKind,
    Spec,
    default_audience,
)

from .conftest import auth

INVOICE = "Approve ACC cement invoice (₹72,000)?"


async def _internal_invoice(db_session, ctx) -> Decision:
    d = Decision(
        company_id=ctx.company.id,
        site_id=ctx.site.id,
        kind=DecisionKind.approval,
        title=INVOICE,
        detail="Invoice bills 120 bags but the site logged 100.",
        state=DecisionState.pending,
    )
    db_session.add(d)
    await db_session.flush()
    return d


async def _routed_spec_decision(client, ctx, db_session) -> Decision:
    space = Space(site_id=ctx.site.id, name="Kitchen", kind=SpaceKind.room)
    db_session.add(space)
    await db_session.flush()
    comp = Component(space_id=space.id, name="Counter", status=ComponentStatus.in_progress)
    db_session.add(comp)
    await db_session.flush()
    spec = Spec(
        company_id=ctx.company.id, site_id=ctx.site.id, component_id=comp.id, label="Quartz top"
    )
    db_session.add(spec)
    await db_session.flush()
    resp = await client.post(f"/api/v1/specs/{spec.id}/route", headers=auth(ctx.owner))
    assert resp.status_code == 200, resp.text
    return (
        await db_session.execute(select(Decision).where(Decision.spec_id == spec.id))
    ).scalar_one()


async def _homeowner_question(client, ctx) -> str:
    resp = await client.post(
        "/api/v1/approvals",
        json={
            "site_id": str(ctx.site.id),
            "kind": "homeowner_question",
            "title": "Which side should the wardrobe open?",
        },
        headers=auth(ctx.owner),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_default_audience_rule():
    assert default_audience(DecisionKind.homeowner_question) is DecisionAudience.homeowner
    assert default_audience(DecisionKind.approval) is DecisionAudience.internal
    assert default_audience(DecisionKind.approval, spec_id=object()) is DecisionAudience.homeowner
    assert default_audience(DecisionKind.hold_payment) is DecisionAudience.internal
    assert default_audience(DecisionKind.generic) is DecisionAudience.internal


async def test_internal_approval_never_reaches_the_homeowner(client, ctx, db_session):
    invoice = await _internal_invoice(db_session, ctx)
    spec_decision = await _routed_spec_decision(client, ctx, db_session)
    question_id = await _homeowner_question(client, ctx)
    assert spec_decision.audience is DecisionAudience.homeowner

    listed = await client.get("/api/v1/homeowner/decisions", headers=auth(ctx.homeowner))
    assert listed.status_code == 200
    ids = {d["id"] for d in listed.json()}
    assert str(invoice.id) not in ids
    assert {str(spec_decision.id), question_id} <= ids

    home = await client.get("/api/v1/homeowner/home", headers=auth(ctx.homeowner))
    assert home.status_code == 200, home.text
    attention = {d["id"] for d in home.json()["needs_attention"]}
    assert str(invoice.id) not in attention
    assert {str(spec_decision.id), question_id} <= attention
    assert INVOICE not in home.text and INVOICE not in listed.text


async def test_homeowner_cannot_respond_to_an_internal_approval(client, ctx, db_session):
    invoice = await _internal_invoice(db_session, ctx)
    resp = await client.post(
        f"/api/v1/homeowner/decisions/{invoice.id}/respond",
        json={"action": "approve"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 404
    await db_session.refresh(invoice)
    assert invoice.state is DecisionState.pending


async def test_homeowner_is_kept_out_of_the_team_inbox(client, ctx, db_session):
    invoice = await _internal_invoice(db_session, ctx)
    invoice.site_id = None  # site-less decisions were visible company-wide
    await db_session.flush()
    for path in ("/api/v1/approvals", f"/api/v1/approvals/{invoice.id}"):
        resp = await client.get(path, headers=auth(ctx.homeowner))
        assert resp.status_code == 403, path


async def test_team_raised_approval_stays_internal(client, ctx):
    resp = await client.post(
        "/api/v1/approvals",
        json={"site_id": str(ctx.site.id), "kind": "approval", "title": "Approve scaffolding"},
        headers=auth(ctx.owner),
    )
    assert resp.status_code == 201
    listed = await client.get("/api/v1/homeowner/decisions", headers=auth(ctx.homeowner))
    assert resp.json()["id"] not in {d["id"] for d in listed.json()}
