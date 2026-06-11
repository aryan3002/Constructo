"""Contested-truth gate: an open dispute on an event freezes approve/correct."""
from uuid import uuid4

from sqlalchemy import select

from app.extraction.worker import handle_ingested
from app.models import (
    ChatMessage,
    DisputeStatus,
    EventDispute,
    RawMessageModel,
    SiteEventModel,
    UserRole,
)
from tests.test_chat_api import _session_factory, auth


async def _approval_event(client, db_session, owner, site):
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "approve cement payment",
            "capture_type": "approval",
            "fields": {"status": "pending", "amount": 50000},
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    raw = (await db_session.execute(select(RawMessageModel))).scalars().one()
    await handle_ingested(raw.id, _session_factory(db_session))
    event = (
        await db_session.execute(
            select(SiteEventModel).where(SiteEventModel.event_type == "approval")
        )
    ).scalars().first()
    return resp.json(), event


async def test_approval_blocked_while_event_disputed(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    card_msg, event = await _approval_event(client, db_session, owner, site)
    assert event is not None

    db_session.add(
        EventDispute(
            company_id=company.id,
            site_id=site.id,
            event_id=event.id,
            raised_by=owner.id,
            raised_by_role=owner.role.value,
            reason="value looks wrong",
            status=DisputeStatus.open,
        )
    )
    await db_session.flush()

    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "haan theek hai",
            "reply_to_id": card_msg["id"],
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    out = resp.json()
    stored = await db_session.get(ChatMessage, out["id"])
    assert stored.meta is not None and stored.meta.get("blocked", {}).get("reason") == "contested"
    approvals = (
        await db_session.execute(
            select(SiteEventModel).where(
                SiteEventModel.event_type == "approval",
                SiteEventModel.version == 2,
            )
        )
    ).scalars().all()
    assert approvals == []  # no v2 approval — the value is frozen


async def test_approval_allowed_when_not_disputed(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    card_msg, event = await _approval_event(client, db_session, owner, site)
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "haan theek hai",
            "reply_to_id": card_msg["id"],
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    stored = await db_session.get(ChatMessage, resp.json()["id"])
    assert stored.meta is None
    v2 = (
        await db_session.execute(
            select(SiteEventModel).where(
                SiteEventModel.event_type == "approval", SiteEventModel.version == 2
            )
        )
    ).scalars().first()
    assert v2 is not None and v2.fields.get("status") == "approved"


async def _delivery_event(client, db_session, owner, site):
    """Send a delivery capture so a 'material_delivery' event (quantity=45)
    exists, return (card_message, event)."""
    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "45 bori cement aaya",
            "capture_type": "delivery",
            "fields": {"quantity": 45, "material": "cement"},
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    raw = (
        await db_session.execute(
            select(RawMessageModel).where(RawMessageModel.text == "45 bori cement aaya")
        )
    ).scalars().one()
    await handle_ingested(raw.id, _session_factory(db_session))
    event = (
        await db_session.execute(
            select(SiteEventModel).where(SiteEventModel.event_type == "material_delivery")
        )
    ).scalars().first()
    return resp.json(), event


async def test_authority_correction_blocked_while_event_disputed(client, db_session, factory):
    """An owner's numeric correction ('45 nahi 54') against a DISPUTED event must
    freeze — no superseding v2, the reply stamped meta.blocked (the correction-
    branch twin of the approval gate)."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    card_msg, event = await _delivery_event(client, db_session, owner, site)
    assert event is not None and event.fields.get("quantity") == 45

    db_session.add(
        EventDispute(
            company_id=company.id,
            site_id=site.id,
            event_id=event.id,
            raised_by=owner.id,
            raised_by_role=owner.role.value,
            reason="qty looks wrong",
            status=DisputeStatus.open,
        )
    )
    await db_session.flush()

    resp = await client.post(
        "/api/v1/chat/messages",
        json={
            "site_id": str(site.id),
            "client_msg_id": str(uuid4()),
            "body": "45 nahi 54",
            "reply_to_id": card_msg["id"],
        },
        headers=auth(owner),
    )
    assert resp.status_code == 201, resp.text
    stored = await db_session.get(ChatMessage, resp.json()["id"])
    assert stored.meta is not None and stored.meta.get("blocked", {}).get("reason") == "contested"
    v2 = (
        await db_session.execute(
            select(SiteEventModel).where(
                SiteEventModel.event_type == "material_delivery",
                SiteEventModel.version == 2,
            )
        )
    ).scalars().all()
    assert v2 == []  # frozen — no superseding correction written
