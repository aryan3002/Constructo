"""Real-time broadcaster core (2.0) — fan-out, isolation, cleanup, backpressure."""
import asyncio
from uuid import uuid4

import pytest

from app.chat.realtime import Broadcaster


@pytest.mark.asyncio
async def test_publish_reaches_all_subscribers_of_a_conversation():
    b = Broadcaster()
    conv = uuid4()
    async with b.subscribe(conv) as q1, b.subscribe(conv) as q2:
        assert b.subscriber_count(conv) == 2
        await b.publish(conv, {"seq": 1})
        assert (await asyncio.wait_for(q1.get(), 1))["seq"] == 1
        assert (await asyncio.wait_for(q2.get(), 1))["seq"] == 1


@pytest.mark.asyncio
async def test_conversations_are_isolated():
    b = Broadcaster()
    a, c = uuid4(), uuid4()
    async with b.subscribe(a) as qa, b.subscribe(c) as qc:
        await b.publish(a, {"seq": 7})
        assert (await asyncio.wait_for(qa.get(), 1))["seq"] == 7
        assert qc.empty()  # the other conversation never receives it


@pytest.mark.asyncio
async def test_unsubscribe_on_context_exit():
    b = Broadcaster()
    conv = uuid4()
    async with b.subscribe(conv):
        assert b.subscriber_count(conv) == 1
    assert b.subscriber_count(conv) == 0  # cleaned up, no leak


@pytest.mark.asyncio
async def test_publish_with_no_subscribers_is_a_noop():
    b = Broadcaster()
    await b.publish(uuid4(), {"seq": 1})  # must not raise


@pytest.mark.asyncio
async def test_full_queue_drops_frame_not_publisher():
    b = Broadcaster()
    conv = uuid4()
    async with b.subscribe(conv) as q:
        # Overfill past the bound; publish must never block or raise.
        for i in range(200):
            await b.publish(conv, {"seq": i})
        assert q.qsize() <= 100
