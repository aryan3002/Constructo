"""ChatSocketSession protocol: sub/sub_ok, live msg frames, delivered/read, ping."""
import asyncio

import pytest_asyncio

from app.chat.realtime import Broadcaster
from app.chat.ws import ChatSocketSession
from app.models import Conversation, ConversationKind, UserRole


class FakeSocket:
    def __init__(self, incoming: list[dict]):
        self._incoming = list(incoming)
        self.sent: list[dict] = []
        self.closed = False

    async def receive_json(self) -> dict:
        if self._incoming:
            return self._incoming.pop(0)
        # Idle but connected: a real socket blocks here waiting for the next client
        # frame. (A genuine disconnect would raise — see the disconnect test.)
        await asyncio.Event().wait()

    async def send_json(self, frame: dict) -> None:
        self.sent.append(frame)

    async def close(self, code: int = 1000) -> None:
        self.closed = True


@pytest_asyncio.fixture
async def conv_world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site, last_seq=7
    )
    db_session.add(conv)
    await db_session.flush()
    return owner, conv


async def test_sub_returns_sub_ok_with_last_seq_and_streams(db_session, conv_world):
    owner, conv = conv_world
    bus = Broadcaster()
    sock = FakeSocket([{"v": 1, "type": "sub", "convs": [{"id": str(conv.id), "after_seq": 0}]}])
    session_obj = ChatSocketSession(sock, owner, db_session, broadcaster=bus)
    task = asyncio.create_task(session_obj.run())
    await asyncio.sleep(0.1)
    assert {"v": 1, "type": "sub_ok", "conv": str(conv.id), "last_seq": 7} in sock.sent
    await bus.publish(conv.id, {"v": 1, "type": "msg", "conv": str(conv.id), "payload": {"seq": 8}})
    await asyncio.sleep(0.1)
    assert any(f["type"] == "msg" and f["payload"]["seq"] == 8 for f in sock.sent)
    task.cancel()


async def test_sub_to_inaccessible_conversation_errors(db_session, factory, conv_world):
    _, conv = conv_world
    stranger = await factory.user(role=UserRole.supervisor)  # different company
    sock = FakeSocket([{"v": 1, "type": "sub", "convs": [{"id": str(conv.id), "after_seq": 0}]}])
    session_obj = ChatSocketSession(sock, stranger, db_session, broadcaster=Broadcaster())
    task = asyncio.create_task(session_obj.run())
    await asyncio.sleep(0.1)
    assert any(f["type"] == "error" and f["code"] == "forbidden" for f in sock.sent)
    task.cancel()


async def test_ping_pong_and_delivered_frame(db_session, conv_world):
    owner, conv = conv_world
    sock = FakeSocket([
        {"v": 1, "type": "ping"},
        {"v": 1, "type": "delivered", "conv": str(conv.id), "seq": 5},
    ])
    session_obj = ChatSocketSession(sock, owner, db_session, broadcaster=Broadcaster())
    task = asyncio.create_task(session_obj.run())
    await asyncio.sleep(0.15)
    assert {"v": 1, "type": "pong"} in sock.sent
    from app.models import ConversationRead

    cur = await db_session.get(ConversationRead, (conv.id, owner.id))
    assert cur is not None and cur.last_delivered_seq == 5
    task.cancel()


async def test_typing_frame_relays_to_subscribers_with_user_id(db_session, conv_world):
    """A subscribed member's `typing` frame is fanned out to the conversation's
    subscribers, carrying the sender's user_id so clients can drop their own.
    (Asserted at the broadcaster boundary to avoid racing the pump's own queue
    registration — the fan-out itself is exercised by the msg-stream test.)"""
    owner, conv = conv_world
    published: list[tuple] = []
    bus = Broadcaster()
    orig_publish = bus.publish

    async def spy(cid, frame):
        published.append((cid, frame))
        await orig_publish(cid, frame)

    bus.publish = spy  # type: ignore[method-assign]
    sock = FakeSocket([
        {"v": 1, "type": "sub", "convs": [{"id": str(conv.id), "after_seq": 0}]},
        {"v": 1, "type": "typing", "conv": str(conv.id)},
    ])
    session_obj = ChatSocketSession(sock, owner, db_session, broadcaster=bus)
    task = asyncio.create_task(session_obj.run())
    await asyncio.sleep(0.15)
    assert (
        conv.id,
        {"v": 1, "type": "typing", "conv": str(conv.id), "user_id": str(owner.id)},
    ) in published
    task.cancel()


async def test_typing_frame_ignored_when_sender_not_subscribed(db_session, conv_world):
    """Membership gate: a `typing` frame for a conversation the sender has NOT
    subscribed to (no pump ⇒ access never proven) must NOT be relayed."""
    owner, conv = conv_world
    published: list[tuple] = []
    bus = Broadcaster()
    orig_publish = bus.publish

    async def spy(cid, frame):
        published.append((cid, frame))
        await orig_publish(cid, frame)

    bus.publish = spy  # type: ignore[method-assign]
    sock = FakeSocket([{"v": 1, "type": "typing", "conv": str(conv.id)}])
    session_obj = ChatSocketSession(sock, owner, db_session, broadcaster=bus)
    task = asyncio.create_task(session_obj.run())
    await asyncio.sleep(0.1)
    assert not any(f.get("type") == "typing" for _, f in published)
    assert not any(f.get("type") == "typing" for f in sock.sent)
    task.cancel()


async def test_disconnect_tears_down_idle_pump_promptly(db_session, conv_world):
    """A real disconnect (receive_json raises) must end run() even when a
    subscribed conversation is idle — no orphaned pump, no leaked session."""
    owner, conv = conv_world

    class DisconnectingSocket(FakeSocket):
        async def receive_json(self) -> dict:
            if self._incoming:
                return self._incoming.pop(0)
            raise ConnectionError("client disconnected")

    sock = DisconnectingSocket(
        [{"v": 1, "type": "sub", "convs": [{"id": str(conv.id), "after_seq": 0}]}]
    )
    session_obj = ChatSocketSession(sock, owner, db_session, broadcaster=Broadcaster())
    # Must return promptly — if run() hangs on the idle pump, this times out (the bug).
    await asyncio.wait_for(session_obj.run(), timeout=2)
