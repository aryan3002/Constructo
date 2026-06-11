# Chat Reliability Spine (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Constructo's in-app chat never lose a message: durable client outbox, multi-worker realtime (Redis pub/sub), delivered/read receipts, push fallback, extraction status/retry, and kill-criteria metrics.

**Architecture:** Postgres (Neon) stays the only ordering/durability authority (per-conversation gap-free `seq`); Redis pub/sub is a transient fan-out bus behind the existing `Broadcaster` interface; the mobile client gets an AsyncStorage-backed durable outbox + message cache + a reconnecting multiplexed WebSocket with REST `after_seq` as the one sync path. Full rationale: `docs/CHAT-RELIABILITY-DESIGN.md`.

**Tech Stack:** FastAPI + async SQLAlchemy + Alembic + RQ/Redis (`redis>=5.2` already a dep) on the backend (pytest); Expo/React Native + AsyncStorage + NetInfo + expo-notifications on mobile (jest). Backend verification: `uv run ruff check . && uv run pytest`. Mobile verification: `npm run typecheck && npx jest`.

**Branch:** `feat/chat-reliability-spine` (use superpowers:using-git-worktrees at execution time).

**Scope decision (per writing-plans scope check):** Phase A only, in full TDD detail — it produces working, testable software on its own. Phase B (intelligence/membrane) and Phase C (WhatsApp migration + DPDP) are independent subsystems; their scoped task lists are at the bottom and each gets its own plan file when Phase A ships.

**Conventions used below** (match existing tests): fixtures `client` (httpx AsyncClient), `db_session`, `factory` from `tests/conftest.py`; `auth(user)` header helper and `world` fixture as in `tests/test_chat_api.py`; `_session_factory(db_session)` for worker calls. All backend paths relative to `constructo/backend/`, mobile paths relative to `constructo/mobile/`.

---

### Task 1: Spine schema — cursors, sender_kind/meta, raw-message status

**Files:**
- Modify: `app/models/chat.py` (ChatMessage + ConversationRead)
- Modify: `app/models/raw_message.py`
- Modify: `app/models/__init__.py` (export `SenderKind`)
- Create: `alembic/versions/<autogen>_chat_reliability_spine.py`
- Test: `tests/test_chat_spine_models.py`

- [ ] **Step 1: Write the failing test**

```python
"""Spine schema deltas: delivered cursor, sender_kind/meta, raw status."""
from uuid import uuid4

from sqlalchemy import select

from app.models import (
    ChatMessage,
    Conversation,
    ConversationKind,
    ConversationRead,
    MessageSide,
    RawMessageModel,
    SenderKind,
)


async def test_chat_message_defaults_sender_kind_user_and_null_meta(db_session, factory):
    company = await factory.company()
    user = await factory.user(company=company)
    site = await factory.site(company)
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.site, last_seq=1
    )
    db_session.add(conv)
    await db_session.flush()
    msg = ChatMessage(
        conversation_id=conv.id,
        sender_id=user.id,
        sender_side=MessageSide.contractor,
        client_msg_id=uuid4(),
        seq=1,
    )
    db_session.add(msg)
    await db_session.flush()
    await db_session.refresh(msg)
    assert msg.sender_kind is SenderKind.user
    assert msg.meta is None


async def test_conversation_read_has_delivered_cursor_default_zero(db_session, factory):
    company = await factory.company()
    user = await factory.user(company=company)
    site = await factory.site(company)
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(conv)
    await db_session.flush()
    cur = ConversationRead(conversation_id=conv.id, user_id=user.id, last_read_seq=3)
    db_session.add(cur)
    await db_session.flush()
    await db_session.refresh(cur)
    assert cur.last_delivered_seq == 0


async def test_raw_message_status_defaults_pending(db_session):
    from datetime import UTC, datetime

    row = RawMessageModel(
        source="app_chat",
        external_group_id="app:x",
        sender_id="u",
        media_type="text",
        text="hi",
        sent_at=datetime.now(UTC),
        raw={},
    )
    db_session.add(row)
    await db_session.flush()
    await db_session.refresh(row)
    assert row.status == "pending"
    assert row.attempts == 0
    assert row.last_error is None
    assert row.provider_message_id is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_chat_spine_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'SenderKind'`

- [ ] **Step 3: Implement the model changes**

In `app/models/chat.py`, add the enum next to `MessageSide` and columns to the two models:

```python
class SenderKind(StrEnum):
    user = "user"      # a human member
    nivaan = "nivaan"  # the AI (Phase B; rows are real, seq-ordered)
    system = "system"  # membrane/system notices ("member added", provenance)
```

In `ChatMessage` (after `sender_side`):

```python
    # Who/what authored this row (Phase B uses nivaan/system; default human).
    sender_kind: Mapped[SenderKind] = mapped_column(
        SAEnum(SenderKind, name="sender_kind"), nullable=False, server_default="user"
    )
```

and (after `media_type`):

```python
    # Machine payloads only (proposal cards, provenance, blocked-action notices) —
    # never rendered as free text.
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

Add the import: `from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID`.

In `ConversationRead` (after `last_read_seq`) — the per-member cursor pair:

```python
    # Delivered cursor (✓✓): client advances after persisting messages locally.
    # Monotonic max, gap-free seq ⇒ "delivered through N" is well-defined.
    last_delivered_seq: Mapped[int] = mapped_column(
        BigInteger, nullable=False, server_default="0"
    )
```

In `app/models/raw_message.py`, add columns (after `raw`) + the dedupe index:

```python
    # Extraction lifecycle (spine A7): pending → processing → done|failed|skipped.
    status: Mapped[str] = mapped_column(String, nullable=False, server_default="pending")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Provider-assigned id (Cloud API message id) — webhook re-deliveries dedupe here.
    provider_message_id: Mapped[str | None] = mapped_column(String, nullable=True)
```

with `Integer, Text` added to the sqlalchemy imports, and in `__table_args__`:

```python
    __table_args__ = (
        Index(
            "uq_raw_provider_message",
            "source",
            "provider_message_id",
            unique=True,
            postgresql_where=text("provider_message_id IS NOT NULL"),
        ),
    )
```

(import `Index, text` from sqlalchemy). Export `SenderKind` from `app/models/__init__.py` alongside the other chat exports.

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_chat_spine_models.py tests/test_chat_api.py -v`
Expected: PASS (create_all picks up the new columns; existing chat tests unaffected)

- [ ] **Step 5: Write the Alembic migration**

Run: `uv run alembic revision -m "chat reliability spine"` and fill in:

```python
def upgrade() -> None:
    sender_kind = sa.Enum("user", "nivaan", "system", name="sender_kind")
    sender_kind.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "chat_messages",
        sa.Column("sender_kind", sender_kind, nullable=False, server_default="user"),
    )
    op.add_column(
        "chat_messages",
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "conversation_reads",
        sa.Column("last_delivered_seq", sa.BigInteger(), nullable=False, server_default="0"),
    )
    op.add_column(
        "raw_messages",
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
    )
    op.add_column(
        "raw_messages",
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("raw_messages", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column("raw_messages", sa.Column("provider_message_id", sa.String(), nullable=True))
    op.create_index(
        "uq_raw_provider_message",
        "raw_messages",
        ["source", "provider_message_id"],
        unique=True,
        postgresql_where=sa.text("provider_message_id IS NOT NULL"),
    )
    # Pre-existing rows were already processed — don't flag them pending.
    op.execute("UPDATE raw_messages SET status = 'done'")


def downgrade() -> None:
    op.drop_index("uq_raw_provider_message", table_name="raw_messages")
    op.drop_column("raw_messages", "provider_message_id")
    op.drop_column("raw_messages", "last_error")
    op.drop_column("raw_messages", "attempts")
    op.drop_column("raw_messages", "status")
    op.drop_column("conversation_reads", "last_delivered_seq")
    op.drop_column("chat_messages", "meta")
    op.drop_column("chat_messages", "sender_kind")
    sa.Enum(name="sender_kind").drop(op.get_bind(), checkfirst=True)
```

(`from sqlalchemy.dialects import postgresql` at top.)

- [ ] **Step 6: Verify + commit**

Run: `uv run ruff check . && uv run pytest`
Expected: clean + all green

```bash
git add app/models/ alembic/versions/ tests/test_chat_spine_models.py
git commit -m "feat(chat): spine schema — delivered cursor, sender_kind/meta, raw status + provider dedupe"
```

---

### Task 2: RedisBroadcaster — cross-worker fan-out behind the existing seam

**Files:**
- Modify: `app/chat/realtime.py`
- Modify: `app/config.py` (add `chat_realtime: str = "memory"`)
- Modify: `app/chat/router.py:39,681` (import + use `get_broadcaster()`)
- Test: `tests/test_realtime_redis.py`

- [ ] **Step 1: Write the failing test (with an in-test fake async Redis bus)**

```python
"""RedisBroadcaster: two instances (≈ two uvicorn workers / ACA replicas) sharing
one Redis must fan out publishes to each other's local subscribers."""
import asyncio
import json
from uuid import uuid4

import pytest

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_realtime_redis.py -v`
Expected: FAIL — `ImportError: cannot import name 'RedisBroadcaster'`

- [ ] **Step 3: Implement RedisBroadcaster + get_broadcaster**

Append to `app/chat/realtime.py`:

