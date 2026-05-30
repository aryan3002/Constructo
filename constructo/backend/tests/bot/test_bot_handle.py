"""handle_inbound — Guest Rule end-to-end with a fake sender (network-free)."""
from __future__ import annotations

from datetime import date

import pytest

from app.bot.handle import handle_inbound
from app.bot.intents import Intent
from app.extraction.llm import FakeLLMClient


@pytest.mark.asyncio
async def test_routine_capture_reacts_not_narrates(world, fake_sender):
    msg = await world.inbound("aaj 10 bori cement aa gaya")
    result = await handle_inbound(world.s, msg.id, llm=FakeLLMClient())
    assert result.action == "reaction"
    # Guest Rule: exactly one reaction, no text spam.
    assert len(fake_sender.reactions) == 1
    assert fake_sender.texts == []


@pytest.mark.asyncio
async def test_query_returns_answer_with_evidence(world, fake_sender):
    await world.event(
        event_type="attendance", summary="10 mazdoor aaye Site A pe",
        on=date.today(), fields={"headcount": 10},
    )
    msg = await world.inbound("kitne mazdoor aaye Site A?")
    result = await handle_inbound(world.s, msg.id, llm=FakeLLMClient())
    assert result.intent is Intent.query
    assert result.action == "reply"
    assert len(fake_sender.texts) == 1
    answer = fake_sender.texts[0]
    assert "10 mazdoor" in answer  # the data
    assert "Site A" in answer  # the evidence (which site)


@pytest.mark.asyncio
async def test_query_no_data_is_honest(world, fake_sender):
    msg = await world.inbound("kitne mazdoor aaye Site A?")
    result = await handle_inbound(world.s, msg.id, llm=FakeLLMClient())
    assert result.action == "reply"
    assert "nahi" in fake_sender.texts[0].lower()


@pytest.mark.asyncio
async def test_sensitive_query_goes_to_owner_dm_not_group(world, fake_sender):
    await world.event(
        event_type="payment_request", summary="advance Rs 50000 ka request",
        on=date.today(), fields={"amount": 50000},
    )
    msg = await world.inbound("payment kitna chahiye?")
    result = await handle_inbound(world.s, msg.id, llm=FakeLLMClient())
    # The sensitive answer must DM the owner, never post to the group.
    assert len(fake_sender.dms) == 1
    dm = fake_sender.dms[0]
    assert dm["to"] == world.owner.phone
    assert result.action == "dm"


@pytest.mark.asyncio
async def test_help_replies_once(world, fake_sender):
    msg = await world.inbound("help")
    result = await handle_inbound(world.s, msg.id, llm=FakeLLMClient())
    assert result.intent is Intent.help
    assert len(fake_sender.texts) == 1
    assert "Nivaan" in fake_sender.texts[0]


@pytest.mark.asyncio
async def test_unknown_message_id_is_silent(world, fake_sender):
    from uuid import uuid4

    result = await handle_inbound(world.s, uuid4(), llm=FakeLLMClient())
    assert result.action == "silent"
    assert fake_sender.calls == []
