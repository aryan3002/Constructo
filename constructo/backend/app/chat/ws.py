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
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.access import can_access
from app.chat.presence import get_presence
from app.models import Conversation, User

_V = 1


class ChatSocketSession:
    def __init__(self, socket, user: User, session: AsyncSession, *, broadcaster) -> None:
        self._socket = socket
        self._user = user
        self._session = session
        self._broadcaster = broadcaster
        self._pumps: dict[UUID, asyncio.Task] = {}

    async def run(self) -> None:
        conn_id = uuid4().hex
        presence = get_presence()
        await presence.mark_online(str(self._user.id), conn_id)
        await self._socket.send_json({"v": _V, "type": "hello", "user_id": str(self._user.id)})
        # The receive loop IS the session lifecycle. Pumps stream concurrently to
        # the socket while the client is connected; an idle-but-connected client
        # simply blocks here in receive_json (the loop stays alive). On a real
        # disconnect receive_json raises, we fall through, and every pump is torn
        # down — no orphaned pump, no leaked DB session.
        try:
            while True:
                frame = await self._socket.receive_json()
                await self._handle(frame, conn_id=conn_id)
        except Exception:
            pass
        finally:
            # Presence cleanup is guaranteed-first; pump teardown follows.
            with contextlib.suppress(BaseException):
                await presence.mark_offline(str(self._user.id), conn_id)
            for task in self._pumps.values():
                task.cancel()
            for task in self._pumps.values():
                with contextlib.suppress(BaseException):
                    await task

    async def _handle(self, frame: dict, *, conn_id: str = "") -> None:
        kind = frame.get("type")
        if kind == "ping":
            # Refresh presence TTL so a long-lived socket stays 'online'.
            await get_presence().mark_online(str(self._user.id), conn_id)
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
        elif kind == "typing":
            conv_id = self._conv_id(frame)
            if conv_id and conv_id in self._pumps:
                await self._broadcaster.publish(
                    conv_id,
                    {"v": _V, "type": "typing", "conv": str(conv_id), "user_id": str(self._user.id)}
                )

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