```python
import json
from functools import cache

_CHANNEL_PREFIX = "chat:"


class RedisBroadcaster:
    """Cross-worker fan-out: publish → Redis PUBLISH; one listener task per
    process pumps Redis frames into a local :class:`Broadcaster`. Redis is a
    TRANSIENT bus — a dropped frame is recovered by the client's after_seq
    refetch; Neon stays the ordering authority. Same public interface as
    :class:`Broadcaster` (the documented seam)."""

    def __init__(self, redis, local: Broadcaster | None = None) -> None:
        self._redis = redis
        self._local = local or Broadcaster()
        self._pubsub = None
        self._listener: asyncio.Task | None = None

    async def publish(self, conversation_id: UUID, payload: dict) -> None:
        try:
            await self._redis.publish(
                f"{_CHANNEL_PREFIX}{conversation_id}", json.dumps(payload)
            )
        except Exception:  # pragma: no cover - defensive
            # Redis down: degrade to local-only (correct on one replica); the
            # client resync covers cross-replica gaps.
            await self._local.publish(conversation_id, payload)

    @asynccontextmanager
    async def subscribe(self, conversation_id: UUID) -> AsyncIterator[asyncio.Queue]:
        await self._ensure_listener()
        await self._pubsub.subscribe(f"{_CHANNEL_PREFIX}{conversation_id}")
        try:
            async with self._local.subscribe(conversation_id) as queue:
                yield queue
        finally:
            if self._local.subscriber_count(conversation_id) == 0:
                try:
                    await self._pubsub.unsubscribe(f"{_CHANNEL_PREFIX}{conversation_id}")
                except Exception:  # pragma: no cover - defensive
                    pass

    async def _ensure_listener(self) -> None:
        if self._pubsub is None:
            self._pubsub = self._redis.pubsub()
        if self._listener is None or self._listener.done():
            self._listener = asyncio.create_task(self._listen())

    async def _listen(self) -> None:
        while True:
            try:
                message = await self._pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
            except asyncio.CancelledError:  # pragma: no cover
                return
            except Exception:  # pragma: no cover - bus hiccup; retry
                await asyncio.sleep(0.5)
                continue
            if message is None or message.get("type") != "message":
                continue
            channel = message["channel"]
            if isinstance(channel, bytes):
                channel = channel.decode()
            try:
                conv_id = UUID(channel.removeprefix(_CHANNEL_PREFIX))
                payload = json.loads(message["data"])
            except (ValueError, TypeError):  # pragma: no cover - malformed frame
                continue
            await self._local.publish(conv_id, payload)

    async def close(self) -> None:
        if self._listener is not None:
            self._listener.cancel()
            try:
                await self._listener
            except (asyncio.CancelledError, Exception):  # pragma: no cover
                pass


@cache
def get_broadcaster():
    """Process-wide broadcaster, selected by settings.chat_realtime."""
    from app.config import settings

    if settings.chat_realtime == "redis":
        import redis.asyncio as aioredis

        return RedisBroadcaster(aioredis.from_url(settings.redis_url))
    return Broadcaster()
```

In `app/config.py` add next to `redis_url`:

```python
    # Chat realtime fan-out: "memory" (single process; tests/dev) or "redis"
    # (multi-worker / multi-replica prod).
    chat_realtime: str = "memory"
```

In `app/chat/router.py`: change the import at line 39 to `from app.chat.realtime import get_broadcaster` and line 681 to `await get_broadcaster().publish(conv.id, out.model_dump(mode="json"))`. Keep the module-level `broadcaster = Broadcaster()` singleton in realtime.py (the existing `tests/test_realtime_broadcaster.py` covers the local class; `get_broadcaster()` is the runtime entry).

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_realtime_redis.py tests/test_realtime_broadcaster.py tests/test_chat_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/chat/realtime.py app/config.py app/chat/router.py tests/test_realtime_redis.py
git commit -m "feat(chat): RedisBroadcaster — cross-worker realtime fan-out behind the Broadcaster seam"
```

---

### Task 3: One-time WebSocket tickets (no JWT in URLs)

**Files:**
- Create: `app/chat/tickets.py`
- Modify: `app/chat/router.py` (add `POST /ws-ticket`)
- Test: `tests/test_chat_ws_tickets.py`

- [ ] **Step 1: Write the failing test**

```python
"""WS tickets: short-lived, single-use, JWT-authed issuance."""
from app.chat.tickets import InMemoryTicketStore, get_ticket_store
from tests.test_chat_api import auth  # reuse the header helper


async def test_issue_and_consume_once():
    store = InMemoryTicketStore()
    ticket = await store.issue("user-123")
    assert await store.consume(ticket) == "user-123"
    assert await store.consume(ticket) is None  # single-use


async def test_expired_ticket_rejected():
    store = InMemoryTicketStore(ttl_seconds=0)
    ticket = await store.issue("user-123")
    assert await store.consume(ticket) is None


async def test_ws_ticket_endpoint_requires_auth_and_issues(client, factory):
    company = await factory.company()
    user = await factory.user(company=company)
    resp = await client.post("/api/v1/chat/ws-ticket")
    assert resp.status_code in (401, 403)
    resp = await client.post("/api/v1/chat/ws-ticket", headers=auth(user))
    assert resp.status_code == 200
    ticket = resp.json()["ticket"]
    assert await get_ticket_store().consume(ticket) == str(user.id)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_chat_ws_tickets.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.chat.tickets'`

- [ ] **Step 3: Implement the ticket store + endpoint**

Create `app/chat/tickets.py`:

```python
"""One-time WebSocket auth tickets (spine A2).

A JWT in a WS query string leaks via proxy/access logs; a 60s single-use ticket
does not. Redis-backed in prod (any replica can consume a ticket issued by
another); in-memory for tests/dev single-process."""
from __future__ import annotations

import time
from functools import cache
from uuid import uuid4

_TTL_SECONDS = 60
_PREFIX = "wsticket:"


class InMemoryTicketStore:
    def __init__(self, ttl_seconds: int = _TTL_SECONDS) -> None:
        self._ttl = ttl_seconds
        self._tickets: dict[str, tuple[str, float]] = {}

    async def issue(self, user_id: str) -> str:
        ticket = uuid4().hex
        self._tickets[ticket] = (user_id, time.monotonic() + self._ttl)
        return ticket

    async def consume(self, ticket: str) -> str | None:
        entry = self._tickets.pop(ticket, None)
        if entry is None:
            return None
        user_id, expires = entry
        return user_id if time.monotonic() < expires else None


class RedisTicketStore:
    def __init__(self, redis, ttl_seconds: int = _TTL_SECONDS) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    async def issue(self, user_id: str) -> str:
        ticket = uuid4().hex
        await self._redis.set(f"{_PREFIX}{ticket}", user_id, ex=self._ttl)
        return ticket

    async def consume(self, ticket: str) -> str | None:
        # GETDEL: atomic single-use across replicas.
        value = await self._redis.getdel(f"{_PREFIX}{ticket}")
        if value is None:
            return None
        return value.decode() if isinstance(value, bytes) else str(value)


@cache
def get_ticket_store():
    from app.config import settings

    if settings.chat_realtime == "redis":
        import redis.asyncio as aioredis

        return RedisTicketStore(aioredis.from_url(settings.redis_url))
    return InMemoryTicketStore()
```

In `app/chat/router.py` add (near the other small endpoints):

```python
from app.chat.tickets import get_ticket_store


class WsTicketOut(BaseModel):
    ticket: str


@router.post("/ws-ticket", response_model=WsTicketOut)
async def ws_ticket(user: User = Depends(get_current_user)) -> WsTicketOut:
    """A 60s single-use ticket for /chat/ws — keeps the JWT out of URLs."""
    return WsTicketOut(ticket=await get_ticket_store().issue(str(user.id)))
```

- [ ] **Step 4: Run tests, then commit**

Run: `uv run pytest tests/test_chat_ws_tickets.py -v` — Expected: PASS

```bash
git add app/chat/tickets.py app/chat/router.py tests/test_chat_ws_tickets.py
git commit -m "feat(chat): one-time WS auth tickets (60s, single-use, Redis-ready)"
```

---

### Task 4: Conversation member resolution (receipts + push need "who is in this room")

**Files:**
- Create: `app/chat/members.py`
- Test: `tests/test_chat_members.py`

- [ ] **Step 1: Write the failing test**

```python
"""member_user_ids: derived membership per conversation kind."""
import pytest_asyncio

from app.chat.members import member_user_ids
from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    HomeownerSubRole,
    MemberStatus,
    UserRole,
)
from app.models.homeowner_member import HomeownerMember
from app.sites.models import SiteAssignment


@pytest_asyncio.fixture
async def setup(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    outsider = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    homeowner = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(
        HomeownerMember(
            site_id=site.id,
            user_id=homeowner.id,
            sub_role=HomeownerSubRole.owner,
            status=MemberStatus.active,
        )
    )
    await db_session.flush()
    return company, site, owner, supervisor, outsider, homeowner


async def test_site_thread_members_are_assigned_crew_plus_owners(db_session, setup):
    company, site, owner, supervisor, outsider, homeowner = setup
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(conv)
    await db_session.flush()
    ids = await member_user_ids(db_session, conv)
    assert owner.id in ids and supervisor.id in ids
    assert outsider.id not in ids  # not assigned to the site
    assert homeowner.id not in ids  # never in the crew room


async def test_homeowner_thread_members_include_active_homeowners(db_session, setup):
    company, site, owner, supervisor, outsider, homeowner = setup
    conv = Conversation(
        company_id=company.id, site_id=site.id, kind=ConversationKind.homeowner
    )
    db_session.add(conv)
    await db_session.flush()
    ids = await member_user_ids(db_session, conv)
    assert homeowner.id in ids and owner.id in ids and supervisor.id in ids


async def test_group_members_are_explicit(db_session, setup):
    company, site, owner, supervisor, outsider, homeowner = setup
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group)
    db_session.add(conv)
    await db_session.flush()
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=supervisor.id))
    await db_session.flush()
    ids = await member_user_ids(db_session, conv)
    assert ids == [supervisor.id]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_chat_members.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.chat.members'`

- [ ] **Step 3: Implement**

Create `app/chat/members.py`:

```python
"""Derived conversation membership — the inverse of access.can_access.

Receipts aggregate over these users; push fallback targets them. site/homeowner
membership is DERIVED (site scope), mirroring access.py; groups are explicit."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    MemberStatus,
    User,
    UserRole,
)
from app.models.homeowner_member import HomeownerMember
from app.sites.models import SiteAssignment

# Roles that see every company site (mirrors sites.router.effective_visible_site_ids).
_ALL_SITES_ROLES = (UserRole.owner, UserRole.pm)


async def member_user_ids(session: AsyncSession, conv: Conversation) -> list[UUID]:
    """Every user who is 'in' this conversation (dedup, stable order)."""
    if conv.kind is ConversationKind.group:
        rows = (
            await session.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conv.id
                )
            )
        ).scalars().all()
        return list(rows)

    assert conv.site_id is not None  # enforced by ck_conversation_site_required
    crew = (
        await session.execute(
            select(User.id)
            .outerjoin(SiteAssignment, SiteAssignment.user_id == User.id)
            .where(
                User.company_id == conv.company_id,
                User.role != UserRole.homeowner,
                (User.role.in_(_ALL_SITES_ROLES))
                | (SiteAssignment.site_id == conv.site_id),
            )
            .distinct()
        )
    ).scalars().all()
    ids = list(crew)
    if conv.kind is ConversationKind.homeowner:
        homeowners = (
            await session.execute(
                select(HomeownerMember.user_id).where(
                    HomeownerMember.site_id == conv.site_id,
                    HomeownerMember.status == MemberStatus.active,
                )
            )
        ).scalars().all()
        ids += [h for h in homeowners if h not in set(ids)]
    return ids
```

