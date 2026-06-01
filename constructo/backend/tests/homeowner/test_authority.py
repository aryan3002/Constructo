"""H5 money-safety: the sub-role authority gate on decision responses.

Closes the hole where ANY household member (family, advisor) could *approve* a
cost-bearing decision. Approving commits money/scope, so it is reserved for
``primary_owner``/``co_owner``. Everyone may always comment — "advise, never
gatekeep": a family member's voice is never silenced, only the authority to
COMMIT is reserved. The 403 is a graceful handoff (carries ``can_comment``),
not a wall.
"""
from types import SimpleNamespace

import pytest_asyncio

from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    HomeownerMember,
    HomeownerSubRole,
    MemberStatus,
    UserRole,
)

from .conftest import auth


@pytest_asyncio.fixture
async def family(factory, db_session, ctx):
    """A 'family' member on the same site as ctx — can comment, cannot approve."""
    user = await factory.user(company=ctx.company, role=UserRole.homeowner)
    member = HomeownerMember(
        site_id=ctx.site.id,
        user_id=user.id,
        sub_role=HomeownerSubRole.family,
        status=MemberStatus.active,
    )
    db_session.add(member)
    await db_session.flush()
    return SimpleNamespace(user=user, member=member)


async def _pending_cost_decision(db_session, ctx) -> Decision:
    decision = Decision(
        company_id=ctx.company.id,
        site_id=ctx.site.id,
        kind=DecisionKind.homeowner_question,
        title="Approve the ₹40,000 marble upgrade?",
        state=DecisionState.pending,
    )
    db_session.add(decision)
    await db_session.flush()
    return decision


async def test_family_cannot_approve_cost_decision(client, ctx, db_session, family):
    decision = await _pending_cost_decision(db_session, ctx)

    resp = await client.post(
        f"/api/v1/homeowner/decisions/{decision.id}/respond",
        json={"action": "approve", "note": "go ahead"},
        headers=auth(family.user),
    )
    assert resp.status_code == 403, resp.text
    # Graceful handoff, not a bare wall: the client can still offer a comment box.
    err = resp.json()["error"]
    assert err["can_comment"] is True

    # The decision is untouched — no silent money commit.
    await db_session.refresh(decision)
    assert decision.state == DecisionState.pending


async def test_family_can_still_comment(client, ctx, db_session, family):
    decision = await _pending_cost_decision(db_session, ctx)

    resp = await client.post(
        f"/api/v1/homeowner/decisions/{decision.id}/respond",
        json={"action": "comment", "note": "I like this one"},
        headers=auth(family.user),
    )
    assert resp.status_code == 200, resp.text


async def test_primary_owner_can_approve(client, ctx, db_session):
    decision = await _pending_cost_decision(db_session, ctx)

    resp = await client.post(
        f"/api/v1/homeowner/decisions/{decision.id}/respond",
        json={"action": "approve"},
        headers=auth(ctx.homeowner),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["state"] == "resolved"


async def test_capabilities_reflects_sub_role(client, ctx, family):
    owner_caps = await client.get(
        "/api/v1/homeowner/me/capabilities", headers=auth(ctx.homeowner)
    )
    assert owner_caps.status_code == 200, owner_caps.text
    assert owner_caps.json()["can_approve"] is True

    family_caps = await client.get(
        "/api/v1/homeowner/me/capabilities", headers=auth(family.user)
    )
    assert family_caps.status_code == 200, family_caps.text
    body = family_caps.json()
    assert body["can_approve"] is False
    assert body["can_comment"] is True
    assert body["sub_role"] == "family"
