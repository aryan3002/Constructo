"""Brief delivery + reply → one-ledger handoff (network-free)."""
from __future__ import annotations

from datetime import date

import pytest

from app.bot.brief_delivery import deliver_brief
from app.bot.reply_actions import apply_brief_reply
from app.extraction.llm import FakeLLMClient
from app.models import DecisionState, OwnerBrief


@pytest.mark.asyncio
async def test_deliver_brief_persists_reply_map_to_payload(world, fake_sender):
    d1 = await world.decision(title="Cement advance approve karna hai")
    d2 = await world.decision(title="Mistri ka payment")

    result = await deliver_brief(
        world.s, world.company.id, date.today(), llm=FakeLLMClient(canned={"text": "Sab theek."})
    )

    # reply_map maps tappable number -> decision id, persisted on the brief.
    assert result.reply_map == {"1": str(d1.id), "2": str(d2.id)}
    assert result.to == world.owner.phone
    assert result.sent.dm is True  # brief goes as a DM to the owner

    brief = await world.s.get(OwnerBrief, result.brief_id)
    assert brief.payload["reply_map"] == {"1": str(d1.id), "2": str(d2.id)}
    assert brief.sent_at is not None


@pytest.mark.asyncio
async def test_reply_number_resolves_decision(world, fake_sender):
    d1 = await world.decision(title="Cement advance approve karna hai")
    await deliver_brief(
        world.s, world.company.id, date.today(), llm=FakeLLMClient(canned={"text": "Brief."})
    )

    res = await apply_brief_reply(world.s, world.chat_jid, "1")
    assert res.handled is True
    assert res.verb == "approve"
    assert res.decision_id == d1.id

    await world.s.refresh(d1)
    assert d1.state is DecisionState.resolved
    # a confirmation went out
    assert any("approve" in t.lower() or "done" in t.lower() for t in fake_sender.texts)


@pytest.mark.asyncio
async def test_reply_is_idempotent(world, fake_sender):
    d1 = await world.decision(title="Approve cement")
    await deliver_brief(
        world.s, world.company.id, date.today(), llm=FakeLLMClient(canned={"text": "Brief."})
    )

    first = await apply_brief_reply(world.s, world.chat_jid, "approve")
    assert first.already is False
    second = await apply_brief_reply(world.s, world.chat_jid, "approve")
    assert second.already is True

    await world.s.refresh(d1)
    assert d1.state is DecisionState.resolved


@pytest.mark.asyncio
async def test_reply_hold_rejects_decision(world, fake_sender):
    d1 = await world.decision(title="Risky payment")
    await deliver_brief(
        world.s, world.company.id, date.today(), llm=FakeLLMClient(canned={"text": "Brief."})
    )
    res = await apply_brief_reply(world.s, world.chat_jid, "hold 1")
    assert res.verb == "hold"
    await world.s.refresh(d1)
    assert d1.state is DecisionState.rejected


@pytest.mark.asyncio
async def test_show_proof_reads_evidence_without_mutating(world, fake_sender):
    ev = await world.event(
        event_type="invoice_received", summary="Vendor invoice Rs 20000",
        on=date.today(),
    )
    d1 = await world.decision(title="Approve invoice", evidence=[ev.id])
    await deliver_brief(
        world.s, world.company.id, date.today(), llm=FakeLLMClient(canned={"text": "Brief."})
    )

    res = await apply_brief_reply(world.s, world.chat_jid, "show proof 1")
    assert res.verb == "proof"
    await world.s.refresh(d1)
    assert d1.state is DecisionState.pending  # unchanged
    assert any("Vendor invoice" in t for t in fake_sender.texts)


@pytest.mark.asyncio
async def test_reply_unmappable_is_unhandled(world, fake_sender):
    await world.decision(title="Something")
    await deliver_brief(
        world.s, world.company.id, date.today(), llm=FakeLLMClient(canned={"text": "Brief."})
    )
    res = await apply_brief_reply(world.s, world.chat_jid, "kuch bhi random")
    assert res.handled is False