(Adjust the `SiteAssignment` import path/where-clause if `sites/models.py` differs — read it first; the test pins the behavior.)

- [ ] **Step 4: Run tests, then commit**

Run: `uv run pytest tests/test_chat_members.py -v` — Expected: PASS

```bash
git add app/chat/members.py tests/test_chat_members.py
git commit -m "feat(chat): derived conversation membership resolver (receipts/push substrate)"
```

---

### Task 5: Delivered/read cursors, receipts endpoint, thread windowing, envelope publish

**Files:**
- Modify: `app/chat/router.py` (`/delivered`, `/read` widening, `GET /messages` windowing, `GET /messages/{id}/receipts`, `GET /cursors`, envelope on publish)
- Test: `tests/test_chat_receipts.py`

- [ ] **Step 1: Write the failing test**

```python
"""Delivered/read cursors → WhatsApp-grade ticks without per-message rows."""
from uuid import uuid4

from app.models import UserRole
from app.sites.models import SiteAssignment
from tests.test_chat_api import auth


async def _send(client, user, site, body="msg"):
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": body},
        headers=auth(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_delivered_endpoint_advances_cursor_monotonically(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    await _send(client, owner, site)
    msg2 = await _send(client, owner, site)
    body = {"site_id": str(site.id), "last_seq": msg2["seq"]}
    assert (await client.post("/api/v1/chat/delivered", json=body, headers=auth(owner))).status_code == 204
    # Regression must not move it backwards.
    body["last_seq"] = 1
    assert (await client.post("/api/v1/chat/delivered", json=body, headers=auth(owner))).status_code == 204
    cursors = (
        await client.get(
            "/api/v1/chat/cursors", params={"site_id": str(site.id)}, headers=auth(owner)
        )
    ).json()
    mine = next(c for c in cursors if c["user_id"] == str(owner.id))
    assert mine["last_delivered_seq"] == msg2["seq"]


async def test_read_implies_delivered(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    msg = await _send(client, owner, site)
    await client.post(
        "/api/v1/chat/read",
        json={"site_id": str(site.id), "last_seq": msg["seq"]},
        headers=auth(owner),
    )
    cursors = (
        await client.get(
            "/api/v1/chat/cursors", params={"site_id": str(site.id)}, headers=auth(owner)
        )
    ).json()
    mine = next(c for c in cursors if c["user_id"] == str(owner.id))
    assert mine["last_delivered_seq"] == msg["seq"]
    assert mine["last_read_seq"] == msg["seq"]


async def test_receipts_for_message_aggregates_recipients(client, factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    await db_session.flush()
    msg = await _send(client, owner, site)
    r = (
        await client.get(f"/api/v1/chat/messages/{msg['id']}/receipts", headers=auth(owner))
    ).json()
    assert r["delivered_by"] == [] and r["read_by"] == []  # sender excluded
    await client.post(
        "/api/v1/chat/read",
        json={"site_id": str(site.id), "last_seq": msg["seq"]},
        headers=auth(supervisor),
    )
    r = (
        await client.get(f"/api/v1/chat/messages/{msg['id']}/receipts", headers=auth(owner))
    ).json()
    assert str(supervisor.id) in r["delivered_by"] and str(supervisor.id) in r["read_by"]


async def test_messages_windowing_before_seq_desc(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    for i in range(5):
        await _send(client, owner, site, body=f"m{i}")
    page = (
        await client.get(
            "/api/v1/chat/messages",
            params={"site_id": str(site.id), "before_seq": 4, "order": "desc", "limit": 2},
            headers=auth(owner),
        )
    ).json()
    assert [m["seq"] for m in page] == [3, 2]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_chat_receipts.py -v`
Expected: FAIL — 404 on `/api/v1/chat/delivered`

- [ ] **Step 3: Implement**

In `app/chat/router.py`:

(a) A shared cursor-advance helper + the two write endpoints (replace the body of `mark_read` with a call to it):

```python
async def _advance_cursor(
    session: AsyncSession,
    user: User,
    *,
    site_id: UUID | None,
    conversation_id: UUID | None,
    last_seq: int,
    read: bool,
) -> Conversation | None:
    """Monotonic max-advance of the caller's cursor pair. read ⇒ delivered."""
    conv = await _resolve_conversation(
        session, user, site_id=site_id, conversation_id=conversation_id
    )
    if conv is None:
        return None
    cursor = await session.get(ConversationRead, (conv.id, user.id))
    if cursor is None:
        cursor = ConversationRead(conversation_id=conv.id, user_id=user.id)
        session.add(cursor)
    cursor.last_delivered_seq = max(cursor.last_delivered_seq or 0, last_seq)
    if read:
        cursor.last_read_seq = max(cursor.last_read_seq or 0, last_seq)
    await session.commit()
    return conv


@router.post("/delivered", status_code=204)
async def mark_delivered(
    body: ChatReadIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Advance the caller's delivered cursor (✓✓) — client calls after persisting
    messages locally (WS frame or backfill)."""
    conv = await _advance_cursor(
        session, user, site_id=body.site_id, conversation_id=body.conversation_id,
        last_seq=body.last_seq, read=False,
    )
    await _publish_receipt(conv, user, "delivered", body.last_seq)
```

Rewrite `mark_read` to `_advance_cursor(..., read=True)` then `await _publish_receipt(conv, user, "read", body.last_seq)`.

(b) Receipt broadcast with the homeowner-room policy (delivered-only in `kind=homeowner`):

```python
async def _publish_receipt(
    conv: Conversation | None, user: User, kind: str, seq: int
) -> None:
    """Envelope-framed receipt to live subscribers. Calm-Cockpit policy: read
    receipts never cross in the homeowner room (delivered-only, both ways)."""
    if conv is None:
        return
    if kind == "read" and conv.kind is ConversationKind.homeowner:
        return
    await get_broadcaster().publish(
        conv.id,
        {"v": 1, "type": "receipt", "conv": str(conv.id), "user_id": str(user.id),
         "kind": kind, "seq": seq},
    )
```

(c) Wrap the existing message publish in the same envelope (router.py:681):

```python
    await get_broadcaster().publish(
        conv.id, {"v": 1, "type": "msg", "conv": str(conv.id), "payload": out.model_dump(mode="json")}
    )
```

(d) Read surfaces:

```python
class CursorOut(BaseModel):
    user_id: UUID
    last_delivered_seq: int
    last_read_seq: int


@router.get("/cursors", response_model=list[CursorOut])
async def list_cursors(
    site_id: UUID | None = Query(None),
    conversation_id: UUID | None = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[CursorOut]:
    """Every member's cursor pair — the client computes ticks from these.
    In the homeowner room, read cursors are masked (delivered-only policy)."""
    conv = await _resolve_conversation(
        session, user, site_id=site_id, conversation_id=conversation_id
    )
    if conv is None:
        return []
    rows = (
        await session.execute(
            select(ConversationRead).where(ConversationRead.conversation_id == conv.id)
        )
    ).scalars().all()
    mask_read = conv.kind is ConversationKind.homeowner
    return [
        CursorOut(
            user_id=r.user_id,
            last_delivered_seq=r.last_delivered_seq,
            last_read_seq=0 if (mask_read and r.user_id != user.id) else r.last_read_seq,
        )
        for r in rows
    ]


class MessageReceiptsOut(BaseModel):
    message_id: UUID
    delivered_by: list[UUID]
    read_by: list[UUID]


@router.get("/messages/{message_id}/receipts", response_model=MessageReceiptsOut)
async def message_receipts(
    message_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MessageReceiptsOut:
    """Who has this message reached (cursor-derived; sender excluded)."""
    msg = await session.get(ChatMessage, message_id)
    if msg is None:
        raise AppError(404, "not_found", "Message not found")
    conv = await session.get(Conversation, msg.conversation_id)
    await require_access(session, user, conv)
    members = set(await member_user_ids(session, conv)) - {msg.sender_id}
    cursors = (
        await session.execute(
            select(ConversationRead).where(ConversationRead.conversation_id == conv.id)
        )
    ).scalars().all()
    mask_read = conv.kind is ConversationKind.homeowner
    delivered = [c.user_id for c in cursors if c.user_id in members and c.last_delivered_seq >= msg.seq]
    read = [] if mask_read else [
        c.user_id for c in cursors if c.user_id in members and c.last_read_seq >= msg.seq
    ]
    return MessageReceiptsOut(message_id=message_id, delivered_by=delivered, read_by=read)
```

(import `member_user_ids` from `app.chat.members`).

(e) Windowing in `list_messages` — add params `before_seq: int | None = Query(None, ge=1)` and `order: str = Query("asc", pattern="^(asc|desc)$")`; when `before_seq` is set filter `ChatMessage.seq < before_seq`; when `order == "desc"` use `.order_by(ChatMessage.seq.desc())` (keep `after_seq` behavior unchanged for asc tail-sync).

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_chat_receipts.py tests/test_chat_api.py tests/test_chat_acks_resolve.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/chat/router.py tests/test_chat_receipts.py
git commit -m "feat(chat): delivered/read cursor pair, receipts, thread windowing, envelope frames"
```

---

### Task 6: WS v2 — multiplexed socket session (testable core + thin endpoint)

**Files:**
- Create: `app/chat/ws.py` (ChatSocketSession — the testable protocol core)
- Modify: `app/chat/router.py` (replace `chat_ws` with the thin glue; ticket auth)
- Test: `tests/test_chat_ws_session.py`

- [ ] **Step 1: Write the failing test (drive the session with a fake socket)**

```python
"""ChatSocketSession protocol: sub/sub_ok, live msg frames, delivered/read, ping."""
import asyncio
from uuid import uuid4

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
        await asyncio.sleep(0.05)
        raise ConnectionError("client gone")

    async def send_json(self, frame: dict) -> None:
        self.sent.append(frame)

    async def close(self, code: int = 1000) -> None:
        self.closed = True


@pytest_asyncio.fixture
async def conv_world(factory, db_session):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site, last_seq=7)
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_chat_ws_session.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.chat.ws'`

- [ ] **Step 3: Implement the session core + thin endpoint**

Create `app/chat/ws.py`:

