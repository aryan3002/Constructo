"""WS protocol v2 (spine A3) — one multiplexed socket per device.

ChatSocketSession is the TESTABLE core: it speaks the frame protocol over any
object with receive_json/send_json/close, against an injected broadcaster and DB
session. The FastAPI endpoint is thin glue (ticket auth + construct + run).

Protocol (all frames {"v": 1, "type": ...}):
  client→server : sub{convs:[{id, after_seq}]} · unsub{conv} · delivered{conv,seq}
                  · read{conv,seq} · ping
  server→client : hello{user_id} · sub_ok{conv,last_seq} · msg{conv,payload}
                  · event_update{conv,message_id,...} · receipt{conv,user_id,kind,seq}
                  · pong · error{code}
History never replays over WS — sub_ok carries last_seq and the client backfills
the gap over REST (one sync path)."""
from __future__ import annotations

import asyncio
import contextlib
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.access import can_access
from app.models import Conversation, User

_V = 1


class ChatSocketSession:
    def __init__(self, socket, user: User, session: AsyncSession, *, broadcaster) -> None:
        self._socket = socket
        self._user = user
        self._session = session
        self._broadcaster = broadcaster
        self._pumps: dict[UUID, asyncio.Task] = {}
        self._reader: asyncio.Task | None = None

    async def run(self) -> None:
        await self._socket.send_json({"v": _V, "type": "hello", "user_id": str(self._user.id)})
        # Receive loop and the per-conversation pumps run concurrently against one
        # socket. When the reader stops (a real disconnect raises in receive_json,
        # or the client just goes quiet) the pumps stay live so already-subscribed
        # conversations keep streaming — the session ends only when run() itself is
        # cancelled (FastAPI cancels it on connection teardown). On a genuinely
        # dead socket the pump's own send_json raises and that pump self-retires.
        self._reader = asyncio.create_task(self._receive_loop())
        try:
            await self._supervise()
        finally:
            for task in (self._reader, *self._pumps.values()):
                task.cancel()
            for task in (self._reader, *self._pumps.values()):
                with contextlib.suppress(BaseException):
                    await task

    async def _supervise(self) -> None:
        # Keep the session alive while the reader is alive OR a pump is still
        # streaming. On a real disconnect the reader ends AND every pump's
        # send_json soon raises (dead socket), so this drains and returns — no
        # leaked DB session. External cancellation (FastAPI on teardown) also
        # ends it immediately.
        while True:
            self._pumps = {c: t for c, t in self._pumps.items() if not t.done()}
            if self._reader.done() and not self._pumps:
                return
            await asyncio.sleep(0.05)

    async def _receive_loop(self) -> None:
        try:
            while True:
                frame = await self._socket.receive_json()
                await self._handle(frame)
        except Exception:
            return

    async def _handle(self, frame: dict) -> None:
        kind = frame.get("type")
        if kind == "ping":
            await self._socket.send_json({"v": _V, "type": "pong"})
        elif kind == "sub":
            for entry in frame.get("convs", []):
                await self._subscribe(entry)
        elif kind == "unsub":
            task = self._pumps.pop(self._conv_id(frame), None)
            if task:
                task.cancel()
        elif kind in ("delivered", "read"):
            await self._cursor(frame, read=(kind == "read"))

    @staticmethod
    def _conv_id(frame: dict) -> UUID | None:
        try:
            return UUID(str(frame.get("conv") or frame.get("id")))
        except (ValueError, TypeError):
            return None

    async def _subscribe(self, entry: dict) -> None:
        conv_id = self._conv_id(entry)
        if conv_id is None or conv_id in self._pumps:
            return
        conv = await self._session.get(Conversation, conv_id)
        if conv is None or not await can_access(self._session, self._user, conv):
            await self._socket.send_json(
                {"v": _V, "type": "error", "code": "forbidden", "conv": str(conv_id)}
            )
            return
        await self._socket.send_json(
            {"v": _V, "type": "sub_ok", "conv": str(conv_id), "last_seq": conv.last_seq}
        )
        self._pumps[conv_id] = asyncio.create_task(self._pump(conv_id))

    async def _pump(self, conv_id: UUID) -> None:
        async with self._broadcaster.subscribe(conv_id) as queue:
            while True:
                await self._socket.send_json(await queue.get())

    async def _cursor(self, frame: dict, *, read: bool) -> None:
        # Import here: router imports ws (avoid the cycle).
        from app.chat.router import _advance_cursor, _publish_receipt

        conv_id = self._conv_id(frame)
        seq = frame.get("seq")
        # No self._pumps gate: _advance_cursor re-resolves access (require_access),
        # so a cursor frame is safe even for a conversation we aren't pumping.
        if conv_id is None or not isinstance(seq, int):
            return
        conv = await _advance_cursor(
            self._session, self._user, site_id=None, conversation_id=conv_id,
            last_seq=seq, read=read,
        )
        await _publish_receipt(conv, self._user, "read" if read else "delivered", seq)
