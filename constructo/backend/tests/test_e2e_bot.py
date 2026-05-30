"""W3 end-to-end: the WhatsApp bot ("Nivaan") wired into the live loop.

Network-free: FakeLLMClient for intent + the bot sender's default dry-run
transport (no BOT_SEND_VIA set), so nothing leaves the process.

Covers:
  1. inbound capture -> the bot reacts ✅ (Guest Rule),
  2. the extraction worker invokes the bot AND a bot failure never fails
     ingestion (resilience),
  3. a query -> a formatted, evidence-bearing answer,
  4. deliver_brief -> brief sent (DM) + number->decision reply_map persisted,
  5. a "hold" reply -> the decision is updated (idempotent) — the one-ledger handoff.
"""
from contextlib import asynccontextmanager
from datetime import date, datetime
from uuid import uuid4

import pytest_asyncio

from app.bot import sender
from app.bot.brief_delivery import deliver_brief
from app.bot.handle import handle_inbound
from app.extraction.llm import FakeLLMClient
from app.extraction.worker import handle_ingested
from app.models import (
    Decision,
    DecisionKind,
    DecisionState,
    OwnerBrief,
    RawMessageModel,
    SiteEventModel,
    UserRole,
    WhatsappGroup,
)


@pytest_asyncio.fixture(autouse=True)
async def _reset_sender():
    sender.reset_idempotency()
    yield
    sender.reset_idempotency()


def _session_factory(db_session):
    @asynccontextmanager
    async def factory():
        yield db_session

    return factory


async def _chat(factory, db_session, *, external="bot-grp"):
    """company + owner + site + a mapped WhatsApp group."""
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    group = WhatsappGroup(
        company_id=company.id,
        site_id=site.id,
        external_group_id=external,
        source="baileys",
        label="Site crew",
    )
    db_session.add(group)
    await db_session.flush()
    return company, owner, site, group


def _msg(external: str, text: str) -> RawMessageModel:
    return RawMessageModel(
        source="baileys",
        external_group_id=external,
        sender_id="s1",
        media_type="text",
        text=text,
        sent_at=datetime(2026, 5, 29, 9, 0),
        raw={},
    )


# 1. inbound capture -> ✅ reaction
async def test_e2e_inbound_capture_reacts(db_session, factory):
    _, _, _, group = await _chat(factory, db_session)
    msg = _msg(group.external_group_id, "32 mazdoor aaye, sab kaam pe")
    db_session.add(msg)
    await db_session.flush()

    res = await handle_inbound(db_session, msg.id, llm=FakeLLMClient())

    assert res.action == "reaction"
    assert res.sent is not None and res.sent.kind == "reaction"


# 2. the worker invokes the bot, and a bot failure never fails ingestion
async def test_e2e_worker_invokes_bot_and_is_resilient(db_session, factory, monkeypatch):
    _, _, site, group = await _chat(factory, db_session)
    msg = _msg(group.external_group_id, "32 mazdoor aaye")
    db_session.add(msg)
    await db_session.flush()

    called: list = []

    async def _boom(session, raw_message_id, **kw):
        called.append(raw_message_id)
        raise RuntimeError("bot exploded")

    monkeypatch.setattr("app.bot.handle.handle_inbound", _boom)

    ids = await handle_ingested(
        msg.id, session_factory=_session_factory(db_session), llm=FakeLLMClient()
    )

    assert len(ids) == 1  # ingestion succeeded despite the bot blowing up
    assert called == [msg.id]  # and the worker DID hand the message to the bot


# 3. query -> evidence-bearing answer
async def test_e2e_query_returns_evidence(db_session, factory):
    _, _, site, group = await _chat(factory, db_session)
    ev = SiteEventModel(
        site_id=site.id,
        event_type="material_delivery",
        occurred_on=date(2026, 5, 28),
        summary="100 bori cement aaya ACC se",
        fields={"material": "cement", "quantity": 100, "vendor": "ACC"},
        confidence=0.9,
        needs_clarification=False,
        source_message_ids=[],
        version=1,
    )
    msg = _msg(group.external_group_id, "Site par cement deliveries dikhao?")
    db_session.add_all([ev, msg])
    await db_session.flush()

    res = await handle_inbound(db_session, msg.id, llm=FakeLLMClient())

    assert res.action == "reply"
    assert res.sent is not None and res.sent.text
    assert "cement" in res.sent.text.lower()  # the answer carries its evidence


# 4 + 5. deliver brief (persist reply_map) then reply "hold" -> decision updated, idempotent
async def test_e2e_deliver_brief_and_reply_hold(db_session, factory):
    company, owner, site, group = await _chat(factory, db_session)
    decision = Decision(
        company_id=company.id,
        site_id=site.id,
        kind=DecisionKind.approval,
        title="Approve ACC cement invoice (₹72,000)?",
        assigned_to=owner.id,
        state=DecisionState.pending,
    )
    db_session.add(decision)
    await db_session.flush()

    delivery = await deliver_brief(db_session, company.id, date(2026, 5, 29), llm=FakeLLMClient())

    assert delivery.reply_map  # number -> decision_id map exists
    assert delivery.sent is not None and delivery.sent.dm is True  # brief DM'd to owner
    brief = await db_session.get(OwnerBrief, delivery.brief_id)
    assert (brief.payload or {}).get("reply_map")  # persisted into owner_briefs.payload

    # Owner replies "hold 1" in the chat -> the bot settles the SAME ledger row.
    reply = _msg(group.external_group_id, "hold 1")
    db_session.add(reply)
    await db_session.flush()
    hres = await handle_inbound(db_session, reply.id, llm=FakeLLMClient())
    assert hres.action == "brief_reply"

    await db_session.refresh(decision)
    assert decision.state == DecisionState.rejected  # hold -> rejected

    # Idempotent: replying again does not error and leaves the state settled.
    reply2 = _msg(group.external_group_id, "hold 1")
    reply2.id = uuid4()
    db_session.add(reply2)
    await db_session.flush()
    await handle_inbound(db_session, reply2.id, llm=FakeLLMClient())
    await db_session.refresh(decision)
    assert decision.state == DecisionState.rejected