```python
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
from app.models import Conversation, ConversationRead, User

_V = 1


class ChatSocketSession:
    def __init__(self, socket, user: User, session: AsyncSession, *, broadcaster) -> None:
        self._socket = socket
        self._user = user
        self._session = session
        self._broadcaster = broadcaster
        self._pumps: dict[UUID, asyncio.Task] = {}

    async def run(self) -> None:
        await self._socket.send_json({"v": _V, "type": "hello", "user_id": str(self._user.id)})
        try:
            while True:
                frame = await self._socket.receive_json()
                await self._handle(frame)
        except Exception:
            return
        finally:
            for task in self._pumps.values():
                task.cancel()
            for task in self._pumps.values():
                with contextlib.suppress(BaseException):
                    await task

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
        if conv_id is None or not isinstance(seq, int) or conv_id not in self._pumps:
            return
        conv = await _advance_cursor(
            self._session, self._user, site_id=None, conversation_id=conv_id,
            last_seq=seq, read=read,
        )
        await _publish_receipt(conv, self._user, "read" if read else "delivered", seq)
```

Replace the `chat_ws` endpoint in `app/chat/router.py`:

```python
@router.websocket("/ws")
async def chat_ws(
    websocket: WebSocket,
    ticket: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Multiplexed live stream (one socket per device). Auth: a one-time ticket
    from POST /chat/ws-ticket. Subscriptions arrive as frames; access is checked
    per-sub; Neon stays the ordering authority and clients backfill via REST."""
    user_id = await get_ticket_store().consume(ticket)
    user = await session.get(User, UUID(user_id)) if user_id else None
    if user is None:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    from app.chat.ws import ChatSocketSession

    try:
        await ChatSocketSession(
            websocket, user, session, broadcaster=get_broadcaster()
        ).run()
    except WebSocketDisconnect:  # pragma: no cover - client gone
        return
```

(The old `token=`/`site_id=` query contract is removed — it has zero consumers.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_chat_ws_session.py tests/test_chat_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/chat/ws.py app/chat/router.py tests/test_chat_ws_session.py
git commit -m "feat(chat): WS v2 — multiplexed ticket-authed socket with sub/receipt/ping protocol"
```

---

### Task 7: Presence registry + push fallback on send

**Files:**
- Create: `app/chat/presence.py`
- Modify: `app/chat/ws.py` (mark online/offline around `run()`)
- Modify: `app/chat/router.py` (push to offline members after publish)
- Test: `tests/test_chat_push_fallback.py`

- [ ] **Step 1: Write the failing test**

```python
"""Offline members get an Expo push with a deep link; online members don't."""
from uuid import uuid4

from app.chat.presence import InMemoryPresence, get_presence
from app.models import UserRole
from app.push.sender import dry_run_log, reset_dry_run_log
from app.sites.models import SiteAssignment
from tests.test_chat_api import auth


async def test_presence_roundtrip():
    p = InMemoryPresence()
    assert not await p.is_online("u1")
    await p.mark_online("u1", "conn-a")
    assert await p.is_online("u1")
    await p.mark_offline("u1", "conn-a")
    assert not await p.is_online("u1")


async def test_send_pushes_offline_members_not_sender(client, factory, db_session, monkeypatch):
    reset_dry_run_log()
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    from app.models import PushToken

    db_session.add(PushToken(user_id=supervisor.id, token="ExponentPushToken[sup]"))
    db_session.add(PushToken(user_id=owner.id, token="ExponentPushToken[own]"))
    await db_session.flush()

    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "cement aa gaya"},
        headers=auth(owner),
    )
    assert resp.status_code == 201
    tokens = [m["to"] for m in dry_run_log()]
    assert "ExponentPushToken[sup]" in tokens   # offline recipient pushed
    assert "ExponentPushToken[own]" not in tokens  # sender never pushed
    data = next(m for m in dry_run_log() if m["to"] == "ExponentPushToken[sup]")["data"]
    assert data["conversation_id"] and isinstance(data["seq"], int)


async def test_online_member_is_not_pushed(client, factory, db_session):
    reset_dry_run_log()
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    supervisor = await factory.user(company=company, role=UserRole.supervisor)
    site = await factory.site(company)
    db_session.add(SiteAssignment(site_id=site.id, user_id=supervisor.id))
    from app.models import PushToken

    db_session.add(PushToken(user_id=supervisor.id, token="ExponentPushToken[sup]"))
    await db_session.flush()
    await get_presence().mark_online(str(supervisor.id), "conn-1")
    try:
        await client.post(
            "/api/v1/chat/messages",
            json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "x"},
            headers=auth(owner),
        )
        assert all(m["to"] != "ExponentPushToken[sup]" for m in dry_run_log())
    finally:
        await get_presence().mark_offline(str(supervisor.id), "conn-1")
```

(Adjust `PushToken` import/fields to the actual model — read `app/models` for its definition first; the test pins behavior, not field names.)

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_chat_push_fallback.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.chat.presence'`

- [ ] **Step 3: Implement**

Create `app/chat/presence.py`:

```python
"""Who has a live socket? (spine A6). Push fallback targets the complement.

Redis impl: one counter key per user with a TTL refreshed by the socket
heartbeat — a crashed process leaks at most TTL seconds of 'online'."""
from __future__ import annotations

from functools import cache

_TTL_SECONDS = 90
_PREFIX = "ws:online:"


class InMemoryPresence:
    def __init__(self) -> None:
        self._conns: dict[str, set[str]] = {}

    async def mark_online(self, user_id: str, conn_id: str) -> None:
        self._conns.setdefault(user_id, set()).add(conn_id)

    async def mark_offline(self, user_id: str, conn_id: str) -> None:
        conns = self._conns.get(user_id)
        if conns:
            conns.discard(conn_id)
            if not conns:
                self._conns.pop(user_id, None)

    async def is_online(self, user_id: str) -> bool:
        return bool(self._conns.get(user_id))


class RedisPresence:
    def __init__(self, redis, ttl_seconds: int = _TTL_SECONDS) -> None:
        self._redis = redis
        self._ttl = ttl_seconds

    async def mark_online(self, user_id: str, conn_id: str) -> None:
        key = f"{_PREFIX}{user_id}"
        await self._redis.incr(key)
        await self._redis.expire(key, self._ttl)

    async def mark_offline(self, user_id: str, conn_id: str) -> None:
        key = f"{_PREFIX}{user_id}"
        if await self._redis.decr(key) <= 0:
            await self._redis.delete(key)

    async def is_online(self, user_id: str) -> bool:
        value = await self._redis.get(f"{_PREFIX}{user_id}")
        try:
            return int(value or 0) > 0
        except (TypeError, ValueError):
            return False


@cache
def get_presence():
    from app.config import settings

    if settings.chat_realtime == "redis":
        import redis.asyncio as aioredis

        return RedisPresence(aioredis.from_url(settings.redis_url))
    return InMemoryPresence()
```

In `app/chat/ws.py` `run()`: generate `conn_id = uuid4().hex`, call `await get_presence().mark_online(str(self._user.id), conn_id)` before the loop and `mark_offline` in the `finally`; refresh `mark_online` on every `ping`.

In `app/chat/router.py` `send_message`, after the broadcast publish, add (best-effort, never fails the send):

```python
    await _push_offline_members(session, conv, msg, user)
```

```python
_PUSH_PREVIEW_LEN = 80


async def _push_offline_members(
    session: AsyncSession, conv: Conversation, msg: ChatMessage, sender: User
) -> None:
    """Expo push to members without a live socket (spine A6). Best-effort;
    respects group mute; deep-links to the conversation."""
    try:
        from app.chat.members import member_user_ids
        from app.chat.presence import get_presence
        from app.push.sender import notify_user

        preview = (msg.body or "📎 attachment").strip()[:_PUSH_PREVIEW_LEN]
        muted: set[UUID] = set()
        if conv.kind is ConversationKind.group:
            muted = set(
                (
                    await session.execute(
                        select(ConversationMember.user_id).where(
                            ConversationMember.conversation_id == conv.id,
                            ConversationMember.muted.is_(True),
                        )
                    )
                ).scalars().all()
            )
        presence = get_presence()
        for member_id in await member_user_ids(session, conv):
            if member_id == sender.id or member_id in muted:
                continue
            if await presence.is_online(str(member_id)):
                continue
            await notify_user(
                session, member_id, sender.name or "New message", preview,
                data={"conversation_id": str(conv.id), "seq": msg.seq},
            )
    except Exception:  # pragma: no cover - push must never fail a send
        logger.exception("chat push fallback failed for conv %s", conv.id)
```

