"""RedisBroadcaster: two instances (≈ two uvicorn workers / ACA replicas) sharing
one Redis must fan out publishes to each other's local subscribers."""
import asyncio
from uuid import uuid4

from app.chat.realtime import Broadcaster, RedisBroadcaster, get_broadcaster


class FakePubSub:
    def __init__(self, bus: "FakeRedis"):
        self.bus = bus
        self.queue: asyncio.Queue = asyncio.Queue()
        self.channels: set[str] = set()

    async def subscribe(self, *channels: str) -> None:
        for ch in channels:
            self.channels.add(ch)
            self.bus.subs.setdefault(ch, set()).add(self)

    async def unsubscribe(self, *channels: str) -> None:
        for ch in channels:
            self.channels.discard(ch)
            self.bus.subs.get(ch, set()).discard(self)

    async def get_message(self, ignore_subscribe_messages=True, timeout=None):
        try:
            return await asyncio.wait_for(self.queue.get(), timeout=timeout or 0.2)
        except TimeoutError:
            return None


class FakeRedis:
    def __init__(self):
        self.subs: dict[str, set[FakePubSub]] = {}

    def pubsub(self) -> FakePubSub:
        return FakePubSub(self)

    async def publish(self, channel: str, data: str) -> int:
        targets = list(self.subs.get(channel, ()))
        for ps in targets:
            ps.queue.put_nowait({"type": "message", "channel": channel, "data": data})
        return len(targets)


async def test_publish_crosses_workers():
    bus = FakeRedis()
    worker_a = RedisBroadcaster(bus)
    worker_b = RedisBroadcaster(bus)
    conv = uuid4()
    async with worker_b.subscribe(conv) as queue:
        await asyncio.sleep(0.05)  # listener subscribes
        await worker_a.publish(conv, {"v": 1, "type": "msg", "x": 1})
        frame = await asyncio.wait_for(queue.get(), timeout=2)
    assert frame == {"v": 1, "type": "msg", "x": 1}
    await worker_a.close()
    await worker_b.close()


async def test_local_subscriber_also_receives_own_publish():
    bus = FakeRedis()
    worker = RedisBroadcaster(bus)
    conv = uuid4()
    async with worker.subscribe(conv) as queue:
        await asyncio.sleep(0.05)
        await worker.publish(conv, {"v": 1, "type": "msg", "x": 2})
        frame = await asyncio.wait_for(queue.get(), timeout=2)
    assert frame["x"] == 2
    await worker.close()


def test_get_broadcaster_defaults_memory(monkeypatch):
    monkeypatch.setattr("app.config.settings.chat_realtime", "memory")
    get_broadcaster.cache_clear()
    assert isinstance(get_broadcaster(), Broadcaster)
    get_broadcaster.cache_clear()