(add `import logging; logger = logging.getLogger(__name__)` at module top if absent. Homeowner members' tokens registered via `POST /me/push-token` flow through `notify_user`; the legacy `notif_prefs` token path can be added in Phase B if pilot homeowners lack PushToken rows.)

- [ ] **Step 4: Run tests, fix `get_presence.cache_clear()` needs in fixtures if state leaks, then commit**

Run: `uv run pytest tests/test_chat_push_fallback.py tests/test_chat_api.py -v`
Expected: PASS

```bash
git add app/chat/presence.py app/chat/ws.py app/chat/router.py tests/test_chat_push_fallback.py
git commit -m "feat(chat): presence registry + Expo push fallback for offline members"
```

---

### Task 8: Extraction status, RQ retry, manual retry endpoint, live event_update

**Files:**
- Modify: `app/extraction/worker.py` (status transitions + event_update publish)
- Modify: `app/queue.py` (RQ Retry policy)
- Modify: `app/chat/router.py` (`POST /messages/{id}/retry-extraction`; `raw_status` on ChatMessageOut)
- Test: `tests/test_extraction_status.py`

- [ ] **Step 1: Write the failing test**

```python
"""Extraction lifecycle: pending→done; failure stamps failed+error; retry endpoint
re-enqueues; event_update frame reaches subscribers when cards land."""
import asyncio
from uuid import uuid4

import pytest

from app.chat.realtime import Broadcaster
from app.extraction.worker import handle_ingested
from app.models import RawMessageModel, UserRole
from tests.test_chat_api import _session_factory, auth


async def _send(client, user, site, **extra):
    resp = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "5 mistri aaye",
              "capture_type": "attendance", "fields": {"headcount": 5}, **extra},
        headers=auth(user),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_worker_stamps_done(client, db_session, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    msg = await _send(client, owner, site)
    raw = (await db_session.execute(
        __import__("sqlalchemy").select(RawMessageModel)
    )).scalars().one()
    await handle_ingested(raw.id, _session_factory(db_session))
    await db_session.refresh(raw)
    assert raw.status == "done"
    assert raw.attempts == 1


async def test_worker_stamps_failed_and_reraises(client, db_session, factory, monkeypatch):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    await _send(client, owner, site)
    raw = (await db_session.execute(
        __import__("sqlalchemy").select(RawMessageModel)
    )).scalars().one()

    async def boom(*a, **k):
        raise RuntimeError("llm exploded")

    monkeypatch.setattr("app.extraction.worker.extract", boom)
    with pytest.raises(RuntimeError):
        await handle_ingested(raw.id, _session_factory(db_session))
    await db_session.refresh(raw)
    assert raw.status == "failed"
    assert "llm exploded" in (raw.last_error or "")


async def test_retry_endpoint_requeues_failed(client, db_session, factory, monkeypatch):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    msg = await _send(client, owner, site)
    raw = (await db_session.execute(
        __import__("sqlalchemy").select(RawMessageModel)
    )).scalars().one()
    raw.status = "failed"
    await db_session.flush()
    enqueued = []
    monkeypatch.setattr(
        "app.chat.router.enqueue_extraction",
        lambda raw_id: enqueued.append(raw_id) or _noop(),
    )
    resp = await client.post(
        f"/api/v1/chat/messages/{msg['id']}/retry-extraction", headers=auth(owner)
    )
    assert resp.status_code == 202
    assert enqueued == [raw.id]


def _noop():
    async def coro():
        return []
    return coro()


async def test_event_update_frame_published(client, db_session, factory, monkeypatch):
    from app.chat import realtime

    bus = Broadcaster()
    realtime.get_broadcaster.cache_clear()
    monkeypatch.setattr(realtime, "get_broadcaster", lambda: bus)
    monkeypatch.setattr("app.extraction.worker.get_broadcaster", lambda: bus, raising=False)
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    msg = await _send(client, owner, site)
    raw = (await db_session.execute(
        __import__("sqlalchemy").select(RawMessageModel)
    )).scalars().one()
    from uuid import UUID

    async with bus.subscribe(UUID(msg["conversation_id"])) as queue:
        await handle_ingested(raw.id, _session_factory(db_session))
        frame = await asyncio.wait_for(queue.get(), timeout=2)
    assert frame["type"] == "event_update"
    assert frame["message_id"] == msg["id"]
    assert frame["events"][0]["event_type"] == "attendance"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_extraction_status.py -v`
Expected: FAIL — `raw.status == "pending"` (no transitions), no retry route (404)

- [ ] **Step 3: Implement**

In `app/extraction/worker.py` `handle_ingested`, wrap the work:

```python
        raw_row.status = "processing"
        raw_row.attempts = (raw_row.attempts or 0) + 1
        await session.commit()
        try:
            raw = _to_contract(raw_row)
            events = await extract(raw, site_id, llm=llm, stt=stt, ocr=ocr)
        except Exception as exc:
            raw_row.status = "failed"
            raw_row.last_error = str(exc)[:2000]
            await session.commit()
            raise  # RQ Retry owns the requeue/backoff
```

set `raw_row.status = "skipped"` (+ commit) in the early-return no-site branch, and `raw_row.status = "done"; raw_row.last_error = None` just before the existing final `await session.commit()`. After indexing, publish the live card upgrade:

```python
        # Live card upgrade (spine A7): tell subscribed clients this message's
        # events are ready — no more "appears on next poll".
        if raw_row.source == APP_CHAT_SOURCE and ids:
            await _publish_event_update(session, raw_row, ids)
```

```python
async def _publish_event_update(
    session: AsyncSession, raw_row: RawMessageModel, event_ids: list[UUID]
) -> None:
    """Best-effort event_update frame through the (Redis) broadcaster."""
    try:
        from app.chat.realtime import get_broadcaster
        from app.models import ChatMessage, SiteEventModel

        chat_message_id = (raw_row.raw or {}).get("chat_message_id")
        if not chat_message_id:
            return
        msg = await session.get(ChatMessage, UUID(str(chat_message_id)))
        if msg is None:
            return
        events = (
            await session.execute(
                select(SiteEventModel).where(SiteEventModel.id.in_(event_ids))
            )
        ).scalars().all()
        await get_broadcaster().publish(
            msg.conversation_id,
            {
                "v": 1,
                "type": "event_update",
                "conv": str(msg.conversation_id),
                "message_id": str(msg.id),
                "raw_status": raw_row.status,
                "events": [
                    {
                        "id": str(e.id),
                        "event_type": e.event_type,
                        "summary": e.summary,
                        "fields": e.fields,
                        "confidence": e.confidence,
                        "needs_clarification": e.needs_clarification,
                    }
                    for e in events
                ],
            },
        )
    except Exception:  # pragma: no cover - live upgrade is best-effort
        logger.exception("event_update publish failed for raw %s", raw_row.id)
```

In `app/queue.py`, where the RQ job is enqueued add `retry=Retry(max=3, interval=[10, 60, 300])` (`from rq import Retry`) — extraction failures requeue with backoff; terminal failure leaves `status="failed"`.

In `app/chat/router.py`:

```python
@router.post("/messages/{message_id}/retry-extraction", status_code=202)
async def retry_extraction(
    message_id: UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Re-enqueue a failed extraction (the in-thread 'couldn't process · retry')."""
    msg = await session.get(ChatMessage, message_id)
    if msg is None or msg.raw_message_id is None:
        raise AppError(404, "not_found", "Message has no capture to retry")
    conv = await session.get(Conversation, msg.conversation_id)
    await require_access(session, user, conv)
    raw = await session.get(RawMessageModel, msg.raw_message_id)
    if raw is None or raw.status != "failed":
        raise AppError(409, "not_retryable", "Extraction is not in a failed state")
    raw.status = "pending"
    await session.commit()
    await enqueue_extraction(raw.id)
    return {"status": "queued"}
```

And surface status to clients: add `raw_status: str | None = None` to `ChatMessageOut`; in `list_messages`, batch-fetch `{raw_message_id: status}` for the page (one `select(RawMessageModel.id, RawMessageModel.status).where(RawMessageModel.id.in_(raw_ids))`) and stamp it per message. (`pending|processing` → client renders "card pending…"; `failed` → retry affordance; `done` with no events → plain bubble.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_extraction_status.py tests/test_chat_api.py tests/extraction -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/extraction/worker.py app/queue.py app/chat/router.py tests/test_extraction_status.py
git commit -m "feat(extraction): status lifecycle + RQ retry + manual retry + live event_update frames"
```

---

### Task 9: Presigned chat media upload (direct-to-R2, multipart fallback)

**Files:**
- Modify: `app/chat/router.py` (`POST /media/presign`)
- Test: `tests/test_chat_media_presign.py`

- [ ] **Step 1: Write the failing test**

```python
"""Presigned chat media: S3/R2 returns a direct PUT URL; local backend says
'use multipart' so the client falls back to POST /chat/media."""
from app.models import UserRole
from tests.test_chat_api import auth


async def test_presign_local_backend_falls_back_to_multipart(client, factory):
    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    resp = await client.post(
        "/api/v1/chat/media/presign",
        json={"site_id": str(site.id), "kind": "image"},
        headers=auth(owner),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["upload_mode"] == "multipart"  # local storage has no presigned PUT
    assert body["key"].startswith(f"chat/{site.id}/") and body["key"].endswith(".jpg")
    assert body["put_url"] is None


async def test_presign_requires_site_scope(client, factory):
    company = await factory.company()
    other = await factory.company(name="Other Co")
    owner = await factory.user(company=company, role=UserRole.owner)
    foreign_site = await factory.site(other)
    resp = await client.post(
        "/api/v1/chat/media/presign",
        json={"site_id": str(foreign_site.id), "kind": "image"},
        headers=auth(owner),
    )
    assert resp.status_code == 403
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_chat_media_presign.py -v`
Expected: FAIL — 404 (no route)

- [ ] **Step 3: Implement**

In `app/chat/router.py` (reuse `_MEDIA_EXT`, the same target resolution as `upload_media`):

```python
class MediaPresignIn(BaseModel):
    site_id: UUID | None = None
    conversation_id: UUID | None = None
    kind: str = "document"

    @model_validator(mode="after")
    def _one_target(self):
        if self.site_id is None and self.conversation_id is None:
            raise ValueError("provide site_id or conversation_id")
        return self


class MediaPresignOut(BaseModel):
    key: str
    put_url: str | None
    upload_mode: str  # "presigned" | "multipart"


@router.post("/media/presign", response_model=MediaPresignOut)
async def presign_media(
    body: MediaPresignIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MediaPresignOut:
    """Direct-to-R2 upload URL (spine A11): the API stays out of the byte path —
    critical on one bar. Local storage (CI/dev) has no presigned PUT, so the
    client falls back to the existing multipart POST /chat/media."""
    if body.conversation_id is not None:
        conv = await session.get(Conversation, body.conversation_id)
        if conv is None:
            raise AppError(404, "not_found", "Conversation not found")
        await require_access(session, user, conv)
        if conv.site_id is None:
            raise AppError(422, "no_site", "This conversation has no site")
        site_id = conv.site_id
    else:
        await _require_site(session, user, body.site_id)
        site_id = body.site_id
    ext = _MEDIA_EXT.get(body.kind, "bin")
    key = f"chat/{site_id}/{uuid4().hex}.{ext}"
    storage = get_storage()
    put_url = getattr(storage, "presigned_put", lambda _k: None)(key)
    return MediaPresignOut(
        key=key, put_url=put_url, upload_mode="presigned" if put_url else "multipart"
    )
```

(Check `app/storage/` for the actual `presigned_put` signature — the homeowner R1 upload already uses it; mirror that call exactly. The client computes sha256 locally and still sends `attachment_sha256` on the message — server dedupe is unchanged.)

- [ ] **Step 4: Run tests, then commit**

Run: `uv run pytest tests/test_chat_media_presign.py -v` — Expected: PASS

```bash
git add app/chat/router.py tests/test_chat_media_presign.py
git commit -m "feat(chat): presigned direct-to-R2 media upload with multipart fallback"
```

---

### Task 10: Mobile — durable chat outbox + send state machine

**Files:**
- Create: `src/chat/outbox.ts`
- Test: `src/chat/__tests__/outbox.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/** Durable chat outbox: enqueue survives restarts (AsyncStorage), drain sends
 * FIFO per conversation, retry/backoff states, permanent failures park. */
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  drainChatOutbox,
  enqueueChatSend,
  listChatOutbox,
  nextAttemptDelayMs,
  type ChatOutboxItem,
} from '../outbox'

beforeEach(() => AsyncStorage.clear())

const addr = { site_id: 'site-1' }

test('enqueue persists to storage and survives a "restart"', async () => {
  await enqueueChatSend({ address: addr, body: 'namaste', clientMsgId: 'c1' })
  const items = await listChatOutbox() // fresh read from AsyncStorage = post-restart
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ state: 'queued', clientMsgId: 'c1', body: 'namaste' })
})

test('drain sends FIFO and removes sent items', async () => {
  await enqueueChatSend({ address: addr, body: 'first', clientMsgId: 'c1' })
  await enqueueChatSend({ address: addr, body: 'second', clientMsgId: 'c2' })
  const sent: string[] = []
  await drainChatOutbox(async (item) => {
    sent.push(item.clientMsgId)
    return { ok: true, seq: sent.length }
  })
  expect(sent).toEqual(['c1', 'c2'])
  expect(await listChatOutbox()).toHaveLength(0)
})

test('network failure keeps item queued with attempt count + backoff', async () => {
  await enqueueChatSend({ address: addr, body: 'x', clientMsgId: 'c1' })
  await drainChatOutbox(async () => ({ ok: false, permanent: false }))
  const [item] = await listChatOutbox()
  expect(item.state).toBe('queued')
  expect(item.attempts).toBe(1)
  expect(item.nextAttemptAt).toBeGreaterThan(Date.now())
})

test('4xx parks the item as failed_permanent (never silently dropped)', async () => {
  await enqueueChatSend({ address: addr, body: 'x', clientMsgId: 'c1' })
  await drainChatOutbox(async () => ({ ok: false, permanent: true }))
  const [item] = await listChatOutbox()
  expect(item.state).toBe('failed_permanent')
})

test('backoff is exponential with a 5-minute cap', () => {
  expect(nextAttemptDelayMs(1)).toBeGreaterThanOrEqual(1000)
  expect(nextAttemptDelayMs(10)).toBeLessThanOrEqual(5 * 60_000 + 1000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/chat/__tests__/outbox.test.ts`
Expected: FAIL — `Cannot find module '../outbox'`

- [ ] **Step 3: Implement `src/chat/outbox.ts`**

```typescript
/**
 * Durable chat outbox (spine A8) — the bubble the user sees is backed by
 * storage BEFORE the network is tried, so an app kill in a dead zone never
 * loses a message. Modeled on src/offline/outbox.ts (the proven capture
 * foundation); chat needs its own shape (client_msg_id idempotency, per-
 * conversation FIFO, media two-step) so it gets its own queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'constructo.chat.outbox'
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 5 * 60_000

export type ChatAddressBody = { site_id?: string; conversation_id?: string }

export interface ChatOutboxItem {
  clientMsgId: string
  address: ChatAddressBody
  body?: string
  replyToId?: string
  captureType?: string
  fields?: Record<string, unknown>
  /** Media two-step: localUri until uploaded, then key+sha256 persisted back. */
  media?: {
    localUri?: string
    kind?: 'image' | 'document' | 'voice'
    mime?: string
    key?: string
    sha256?: string
  }
  state: 'queued' | 'sending' | 'failed_permanent'
  attempts: number
  nextAttemptAt: number
  createdAt: number
}

export type SendResult =
  | { ok: true; seq: number }
  | { ok: false; permanent: boolean }

async function readAll(): Promise<ChatOutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ChatOutboxItem[]) : []
  } catch {
    return []
  }
}

async function writeAll(items: ChatOutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

/** Exponential backoff with jitter: 1s·2ⁿ capped at 5 min. */
export function nextAttemptDelayMs(attempts: number): number {
  const exp = Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS)
  return exp + Math.floor(Math.random() * 250)
}

export async function enqueueChatSend(
  item: Omit<ChatOutboxItem, 'state' | 'attempts' | 'nextAttemptAt' | 'createdAt'>,
): Promise<ChatOutboxItem> {
  const full: ChatOutboxItem = {
    ...item,
    state: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  }
  const items = await readAll()
  items.push(full)
  await writeAll(items)
  return full
}

export async function listChatOutbox(): Promise<ChatOutboxItem[]> {
  return readAll()
}

export async function removeChatOutbox(clientMsgId: string): Promise<void> {
  await writeAll((await readAll()).filter((i) => i.clientMsgId !== clientMsgId))
}

export async function retryPermanent(clientMsgId: string): Promise<void> {
  const items = await readAll()
  const item = items.find((i) => i.clientMsgId === clientMsgId)
  if (item) {
    item.state = 'queued'
    item.nextAttemptAt = 0
    await writeAll(items)
  }
}

/**
 * Drain due items FIFO per conversation. `send` performs the idempotent POST
 * (and, for media items, the upload step first — persisting key/sha256 back via
 * the returned item mutation). A conversation halts at its first still-failing
 * item to preserve the user's intended order.
 */
export async function drainChatOutbox(
  send: (item: ChatOutboxItem) => Promise<SendResult>,
): Promise<void> {
  const items = await readAll()
  const now = Date.now()
  const halted = new Set<string>()
  for (const item of items) {
    const convKey = item.address.conversation_id ?? item.address.site_id ?? ''
    if (halted.has(convKey)) continue
    if (item.state !== 'queued' || item.nextAttemptAt > now) {
      halted.add(convKey)
      continue
    }
    item.state = 'sending'
    await writeAll(items)
    let result: SendResult
    try {
      result = await send(item)
    } catch {
      result = { ok: false, permanent: false }
    }
    if (result.ok) {
      items.splice(items.indexOf(item), 1)
    } else if (result.permanent) {
      item.state = 'failed_permanent'
      halted.add(convKey)
    } else {
      item.state = 'queued'
      item.attempts += 1
      item.nextAttemptAt = Date.now() + nextAttemptDelayMs(item.attempts)
      halted.add(convKey)
    }
    await writeAll(items)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest src/chat/__tests__/outbox.test.ts`
Expected: PASS (if AsyncStorage isn't auto-mocked, add `jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))` to the existing jest setup file — check `jest.config` for `setupFiles` first.)

- [ ] **Step 5: Commit**

```bash
git add src/chat/outbox.ts src/chat/__tests__/outbox.test.ts
git commit -m "feat(mobile/chat): durable AsyncStorage outbox with FIFO drain + backoff state machine"
```

---

### Task 11: Mobile — message cache + incremental sync (kill the afterSeq:0 refetch)

**Files:**
- Create: `src/chat/cache.ts`
- Test: `src/chat/__tests__/cache.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/** Per-conversation message cache: instant offline open, seq-dedup merge,
 * maxSeq cursor for incremental after_seq sync, capped at 200. */
import AsyncStorage from '@react-native-async-storage/async-storage'

import { loadThreadCache, maxCachedSeq, mergeMessages } from '../cache'

beforeEach(() => AsyncStorage.clear())

const m = (seq: number, body = `m${seq}`) => ({ id: `id-${seq}`, seq, body }) as never

test('merge dedupes by seq and sorts ascending', async () => {
  await mergeMessages('conv-1', [m(2), m(1)])
  await mergeMessages('conv-1', [m(2), m(3)])
  const cached = await loadThreadCache('conv-1')
  expect(cached.map((x: { seq: number }) => x.seq)).toEqual([1, 2, 3])
})

test('maxCachedSeq drives incremental sync', async () => {
  expect(await maxCachedSeq('conv-1')).toBe(0)
  await mergeMessages('conv-1', [m(1), m(2)])
  expect(await maxCachedSeq('conv-1')).toBe(2)
})

test('cache caps at 200 newest messages', async () => {
  await mergeMessages('conv-1', Array.from({ length: 230 }, (_, i) => m(i + 1)))
  const cached = await loadThreadCache('conv-1')
  expect(cached).toHaveLength(200)
  expect(cached[0].seq).toBe(31)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/chat/__tests__/cache.test.ts`
Expected: FAIL — `Cannot find module '../cache'`

- [ ] **Step 3: Implement `src/chat/cache.ts`**

```typescript
/**
 * Per-conversation message cache (spine A8/A9): thread opens instantly from
 * storage (offline-first), then syncs incrementally with after_seq=maxCachedSeq
 * — replacing today's full afterSeq:0 refetch every poll. Render order is
 * ALWAYS seq (the server's ordering authority), never local time.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { ChatMessage } from '../api/chat'

const KEY_PREFIX = 'constructo.chat.cache.'
const MAX_CACHED = 200

export async function loadThreadCache(convKey: string): Promise<ChatMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + convKey)
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

export async function mergeMessages(
  convKey: string,
  incoming: ChatMessage[],
): Promise<ChatMessage[]> {
  const existing = await loadThreadCache(convKey)
  const bySeq = new Map<number, ChatMessage>()
  for (const msg of existing) bySeq.set(msg.seq, msg)
  for (const msg of incoming) bySeq.set(msg.seq, msg) // newer copy wins (event upgrades)
  const merged = [...bySeq.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_CACHED)
  await AsyncStorage.setItem(KEY_PREFIX + convKey, JSON.stringify(merged))
  return merged
}

export async function maxCachedSeq(convKey: string): Promise<number> {
  const cached = await loadThreadCache(convKey)
  return cached.length ? cached[cached.length - 1].seq : 0
}
```

- [ ] **Step 4: Run tests, then commit**

Run: `npx jest src/chat/__tests__/cache.test.ts` — Expected: PASS

```bash
git add src/chat/cache.ts src/chat/__tests__/cache.test.ts
git commit -m "feat(mobile/chat): persisted thread cache + maxSeq incremental sync substrate"
```

---

### Task 12: Mobile — reconnecting WS client

**Files:**
- Create: `src/chat/socket.ts`
- Test: `src/chat/__tests__/socket.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
/** ChatSocket: ticket auth, sub on open, frame dispatch, reconnect with backoff,
 * resubscribe after reconnect. Driven with a fake WebSocket. */
import { ChatSocket } from '../socket'

class FakeWS {
  static instances: FakeWS[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []
  constructor(public url: string) {
    FakeWS.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.onclose?.()
  }
  open() {
    this.onopen?.()
  }
  push(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) })
  }
}

beforeEach(() => {
  FakeWS.instances = []
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

function makeSocket(frames: object[] = []) {
  const received: object[] = []
  const socket = new ChatSocket({
    getTicket: async () => 'ticket-1',
    baseWsUrl: 'wss://api.test/api/v1/chat/ws',
    makeWebSocket: (url) => new FakeWS(url) as unknown as WebSocket,
    onFrame: (f) => received.push(f),
  })
  return { socket, received }
}

test('connects with ticket and subscribes on open', async () => {
  const { socket } = makeSocket()
  await socket.connect()
  socket.subscribe('conv-1', 4)
  const ws = FakeWS.instances[0]
  ws.open()
  await Promise.resolve()
  expect(ws.url).toContain('ticket=ticket-1')
  const subs = ws.sent.map((s) => JSON.parse(s)).filter((f) => f.type === 'sub')
  expect(subs[0].convs).toEqual([{ id: 'conv-1', after_seq: 4 }])
})

test('dispatches msg frames to onFrame', async () => {
  const { socket, received } = makeSocket()
  await socket.connect()
  const ws = FakeWS.instances[0]
  ws.open()
  ws.push({ v: 1, type: 'msg', conv: 'conv-1', payload: { seq: 9 } })
  expect(received).toContainEqual({ v: 1, type: 'msg', conv: 'conv-1', payload: { seq: 9 } })
})

test('reconnects with backoff and resubscribes', async () => {
  const { socket } = makeSocket()
  await socket.connect()
  socket.subscribe('conv-1', 4)
  const first = FakeWS.instances[0]
  first.open()
  first.close() // dead socket
  await jest.advanceTimersByTimeAsync(3000) // past first backoff step
  expect(FakeWS.instances.length).toBeGreaterThanOrEqual(2)
  const second = FakeWS.instances[FakeWS.instances.length - 1]
  second.open()
  await Promise.resolve()
  const subs = second.sent.map((s) => JSON.parse(s)).filter((f) => f.type === 'sub')
  expect(subs.length).toBe(1) // resubscribed after reconnect
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/chat/__tests__/socket.test.ts`
Expected: FAIL — `Cannot find module '../socket'`

- [ ] **Step 3: Implement `src/chat/socket.ts`**

```typescript
/**
 * Reconnecting multiplexed chat socket (spine A9). One socket per app session;
 * conversations subscribe with their after_seq so the caller knows whether to
 * REST-backfill (sub_ok.last_seq > after_seq). Reconnect: exponential backoff
 * with jitter (1s→30s cap), resubscribes everything, then the caller re-syncs.
 * The socket is a NOTIFIER — REST after_seq remains the one sync path.
 */
export interface ChatSocketOpts {
  getTicket: () => Promise<string>
  baseWsUrl: string
  onFrame: (frame: Record<string, unknown>) => void
  makeWebSocket?: (url: string) => WebSocket
  pingIntervalMs?: number
}

const BACKOFF_BASE_MS = 1000
const BACKOFF_CAP_MS = 30_000

export class ChatSocket {
  private ws: WebSocket | null = null
  private subs = new Map<string, number>() // conv id → after_seq
  private attempts = 0
  private closedByUser = false
  private pingTimer: ReturnType<typeof setInterval> | null = null

  constructor(private opts: ChatSocketOpts) {}

  async connect(): Promise<void> {
    this.closedByUser = false
    const ticket = await this.opts.getTicket()
    const make = this.opts.makeWebSocket ?? ((url: string) => new WebSocket(url))
    const ws = make(`${this.opts.baseWsUrl}?ticket=${encodeURIComponent(ticket)}`)
    this.ws = ws
    ws.onopen = () => {
      this.attempts = 0
      this.sendSubs()
      this.pingTimer = setInterval(
        () => this.send({ v: 1, type: 'ping' }),
        this.opts.pingIntervalMs ?? 30_000,
      )
    }
    ws.onmessage = (e) => {
      try {
        this.opts.onFrame(JSON.parse(String(e.data)))
      } catch {
        /* malformed frame: ignore; REST resync covers it */
      }
    }
    ws.onclose = () => this.scheduleReconnect()
  }

  subscribe(convId: string, afterSeq: number): void {
    this.subs.set(convId, afterSeq)
    if (this.ws && this.ws.readyState === 1) {
      this.send({ v: 1, type: 'sub', convs: [{ id: convId, after_seq: afterSeq }] })
    }
  }

  unsubscribe(convId: string): void {
    this.subs.delete(convId)
    this.send({ v: 1, type: 'unsub', conv: convId })
  }

  markDelivered(convId: string, seq: number): void {
    this.subs.set(convId, Math.max(this.subs.get(convId) ?? 0, seq))
    this.send({ v: 1, type: 'delivered', conv: convId, seq })
  }

  markRead(convId: string, seq: number): void {
    this.send({ v: 1, type: 'read', conv: convId, seq })
  }

  close(): void {
    this.closedByUser = true
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.ws?.close()
  }

  private send(frame: object): void {
    try {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(frame))
    } catch {
      /* socket raced shut; reconnect loop owns recovery */
    }
  }

  private sendSubs(): void {
    const convs = [...this.subs.entries()].map(([id, after_seq]) => ({ id, after_seq }))
    if (convs.length) this.send({ v: 1, type: 'sub', convs })
  }

  private scheduleReconnect(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.closedByUser) return
    this.attempts += 1
    const delay =
      Math.min(BACKOFF_BASE_MS * 2 ** (this.attempts - 1), BACKOFF_CAP_MS) +
      Math.floor(Math.random() * 250)
    setTimeout(() => {
      void this.connect().catch(() => this.scheduleReconnect())
    }, delay)
  }
}
```

- [ ] **Step 4: Run tests, then commit**

Run: `npx jest src/chat/__tests__/socket.test.ts` — Expected: PASS

```bash
git add src/chat/socket.ts src/chat/__tests__/socket.test.ts
git commit -m "feat(mobile/chat): reconnecting multiplexed WS client with backoff + resubscribe"
```

---

### Task 13: Mobile — wire useChatThread v2 (cache + outbox + socket + ticks + read/delivered everywhere)

**Files:**
- Modify: `src/chat/useChatThread.ts` (cache-first load, incremental sync, outbox-backed send, socket integration, tick states)
- Modify: `src/api/chat.ts` (add `delivered`, `cursors`, `wsTicket`, `presign` calls; `raw_status` on ChatMessage type)
- Modify: `app/(contractor)/supervisor/chat.tsx` + `app/(contractor)/owner/chat.tsx` (read-cursor reporting — fixes the unread badge bug)
- Modify: `src/push/register.ts` or app root layout (notification-response listener → deep link)
- Test: `src/chat/__tests__/useChatThread.test.tsx` (extend existing kit tests)

This task is INTEGRATION of Tasks 10–12 — the units are already tested; test the seams:

- [ ] **Step 1: Write failing tests** — (a) `useChatThread` returns cached messages synchronously-ish before any network (mock `chatApi.messages` to never resolve; assert cached render via `loadThreadCache` pre-seed); (b) `send()` enqueues to the chat outbox and renders a `queued` pending message (mock network offline); (c) on a `msg` frame for the open thread, the message lands in state + `markDelivered` is called; (d) tick state per message derives from `cursors` (given two members' cursors, an own-message with `seq ≤ min(delivered)` reports `delivered`).

- [ ] **Step 2: Run to verify failure** — `npx jest src/chat/__tests__/useChatThread.test.tsx`

- [ ] **Step 3: Implement.** Key wiring (preserve the existing `UseChatThread` interface; add fields rather than break it):
  - Load: `loadThreadCache(addrKey)` → seed React Query initialData; fetch with `afterSeq: maxCachedSeq(addrKey)`; `mergeMessages` the page; keep 8s polling ONLY while the socket is disconnected.
  - Send: `enqueueChatSend(...)` first; optimistic items come from the outbox (`state: queued|sending|failed_permanent` rendered as "sending… / tap to retry"); drain on app start + NetInfo regain + AppState foreground (reuse `useOutbox`'s NetInfo pattern); the drain's `send` callback calls `chatApi.send` (and for media items: presign → PUT → fallback multipart → then send).
  - Socket: a module-level `ChatSocket` (one per app session) created with `getTicket: chatApi.wsTicket`; thread mount → `subscribe(convKey, maxCachedSeq)`; `onFrame`: `msg` → merge + `markDelivered`; `event_update` → patch the message's `events`/`raw_status` in cache+state; `receipt` → update cursor map.
  - Ticks: `deliveryState(msg)` computed from the cursor map (`sent | delivered | read`), exposed per message; word-acks unchanged.
  - Read reporting: keep the existing auto-advance effect, and add the same `chatApi.read` call to the supervisor and owner chat screens (they currently never mark read — the inbox badge bug).
  - Push deep link: register `Notifications.addNotificationResponseReceivedListener` in the root layout → `router.push` to the thread for `data.conversation_id`.

- [ ] **Step 4: Verify** — `npm run typecheck && npx jest`; then manual: device/sim with backend stopped → send → kill app → relaunch → backend up → message sends (the outbox survives).

- [ ] **Step 5: Commit**

```bash
git add src/chat/ src/api/chat.ts app/ src/push/
git commit -m "feat(mobile/chat): offline-first thread — cache-first load, outbox sends, live socket, ticks"
```

---

### Task 14: Kill-criteria metrics rollup

**Files:**
- Create: `app/metrics/__init__.py`, `app/metrics/chat_bet.py`
- Create: `app/models/bet_metrics.py` (+ export, + migration)
- Modify: `app/chat/router.py` or new `app/metrics/router.py` (owner-only `GET /api/v1/metrics/chat-bet`)
- Test: `tests/test_chat_bet_metrics.py`

- [ ] **Step 1: Write the failing test**

```python
"""Kill-criteria rollup: weekly active senders, decision-origin split,
unknown/clarification rates per source — deterministic, no LLM."""
from datetime import UTC, datetime, timedelta

from app.metrics.chat_bet import compute_week
from app.models import UserRole


async def test_compute_week_counts_senders_and_origin_split(client, db_session, factory):
    from uuid import uuid4

    from tests.test_chat_api import auth

    company = await factory.company()
    owner = await factory.user(company=company, role=UserRole.owner)
    site = await factory.site(company)
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi",
              "capture_type": "attendance", "fields": {"headcount": 4}},
        headers=auth(owner),
    )
    week_start = datetime.now(UTC) - timedelta(days=3)
    snapshot = await compute_week(db_session, company.id, week_start=week_start)
    assert snapshot["weekly_senders"] == 1
    assert snapshot["messages_total"] == 1
    assert "decision_origin" in snapshot and "extraction" in snapshot
```

- [ ] **Step 2: Run to verify failure** — `uv run pytest tests/test_chat_bet_metrics.py -v` → `ModuleNotFoundError`

- [ ] **Step 3: Implement** `app/metrics/chat_bet.py` — pure SQL aggregations, one dict out:

```python
"""Deterministic kill-criteria metrics (design §8). No LLM, no vendor.

Vault thresholds these feed: <40% weekly crew senders @6wk · >30% decisions
from WhatsApp · capture quality (unknown/clarify rates) per source · STT
correction rate. Plus spine SLOs (extraction failures)."""
from __future__ import annotations

from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ChatMessage,
    Conversation,
    RawMessageModel,
    SiteEventModel,
)


async def compute_week(
    session: AsyncSession, company_id: UUID, *, week_start: datetime
) -> dict:
    week_end = week_start + timedelta(days=7)

    msg_window = (
        select(ChatMessage.sender_id, ChatMessage.id)
        .join(Conversation, Conversation.id == ChatMessage.conversation_id)
        .where(
            Conversation.company_id == company_id,
            ChatMessage.created_at >= week_start,
            ChatMessage.created_at < week_end,
        )
        .subquery()
    )
    weekly_senders = (
        await session.scalar(select(func.count(func.distinct(msg_window.c.sender_id))))
    ) or 0
    messages_total = (await session.scalar(select(func.count(msg_window.c.id)))) or 0

    async def _per_source(*where) -> dict[str, int]:
        rows = (
            await session.execute(
                select(RawMessageModel.source, func.count(SiteEventModel.id))
                .join(
                    SiteEventModel,
                    SiteEventModel.source_message_ids.overlap(
                        func.array_agg(RawMessageModel.id).over()
                    ),
                    isouter=True,
                )
                .where(*where)
                .group_by(RawMessageModel.source)
            )
        ).all()
        return {source: count for source, count in rows}

    # Decision origin: approval/decision events in window, split by raw source.
    decision_rows = (
        await session.execute(
            select(RawMessageModel.source, func.count(SiteEventModel.id))
            .select_from(SiteEventModel)
            .join(
                RawMessageModel,
                RawMessageModel.id == func.any(SiteEventModel.source_message_ids),
            )
            .where(
                SiteEventModel.event_type == "approval",
                SiteEventModel.created_at >= week_start,
                SiteEventModel.created_at < week_end,
            )
            .group_by(RawMessageModel.source)
        )
    ).all()

    # Extraction quality + spine SLO, per source.
    quality_rows = (
        await session.execute(
            select(
                RawMessageModel.source,
                func.count(RawMessageModel.id),
                func.count(RawMessageModel.id).filter(RawMessageModel.status == "failed"),
            )
            .where(
                RawMessageModel.received_at >= week_start,
                RawMessageModel.received_at < week_end,
            )
            .group_by(RawMessageModel.source)
        )
    ).all()
    unknown_rows = (
        await session.execute(
            select(
                func.count(SiteEventModel.id).filter(
                    SiteEventModel.event_type == "unknown"
                ),
                func.count(SiteEventModel.id).filter(
                    SiteEventModel.needs_clarification.is_(True)
                ),
                func.count(SiteEventModel.id),
            ).where(
                SiteEventModel.created_at >= week_start,
                SiteEventModel.created_at < week_end,
            )
        )
    ).one()

    return {
        "week_start": week_start.date().isoformat(),
        "weekly_senders": weekly_senders,
        "messages_total": messages_total,
        "decision_origin": {source: count for source, count in decision_rows},
        "extraction": {
            "per_source": {
                source: {"total": total, "failed": failed}
                for source, total, failed in quality_rows
            },
            "unknown_events": unknown_rows[0],
            "needs_clarification_events": unknown_rows[1],
            "events_total": unknown_rows[2],
        },
    }
```

(If the `_per_source` helper above is unused after writing the real queries, delete it — the two explicit queries are the implementation. Verify the `array overlap`/`ANY` join shapes against how `_events_for_messages` does it in router.py and mirror that idiom.) Add `bet_metrics_weekly` (company_id, week_start, payload JSONB, computed_at; unique (company_id, week_start)) + a `python -m app.metrics.rollup` entry that upserts last week for every company (ACA cron job — same pattern as the brief scheduler), + the owner-only GET endpoint returning the latest snapshots.

- [ ] **Step 4: Verify + commit**

Run: `uv run ruff check . && uv run pytest tests/test_chat_bet_metrics.py -v`

```bash
git add app/metrics/ app/models/ alembic/versions/ tests/test_chat_bet_metrics.py
git commit -m "feat(metrics): deterministic chat-bet kill-criteria weekly rollup"
```

---

### Task 15: Full verification + PR

- [ ] **Step 1:** Backend: `uv run ruff check . && uv run pytest` — all green.
- [ ] **Step 2:** Mobile: `npm run typecheck && npx jest` — all green.
- [ ] **Step 3:** Manual smoke on sim against local backend (`EXTRACTION_SYNC=true`): send online → instant; airplane mode → send → kill app → relaunch → reconnect → message delivers exactly once (client_msg_id); second device sees it via WS without polling; ticks advance; extraction card appears live; push dry-run log shows the offline member.
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch — PR `feat/chat-reliability-spine` → main, body links `docs/CHAT-RELIABILITY-DESIGN.md`.

---

## Phase B — Completeness & intelligence (scoped; expand into its own plan after Phase A ships)

Each item lists: scope · key files · acceptance test.

- **B1. Contested-truth enforcement in the send path.** Block `_apply_reply_approval` (and any money-commit) when the target event has an open `EventDispute`; store the message with `meta.blocked={reason:"contested", dispute_id}`; render a system notice. Files: `app/chat/router.py`, test `tests/test_chat_contested_gate.py::test_approval_blocked_while_disputed`.
- **B2. Server-enforced voice-money read-back gate.** In `worker.handle_ingested`: events from `media_type=voice` with type in `{invoice_received, payment_request, material_delivery}` always land `needs_clarification=True`; confirm-tap re-submits as typed `capture_type`+`fields` (existing fast-path → confidence 1.0). Files: `app/extraction/worker.py`; test `tests/extraction/test_voice_money_gate.py`.
- **B3. Nivaan in-thread.** `@nivaan` mention → constrained agent (MAX_STEPS≈4, tiered tool registry: green auto / commit→proposal card in `meta.proposal` / money→evidence-bound or `missing_proof`), replies as `sender_kind=nivaan` rows; numeric guard on all drafted digits; no homeowner-send tool exists (structural membrane). Files: `app/chat/agent.py` (new), `app/chat/router.py` (mention detect), reuse `ask/` reducers; tests: proposal-not-commit, money-refusal-without-evidence, numeric-guard-block.
- **B4. Publish gate v2.** `POST /chat/publish-to-homeowner` per design §4 (numeric-guarded translation variants, `meta.provenance`, publish audit log). Files: `app/chat/router.py` or `app/chat/publish.py`; tests: digit-divergent variant blocked; draft text never appears in homeowner thread unedited-flag intact.
- **B5. Perceptual near-duplicate flag.** pHash on image ingest (`app/extraction/phash.py`, `imagehash` dep), compare within site over 14 days, near-match ⇒ flag card "confirm not a duplicate" (never auto-reject). Test: same challan re-photographed flags; different challan doesn't.
- **B6. Group/system message surfaces.** Render `sender_kind=system` rows (member added/removed, dispute resolved, publish provenance); emit them from groups_router actions. 
- **B7. Typing indicator (optional, last).** Ephemeral WS `typing` frames, no persistence, crew rooms only.

## Phase C — WhatsApp migration + DPDP (scoped; expand into its own plan)

- **C1. Cloud API inbound webhook.** `GET/POST /api/v1/ingest/cloud-webhook`: Meta verify handshake; `X-Hub-Signature-256` HMAC (app secret) — reject on mismatch; map payload → `RawMessage(source="cloud_api", provider_message_id=<wamid>)` (the Task-1 unique index makes re-delivery idempotent); media via Graph API → R2 + sha256. Files: `app/ingestion/cloud_webhook.py`; tests: signature reject, dedupe on replayed wamid, text+image mapping.
- **C2. Forward-bot capture + site disambiguation.** Same webhook; `raw.forwarded=true`; group JIDs via `whatsapp_groups` (+ rebind tooling `scripts/rebind_groups.py` baileys→cloud_api); 1:1 forwards via `wa_sender_defaults` table + one-tap bot reply site picker (24h window is open — user-initiated). 
- **C3. Baileys decommission.** Gate: 2 weeks forward-bot parity on the family pilot (compare weekly capture counts per site). Then: stop the bridge, mark `whatsapp-bridge/` archived in README. **Pre-public blockers (standing):** `--purge` imported real family data; rotate the exposed Neon password.
- **C4. DPDP.** `consent_records` table + first-run itemized consent screen (English-first, Hindi toggle) + bot notice on group bind; per-company retention config (defaults: media 18mo / messages 3y / site_events 8y) + nightly purge job (R2 delete + tombstone + log); `docs/RUNBOOK-BREACH.md` (72h DPB notification tree); DSR manual runbook.

---

## Self-review checklist (done at authoring)

- Spec coverage: brief gaps 1–5 → Task 8 (re-scoped: extraction status/retry/live, since capture_type ground truth is already shipped — verified in `extract.py`), Tasks 2/6 (multi-worker realtime), Tasks 12/13 (reconnect/backfill/push), Tasks 5/10 (outbox + delivery tracking — server outbox deliberately = Postgres + cursors, design §B.4), Task 5 (receipts). Money-tier dispute gate → B1; read-back → B2; Baileys → C1–C3; DPDP → C4; kill criteria → Task 14.
- Type consistency: `SenderKind` (Task 1) used by B3/B6; `last_delivered_seq` (Task 1) used by Tasks 5/6/13; `get_broadcaster()` (Task 2) used by Tasks 6/8; `member_user_ids` (Task 4) used by Tasks 5/7; envelope frames (Task 5) consumed by Tasks 6/8/12/13; `ChatOutboxItem`/`drainChatOutbox` (Task 10) used by Task 13; `maxCachedSeq`/`mergeMessages` (Task 11) used by Tasks 12/13.
- Known verify-at-execution points (flagged inline): `SiteAssignment` import path (Task 4), `PushToken` model fields (Task 7), `storage.presigned_put` signature (Task 9), jest AsyncStorage mock setup (Task 10), RQ enqueue call shape in `app/queue.py` (Task 8).
