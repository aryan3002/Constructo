# Groups Subsystem — Implementation Plan (Doc 18, Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the **owner** create named **groups** (additional conversations beyond the auto crew thread) — site-scoped, running the full capture→event pipeline — with lightweight per-group RBAC (owner creates + is admin; admins can be delegated), surfaced in the owner Chat inbox + a New-group/manage UI.

**Architecture:** One Alembic migration (off head `f7a8b9c0d1e2`) adds `ConversationKind.group`, makes `conversations.site_id` nullable, swaps the `(site_id,kind)` unique constraint for a **partial** unique index (one `site`/`homeowner` thread per site, many groups), adds `archived_at`, and creates a `conversation_members` table (+`member_role` enum). A single `can_access(user, conversation)` resolver becomes the one gate: **derived** for `site`/`homeowner` kinds (reuses `effective_visible_site_ids`), **explicit** membership rows for `group`. The chat send/list/read/WS endpoints generalize from `site_id` to also accept `conversation_id`. Group CRUD + RBAC ship as new routes. Mobile adds a groups API module, a New-group creation flow, a manage sheet, and renders group threads through the existing shared `MessageView`.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (Python 3.12, `uv`); React Native + Expo Router + TanStack Query + TypeScript. Blueprint theme (owner app, light). pytest / jest.

**Locked decisions (from brainstorm 2026-06-07 + founder confirmation 2026-06-07):**
- **Create gate = owner only.** No co-owner role exists. PMs participate in groups **only via per-group admin delegation** (not create).
- **Phase 2 groups are SITE groups** (`site_id` required). Company-wide talk-only groups (`site_id` null) are **Phase 4** — the schema is made null-tolerant now, but `POST /chat/groups` requires a `site_id` in this phase.
- **Groups are "plain"** — no auto price/digit stripping inside a group. A "client present" cue is shown when a homeowner is a member (visibility, not enforcement).
- **Site-group capture reuses the crew pipeline unchanged:** a site-group message mints `RawMessage(external_group_id=f"app:{conv.site_id}")`, and the existing extraction worker files events to that `site_id` — **no extraction-worker change**.

---

## Scope & Non-Goals

**In scope (Phase 2):** the migration + models; the `can_access` resolver; generalizing send/list/read/WS to `conversation_id`; group CRUD + RBAC; site-group capture; owner New-group + manage UI; group rows in the inbox + group threads rendered in the detail.

**Explicitly deferred (NOT this plan):**
- **Company-wide talk-only groups** (`site_id` null path, company-wide eligibility, inbox grouping) — **Phase 4**.
- **Homeowner Messages tab + activating the `homeowner` 1:1 channel** — **Phase 3**. (Phase 2's `can_access` already *permits* a homeowner who is an explicit group member, but no homeowner UI surfaces it yet, and the inbox endpoint keeps blocking the homeowner role.)
- **Supervisor-side group inbox** — deferred (supervisors can be *added* to groups and the resolver lets them in, but the rich inbox ships for owner first).
- `members_preview` in the inbox payload (the group detail shows the full member list; the inbox stays on the existing `ConversationSummary` shape + `has_homeowner`).
- Per-message "file to site X" for talk-only groups; migrating "Ask the Builder" requests into the builder channel.

---

## File Structure

**Backend (`constructo/backend/`):**
- Modify `app/models/chat.py` — `ConversationKind.group`; `site_id` nullable; `archived_at`; replace unique constraint with partial unique `Index`.
- Create `app/models/conversation_member.py` — `MemberRole` enum + `ConversationMember`.
- Modify `app/models/__init__.py` — register the new model + enum.
- Create `alembic/versions/<rev>_groups_subsystem.py` — the one migration.
- Create `app/chat/access.py` — `can_access(session, user, conversation)` + `resolve_conversation_for(...)` helpers + manage/create gates.
- Modify `app/chat/router.py` — generalize `/messages` (list), `/read`, `/ws`, `/conversations` to `conversation_id`; generalize `send_message`.
- Create `app/chat/groups_router.py` — group CRUD + members + addable-users routes (mounted under `/api/v1/chat`).
- Modify `app/main.py` — include `groups_router`.
- Tests: `tests/test_groups_model.py`, `tests/test_chat_access.py`, `tests/test_groups_api.py`, additions to `tests/test_chat_api.py` (generalized send/list/read).

**Mobile (`constructo/mobile/`):**
- Create `src/api/groups.ts` — groups API module + types.
- Modify `src/api/chat.ts` — `messages`/`read` accept an optional `conversationId`; `ConversationSummary` unchanged.
- Modify `app/(contractor)/owner/chat/[id].tsx` — fetch by `conversation_id` when `kind === 'group'`.
- Modify `app/(contractor)/owner/chat/index.tsx` — a "+ New group" entry (owner) + open group rows.
- Create `app/(contractor)/owner/_group_sheets.tsx` — `NewGroupSheet` + `ManageGroupSheet` (Modal-based, multi-select member picker).
- Tests: `src/api/groups.test.ts` (shape), and extend existing where natural.

---

## PR Sequencing (each branch → PR → merge ONLY when CI all-green)

- **PR 1 — Migration + models** (Tasks 1–3). Schema only; no behavior yet. Round-tripped on a scratch DB.
- **PR 2 — `can_access` resolver + generalized read paths + group rows in inbox** (Tasks 4–6).
- **PR 3 — Group CRUD + RBAC** (Tasks 7–9).
- **PR 4 — Generalized send path + site-group capture** (Task 10). The money-sensitive one.
- **PR 5 — Mobile: groups API + render group threads** (Tasks 11–12).
- **PR 6 — Mobile: owner New-group + manage UI** (Tasks 13–14).

> **Working agreement (vault doc 16 §4 / memory):** local gate before every push — backend `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run ruff check . && DATABASE_URL=... uv run pytest` (5 storage-env failures expected locally); mobile `cd constructo/mobile && npm run typecheck && npm test`. Feature branch → PR → `gh pr merge N --merge --delete-branch` only when CI green. **Never commit to main.** Explicit `git add <paths>` (never `-A`; never stage `.env.bak`, `tmp/`, `docs/`, or `app/(homeowner)/updates.tsx`). Invoke `constructo-design-system` before each UI task (Tasks 13–14). Applying the migration to prod Neon = founder's explicit OK (a Founder to-do).

---

## Task 1: Backend models — Conversation changes + ConversationMember

**Files:**
- Modify: `constructo/backend/app/models/chat.py`
- Create: `constructo/backend/app/models/conversation_member.py`
- Modify: `constructo/backend/app/models/__init__.py`

- [ ] **Step 1: Extend `ConversationKind` + `Conversation` in `app/models/chat.py`**

Add the enum value:
```python
class ConversationKind(StrEnum):
    homeowner = "homeowner"
    site = "site"
    group = "group"
```

Make `site_id` nullable and add `archived_at` (find the existing `site_id` mapped_column and the column block):
```python
    site_id: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("sites.id", ondelete="CASCADE"), nullable=True
    )
    ...
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
```

Replace `__table_args__` — drop `UniqueConstraint("site_id","kind", name="uq_conversation_site_kind")`, add a **partial unique index**:
```python
    __table_args__ = (
        Index(
            "uq_conversation_site_singleton",
            "site_id",
            "kind",
            unique=True,
            postgresql_where=text("kind IN ('site','homeowner')"),
        ),
    )
```
Ensure imports at the top of the file include `Index` and `text` (`from sqlalchemy import ... Index, text`). Keep `UniqueConstraint` imported only if still used elsewhere in the file; remove if now unused (ruff will flag).

- [ ] **Step 2: Create `app/models/conversation_member.py`**

```python
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class MemberRole(StrEnum):
    admin = "admin"
    member = "member"


class ConversationMember(Base):
    """Explicit membership — ONLY for `group` conversations. The auto
    `site`/`homeowner` threads keep derived membership (no rows here)."""

    __tablename__ = "conversation_members"

    conversation_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    role: Mapped[MemberRole] = mapped_column(
        SAEnum(MemberRole, name="member_role"), nullable=False, server_default="member"
    )
    added_by: Mapped[UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    muted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
```
> Match the exact import style of the other model files (check `app/models/chat.py` for whether it imports `Enum as SAEnum` or `SAEnum` directly, and `PgUUID` aliasing). Adjust to match.

- [ ] **Step 3: Register in `app/models/__init__.py`**

Add alongside the other imports + `__all__`:
```python
from app.models.conversation_member import ConversationMember, MemberRole
```
And add `"ConversationMember"`, `"MemberRole"` to `__all__`.

- [ ] **Step 4: Verify the models import + create_all builds the schema**

```bash
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo \
  uv run python -c "from app.db import Base; import app.models; print('member_role' , 'conversation_members' in Base.metadata.tables)"
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run ruff check .
```
Expected: prints `... True`; ruff clean. (No commit yet — Task 2 adds the model test, Task 3 the migration; commit them together as PR 1.)

---

## Task 2: Backend — model behavior tests

**Files:**
- Create: `constructo/backend/tests/test_groups_model.py`

- [ ] **Step 1: Write the tests**

```python
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    MemberRole,
)


async def test_partial_unique_allows_many_groups_one_site_thread(db_session, world):
    company, owner, site = world
    # one site thread is allowed
    db_session.add(Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site))
    await db_session.flush()
    # many groups on the same site are allowed
    db_session.add(Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Plumbing"))
    db_session.add(Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Electrical"))
    await db_session.flush()
    groups = (
        await db_session.execute(
            select(Conversation).where(
                Conversation.site_id == site.id, Conversation.kind == ConversationKind.group
            )
        )
    ).scalars().all()
    assert len(groups) == 2


async def test_partial_unique_rejects_two_site_threads(db_session, world):
    company, owner, site = world
    db_session.add(Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site))
    await db_session.flush()
    db_session.add(Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site))
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_conversation_member_roles_persist(db_session, world):
    company, owner, site = world
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Crew+Client")
    db_session.add(conv)
    await db_session.flush()
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=owner.id, role=MemberRole.admin, added_by=owner.id))
    await db_session.flush()
    m = await db_session.get(ConversationMember, (conv.id, owner.id))
    assert m.role is MemberRole.admin
    assert m.muted is False
```

- [ ] **Step 2: Run them**

```bash
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo \
  uv run pytest tests/test_groups_model.py -v
```
Expected: 3 pass. (`db_session`/`world` fixtures already exist in conftest.)

> If `test_partial_unique_rejects_two_site_threads` errors with a savepoint/transaction issue instead of `IntegrityError` (the conftest session uses `create_savepoint`), wrap the second flush so the IntegrityError surfaces, or assert via `pytest.raises(IntegrityError)` around the flush as written — verify behavior and adjust the assertion to however the existing tests catch integrity violations (grep the test suite for `IntegrityError`).

---

## Task 3: Backend — the migration

**Files:**
- Create: `constructo/backend/alembic/versions/<rev>_groups_subsystem.py`

- [ ] **Step 1: Pick a unique revision id chained off the head**

```bash
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run alembic heads
ls alembic/versions | grep -i a7c1f2d3b4e5   # must return nothing
```
Use `down_revision = "f7a8b9c0d1e2"` and `revision = "a7c1f2d3b4e5"` (if the grep shows a collision, pick another 12-hex slug and re-grep).

- [ ] **Step 2: Write the migration**

`constructo/backend/alembic/versions/a7c1f2d3b4e5_groups_subsystem.py`:
```python
"""groups subsystem: kind=group, nullable site_id, partial unique index, archived_at, conversation_members

Revision ID: a7c1f2d3b4e5
Revises: f7a8b9c0d1e2
Create Date: 2026-06-07
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a7c1f2d3b4e5"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add the 'group' value to the existing native enum. Safe inside the
    #    migration txn on PG12+ because it is not USED in this migration
    #    (groups are created at runtime). Mirrors the user_role 'homeowner' add.
    op.execute("ALTER TYPE conversation_kind ADD VALUE IF NOT EXISTS 'group'")

    # 2. conversations: site_id nullable; drop old unique constraint; partial
    #    unique index; add archived_at.
    op.alter_column("conversations", "site_id", existing_type=postgresql.UUID(), nullable=True)
    op.drop_constraint("uq_conversation_site_kind", "conversations", type_="unique")
    op.create_index(
        "uq_conversation_site_singleton",
        "conversations",
        ["site_id", "kind"],
        unique=True,
        postgresql_where=sa.text("kind IN ('site','homeowner')"),
    )
    op.add_column(
        "conversations",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 3. member_role enum + conversation_members table.
    op.create_table(
        "conversation_members",
        sa.Column(
            "conversation_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "role",
            postgresql.ENUM("admin", "member", name="member_role"),
            server_default="member",
            nullable=False,
        ),
        sa.Column(
            "added_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("muted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    # Note: the 'group' enum value cannot be removed from conversation_kind
    # (Postgres has no DROP VALUE); it is left in place — harmless and unused.
    op.drop_table("conversation_members")
    postgresql.ENUM(name="member_role").drop(op.get_bind(), checkfirst=True)
    op.drop_column("conversations", "archived_at")
    op.drop_index("uq_conversation_site_singleton", table_name="conversations")
    op.alter_column("conversations", "site_id", existing_type=postgresql.UUID(), nullable=False)
    op.create_unique_constraint("uq_conversation_site_kind", "conversations", ["site_id", "kind"])
```

- [ ] **Step 3: Round-trip on a scratch DB**

```bash
cd constructo/backend
createdb -h localhost -p 5433 -U constructo constructo_scratch 2>/dev/null || true
export SCRATCH=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo_scratch
DATABASE_URL=$SCRATCH uv run alembic upgrade head
DATABASE_URL=$SCRATCH uv run alembic downgrade -1
DATABASE_URL=$SCRATCH uv run alembic upgrade head
```
Expected: upgrade → downgrade → upgrade all succeed with no error. Drop the scratch DB afterward (`dropdb -h localhost -p 5433 -U constructo constructo_scratch`).
> If `createdb`/`dropdb` aren't on PATH, use `psql -h localhost -p 5433 -U constructo -c 'CREATE DATABASE constructo_scratch'`. The `ALTER TYPE ... ADD VALUE` must be confirmed to run inside Alembic's transaction here; if PG rejects it in a txn (it shouldn't on the local PG12+), wrap step-1 in `with op.get_context().autocommit_block():` and re-run the round-trip.

- [ ] **Step 4: Confirm `alembic heads` is single + the model/migration agree**

```bash
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run alembic heads   # -> a7c1f2d3b4e5 (head)
```

- [ ] **Step 5: Full local gate + commit PR 1**

```bash
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run ruff check .
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest
```
ruff clean; pytest green except the 5 known storage-env failures + the 3 new model tests pass.

```bash
cd /Users/aryantripathi/Developer/contructionAI
git checkout main && git pull --ff-only
git checkout -b feat/groups-schema
git add constructo/backend/app/models/chat.py \
        constructo/backend/app/models/conversation_member.py \
        constructo/backend/app/models/__init__.py \
        constructo/backend/alembic/versions/a7c1f2d3b4e5_groups_subsystem.py \
        constructo/backend/tests/test_groups_model.py
git commit -m "feat(chat): groups schema — kind=group, nullable site_id, partial unique index, conversation_members (doc 18 Phase 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Then push, open PR "feat(chat): groups schema (doc 18 Phase 2, PR 1/6)", watch CI, merge when green.

---

## Task 4: Backend — `can_access` resolver + gates

**Files:**
- Create: `constructo/backend/app/chat/access.py`
- Test: `constructo/backend/tests/test_chat_access.py`

- [ ] **Step 1: Write `app/chat/access.py`**

```python
from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError  # match the real AppError import path used in chat/router.py
from app.models import (
    Conversation,
    ConversationKind,
    ConversationMember,
    MemberRole,
    User,
    UserRole,
)
from app.sites.router import effective_visible_site_ids


async def can_access(session: AsyncSession, user: User, conversation: Conversation) -> bool:
    """The ONE gate for reading/writing a conversation."""
    if conversation.kind in (ConversationKind.site, ConversationKind.homeowner):
        # Derived from site scope. A homeowner role NEVER reaches a raw `site` thread.
        if user.role is UserRole.homeowner and conversation.kind is ConversationKind.site:
            return False
        if conversation.site_id is None:
            return False
        visible = await effective_visible_site_ids(session, user)
        return conversation.site_id in visible
    if conversation.kind is ConversationKind.group:
        member = await session.get(ConversationMember, (conversation.id, user.id))
        return member is not None
    return False


async def require_access(session: AsyncSession, user: User, conversation: Conversation) -> None:
    if not await can_access(session, user, conversation):
        raise AppError(403, "forbidden", "You cannot access this conversation")


async def is_group_admin(session: AsyncSession, user: User, conversation_id: UUID) -> bool:
    member = await session.get(ConversationMember, (conversation_id, user.id))
    return member is not None and member.role is MemberRole.admin


async def require_group_admin(session: AsyncSession, user: User, conversation_id: UUID) -> None:
    if not await is_group_admin(session, user, conversation_id):
        raise AppError(403, "forbidden", "Only a group admin can do this")


async def load_group_or_404(session: AsyncSession, conversation_id: UUID) -> Conversation:
    conv = await session.get(Conversation, conversation_id)
    if conv is None or conv.kind is not ConversationKind.group:
        raise AppError(404, "not_found", "Group not found")
    return conv
```
> Verify the real import path of `AppError` (the explore showed it's used in `app/chat/router.py` — copy that import). Verify `effective_visible_site_ids` import path (`app.sites.router`).

- [ ] **Step 2: Write `tests/test_chat_access.py`** (resolver matrix per doc 18 §11)

```python
from app.chat.access import can_access
from app.models import (
    Conversation, ConversationKind, ConversationMember, MemberRole, UserRole,
)


async def _group(db_session, company, site, title="G"):
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title=title)
    db_session.add(conv)
    await db_session.flush()
    return conv


async def test_homeowner_blocked_from_site_thread(db_session, factory, world):
    company, owner, site = world
    site_conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(site_conv)
    await db_session.flush()
    ho = await factory.user(company=company, role=UserRole.homeowner)
    assert await can_access(db_session, ho, site_conv) is False


async def test_owner_sees_site_thread(db_session, world):
    company, owner, site = world
    site_conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(site_conv)
    await db_session.flush()
    assert await can_access(db_session, owner, site_conv) is True


async def test_group_member_allowed_non_member_blocked(db_session, factory, world):
    company, owner, site = world
    conv = await _group(db_session, company, site)
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=owner.id, role=MemberRole.admin))
    await db_session.flush()
    other = await factory.user(company=company, role=UserRole.supervisor)
    assert await can_access(db_session, owner, conv) is True
    assert await can_access(db_session, other, conv) is False


async def test_homeowner_can_be_group_member(db_session, factory, world):
    company, owner, site = world
    conv = await _group(db_session, company, site)
    ho = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=ho.id, role=MemberRole.member))
    await db_session.flush()
    assert await can_access(db_session, ho, conv) is True   # explicit membership beats the role block
```

- [ ] **Step 3: Run**

```bash
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest tests/test_chat_access.py -v
```
Expected: 4 pass. (Commit with Tasks 5–6 as PR 2.)

---

## Task 5: Backend — generalize list / read / WS to `conversation_id`

**Files:**
- Modify: `constructo/backend/app/chat/router.py`
- Test: `constructo/backend/tests/test_chat_api.py`

The current `GET /messages`, `POST /read`, `WS /ws` resolve the conversation from `site_id` + `kind=site`. Add a `conversation_id` alternative that loads the conversation and gates with `require_access`. Keep `site_id` for back-compat.

- [ ] **Step 1: Add a shared resolver in `router.py`**

```python
from app.chat.access import require_access  # add to imports

async def _resolve_conversation(
    session: AsyncSession,
    user: User,
    *,
    site_id: UUID | None,
    conversation_id: UUID | None,
) -> Conversation | None:
    """Resolve + authorize a conversation by either key. Returns None when a
    site thread doesn't exist yet (callers treat that as 'empty')."""
    if conversation_id is not None:
        conv = await session.get(Conversation, conversation_id)
        if conv is None:
            raise AppError(404, "not_found", "Conversation not found")
        await require_access(session, user, conv)
        return conv
    if site_id is None:
        raise AppError(422, "missing_target", "Provide site_id or conversation_id")
    # back-compat: the derived site thread
    await _require_site(session, user, site_id)
    return (
        await session.execute(
            select(Conversation).where(
                Conversation.site_id == site_id, Conversation.kind == ConversationKind.site
            )
        )
    ).scalar_one_or_none()
```

- [ ] **Step 2: Use it in `list_messages`**

Change the signature to accept an optional `conversation_id` query param and replace the inline `_require_site` + conversation lookup:
```python
@router.get("/messages", response_model=list[ChatMessageOut])
async def list_messages(
    site_id: UUID | None = Query(None),
    conversation_id: UUID | None = Query(None),
    after_seq: int = Query(0, ge=0),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ChatMessageOut]:
    conv = await _resolve_conversation(session, user, site_id=site_id, conversation_id=conversation_id)
    if conv is None:
        return []
    # ...unchanged from here (the existing rows query + event attach)...
```

- [ ] **Step 3: Use it in `mark_read`**

Generalize `ChatReadIn` to accept either key, and resolve via the helper:
```python
class ChatReadIn(BaseModel):
    site_id: UUID | None = None
    conversation_id: UUID | None = None
    last_seq: int = Field(ge=0)
```
```python
@router.post("/read", status_code=204)
async def mark_read(body: ChatReadIn, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)) -> None:
    conv = await _resolve_conversation(session, user, site_id=body.site_id, conversation_id=body.conversation_id)
    if conv is None:
        return
    cursor = await session.get(ConversationRead, (conv.id, user.id))
    if cursor is None:
        session.add(ConversationRead(conversation_id=conv.id, user_id=user.id, last_read_seq=body.last_seq))
    else:
        cursor.last_read_seq = max(cursor.last_read_seq, body.last_seq)
    await session.commit()
```

- [ ] **Step 4: Generalize the WS endpoint**

Accept `conversation_id` (optional) alongside `site_id`; after decoding the token to a `user`, resolve + `require_access` instead of the inline site logic:
```python
@router.websocket("/ws")
async def chat_ws(
    websocket: WebSocket,
    site_id: UUID | None = Query(None),
    conversation_id: UUID | None = Query(None),
    token: str = Query(...),
    session: AsyncSession = Depends(get_session),
) -> None:
    try:
        user = await session.get(User, UUID(decode_token(token)["sub"]))
    except Exception:
        await websocket.close(code=1008)
        return
    if user is None:
        await websocket.close(code=1008)
        return
    try:
        conv = await _resolve_conversation(session, user, site_id=site_id, conversation_id=conversation_id)
    except AppError:
        await websocket.close(code=1008)
        return
    if conv is None:
        await websocket.close(code=1011)
        return
    await websocket.accept()
    try:
        async with broadcaster.subscribe(conv.id) as queue:
            while True:
                payload = await queue.get()
                await websocket.send_json(payload)
    except WebSocketDisconnect:
        return
    except Exception:  # pragma: no cover
        return
```
> Note: this removes the blanket homeowner-block at the WS layer, but `_resolve_conversation` → `require_access` → `can_access` still blocks a homeowner from `site` kind (and only lets a homeowner into a `group` they belong to). Behavior for existing site threads is unchanged.

- [ ] **Step 5: Tests** — add to `tests/test_chat_api.py`

```python
async def test_list_messages_by_conversation_id_for_group_member(client, db_session, factory, world):
    from app.models import Conversation, ConversationKind, ConversationMember, MemberRole
    company, owner, site = world
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Plumbing")
    db_session.add(conv); await db_session.flush()
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=owner.id, role=MemberRole.admin))
    await db_session.flush()
    resp = await client.get(f"/api/v1/chat/messages?conversation_id={conv.id}", headers=auth(owner))
    assert resp.status_code == 200
    assert resp.json() == []  # empty group, no messages yet


async def test_list_messages_by_conversation_id_blocks_non_member(client, db_session, factory, world):
    from app.models import Conversation, ConversationKind
    company, owner, site = world
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Secret")
    db_session.add(conv); await db_session.flush()
    stranger = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.get(f"/api/v1/chat/messages?conversation_id={conv.id}", headers=auth(stranger))
    assert resp.status_code == 403


async def test_existing_site_keyed_list_still_works(client, world):
    company, owner, site = world
    await client.post("/api/v1/chat/messages", json={"site_id": str(site.id), "client_msg_id": str(__import__('uuid').uuid4()), "body": "hi"}, headers=auth(owner))
    resp = await client.get(f"/api/v1/chat/messages?site_id={site.id}&after_seq=0", headers=auth(owner))
    assert resp.status_code == 200 and len(resp.json()) == 1
```
Run `pytest tests/test_chat_api.py -v` — all green (old + new).

---

## Task 6: Backend — extend the inbox to include groups

**Files:**
- Modify: `constructo/backend/app/chat/router.py` (`list_conversations`)
- Test: `constructo/backend/tests/test_chat_api.py`

Extend `GET /chat/conversations` to also return the caller's **group** memberships (non-archived), with `has_homeowner` = a member is a homeowner-role user. Keep the existing site-thread rows.

- [ ] **Step 1: Add group rows in `list_conversations`** (after building the site rows, before returning)

```python
    # Groups the caller is an explicit member of (non-archived).
    group_rows = (
        await session.execute(
            select(Conversation)
            .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
            .where(
                ConversationMember.user_id == user.id,
                Conversation.kind == ConversationKind.group,
                Conversation.archived_at.is_(None),
            )
        )
    ).scalars().all()

    out_groups: list[ConversationOut] = []
    if group_rows:
        g_ids = [g.id for g in group_rows]
        # has_homeowner: any member of the group is a homeowner-role user
        ho_group_ids = set(
            (
                await session.execute(
                    select(ConversationMember.conversation_id)
                    .join(User, User.id == ConversationMember.user_id)
                    .where(
                        ConversationMember.conversation_id.in_(g_ids),
                        User.role == UserRole.homeowner,
                    )
                    .distinct()
                )
            ).scalars().all()
        )
        g_reads = {
            r.conversation_id: r.last_read_seq
            for r in (
                await session.execute(
                    select(ConversationRead).where(
                        ConversationRead.conversation_id.in_(g_ids),
                        ConversationRead.user_id == user.id,
                    )
                )
            ).scalars().all()
        }
        for g in group_rows:
            out_groups.append(
                ConversationOut(
                    id=g.id,
                    kind=g.kind,
                    site_id=g.site_id,
                    title=g.title,
                    site_name=None,
                    last_message_at=g.last_message_at,
                    unread_count=max(0, g.last_seq - g_reads.get(g.id, 0)),
                    has_homeowner=g.id in ho_group_ids,
                )
            )
```
Then merge + sort the combined list by `last_message_at` (nulls last) before returning. Replace the current `return [...]` with: build the site list into a variable `out_sites`, then:
```python
    combined = out_sites + out_groups
    combined.sort(key=lambda c: (c.last_message_at is None, c.last_message_at), reverse=False)
    # newest first: invert — None last, newest first
    combined.sort(key=lambda c: c.last_message_at or _MIN_DT, reverse=True)
    return combined
```
> Define `_MIN_DT = datetime(1970, 1, 1, tzinfo=UTC)` (module-level) to avoid comparing `None`. Confirm `UTC`/`datetime` are imported. (The site-only query previously ordered in SQL; now that two sources merge, ordering happens in Python — keep it correct and simple.)

- [ ] **Step 2: Test**

```python
async def test_inbox_includes_groups_for_members(client, db_session, factory, world):
    from app.models import Conversation, ConversationKind, ConversationMember, MemberRole
    company, owner, site = world
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Plumbing")
    db_session.add(conv); await db_session.flush()
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=owner.id, role=MemberRole.admin))
    await db_session.flush()
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    kinds = {(r["kind"], r["title"]) for r in resp.json()}
    assert ("group", "Plumbing") in kinds


async def test_inbox_excludes_archived_groups(client, db_session, world):
    from app.models import Conversation, ConversationKind, ConversationMember, MemberRole
    from datetime import datetime, UTC
    company, owner, site = world
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Old", archived_at=datetime.now(UTC))
    db_session.add(conv); await db_session.flush()
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=owner.id, role=MemberRole.admin))
    await db_session.flush()
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert all(r["title"] != "Old" for r in resp.json())
```

- [ ] **Step 3: Local gate + commit PR 2** (Tasks 4–6 together)

```bash
cd constructo/backend
DATABASE_URL=...:5433/constructo uv run ruff check . && DATABASE_URL=...:5433/constructo uv run pytest
cd /Users/aryantripathi/Developer/contructionAI
git checkout main && git pull --ff-only && git checkout -b feat/groups-access-read
git add constructo/backend/app/chat/access.py constructo/backend/app/chat/router.py \
        constructo/backend/tests/test_chat_access.py constructo/backend/tests/test_chat_api.py
git commit -m "feat(chat): can_access resolver + conversation_id-keyed list/read/WS + groups in inbox (doc 18 Phase 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Push, PR "PR 2/6", CI green, merge.

---

## Task 7: Backend — group CRUD + members API + RBAC

**Files:**
- Create: `constructo/backend/app/chat/groups_router.py`
- Modify: `constructo/backend/app/main.py` (include the router)
- Test: `constructo/backend/tests/test_groups_api.py`

Routes (all under `/api/v1/chat`, all gated):
- `POST /chat/groups` — **owner only** (`require_role(UserRole.owner)`). Body `{name, site_id, member_user_ids[]}`. `site_id` **required** in Phase 2 and must be in the owner's visible sites. Creates `Conversation(kind=group, company_id, site_id, title=name, created_by=owner)` + members (creator as `admin`, each `member_user_ids` as `member`). Returns the group.
- `GET /chat/groups/addable-users?site_id=&group_id=` — **owner/admin**. Eligible users: all company crew (role != homeowner) + active homeowner-role users who are `HomeownerMember`s of that site. Each row `{user_id, name, role, already_member}` (already_member computed if `group_id` given). Vendors are not Users → naturally excluded.
- `GET /chat/groups/{id}/members` — any member. Returns members with role + name.
- `POST /chat/groups/{id}/members` — admin. Body `{user_ids[]}`. Adds as `member` (idempotent — skip existing).
- `DELETE /chat/groups/{id}/members/{user_id}` — admin, OR self (leave). Removes the row. (Guard: cannot remove the last admin — if removing would leave zero admins, 409.)
- `PATCH /chat/groups/{id}` — admin. Body `{name?, archived?, member_role?: {user_id, role}}`. Rename / set `archived_at` / delegate-or-demote a member's role.

- [ ] **Step 1: Write `app/chat/groups_router.py`** (skeleton — fill bodies per the contract above)

```python
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.chat.access import is_group_admin, load_group_or_404, require_access, require_group_admin
from app.core.errors import AppError  # match real path
from app.db import get_session
from app.models import (
    Conversation, ConversationKind, ConversationMember, HomeownerMember, MemberRole, User, UserRole,
)
from app.sites.router import effective_visible_site_ids

router = APIRouter(prefix="/api/v1/chat", tags=["chat-groups"])


class GroupCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    site_id: UUID                       # required in Phase 2 (company-wide is Phase 4)
    member_user_ids: list[UUID] = []


class MemberOut(BaseModel):
    user_id: UUID
    name: str | None
    role: MemberRole
    is_homeowner: bool


class GroupOut(BaseModel):
    id: UUID
    name: str | None
    site_id: UUID | None
    archived: bool
    members: list[MemberOut]


class AddableUserOut(BaseModel):
    user_id: UUID
    name: str | None
    role: UserRole
    already_member: bool


async def _group_out(session: AsyncSession, conv: Conversation) -> GroupOut:
    rows = (
        await session.execute(
            select(ConversationMember, User)
            .join(User, User.id == ConversationMember.user_id)
            .where(ConversationMember.conversation_id == conv.id)
        )
    ).all()
    members = [
        MemberOut(user_id=u.id, name=u.name, role=m.role, is_homeowner=u.role is UserRole.homeowner)
        for m, u in rows
    ]
    return GroupOut(id=conv.id, name=conv.title, site_id=conv.site_id, archived=conv.archived_at is not None, members=members)


@router.post("/groups", response_model=GroupOut, status_code=201)
async def create_group(
    body: GroupCreateIn,
    user: User = Depends(require_role(UserRole.owner)),
    session: AsyncSession = Depends(get_session),
) -> GroupOut:
    visible = await effective_visible_site_ids(session, user)
    if body.site_id not in visible:
        raise AppError(403, "forbidden", "Not your site")
    conv = Conversation(company_id=user.company_id, site_id=body.site_id, kind=ConversationKind.group, title=body.name, created_by=user.id)
    session.add(conv)
    await session.flush()
    session.add(ConversationMember(conversation_id=conv.id, user_id=user.id, role=MemberRole.admin, added_by=user.id))
    seen = {user.id}
    for uid in body.member_user_ids:
        if uid in seen:
            continue
        target = await session.get(User, uid)
        if target is None or target.company_id != user.company_id:
            continue  # ignore foreign/unknown users silently
        session.add(ConversationMember(conversation_id=conv.id, user_id=uid, role=MemberRole.member, added_by=user.id))
        seen.add(uid)
    await session.commit()
    await session.refresh(conv)
    return await _group_out(session, conv)
```
Then implement `GET /groups/addable-users`, `GET /groups/{id}/members`, `POST /groups/{id}/members`, `DELETE /groups/{id}/members/{user_id}`, `PATCH /groups/{id}` per the contract. For `addable-users`: union company crew (`User.company_id == user.company_id AND role != homeowner`) with homeowner-role users that are `HomeownerMember`s of `site_id`; mark `already_member` via a membership lookup when `group_id` is passed. For the **last-admin guard** in DELETE + PATCH-demote: count admins; refuse (409 `last_admin`) if the change would drop admins to zero.

- [ ] **Step 2: Include the router in `app/main.py`**

```python
from app.chat.groups_router import router as chat_groups_router
...
app.include_router(chat_groups_router)
```

- [ ] **Step 3: Tests in `tests/test_groups_api.py`** (RBAC matrix per doc 18 §11)

Cover: owner creates a group (creator is admin, members added); non-owner create → 403; admin adds/removes members; admin renames + archives; admin delegates admin (PATCH member_role) and a demoted member then gets 403 on manage; self-leave works; removing the last admin → 409; `addable-users` returns crew + the site's homeowner, excludes a stranger company's user, and flags `already_member`. Example:

```python
async def test_owner_creates_group_as_admin(client, factory, world):
    company, owner, site = world
    sup = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.post("/api/v1/chat/groups", json={"name": "Plumbing", "site_id": str(site.id), "member_user_ids": [str(sup.id)]}, headers=auth(owner))
    assert resp.status_code == 201, resp.text
    g = resp.json()
    roles = {m["user_id"]: m["role"] for m in g["members"]}
    assert roles[str(owner.id)] == "admin"
    assert roles[str(sup.id)] == "member"


async def test_non_owner_cannot_create_group(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm)
    resp = await client.post("/api/v1/chat/groups", json={"name": "X", "site_id": str(site.id)}, headers=auth(pm))
    assert resp.status_code == 403


async def test_delegated_admin_can_manage_demoted_member_cannot(client, factory, world):
    company, owner, site = world
    pm = await factory.user(company=company, role=UserRole.pm)
    g = (await client.post("/api/v1/chat/groups", json={"name": "G", "site_id": str(site.id), "member_user_ids": [str(pm.id)]}, headers=auth(owner))).json()
    gid = g["id"]
    # delegate admin to pm
    r = await client.patch(f"/api/v1/chat/groups/{gid}", json={"member_role": {"user_id": str(pm.id), "role": "admin"}}, headers=auth(owner))
    assert r.status_code == 200
    # pm (now admin) can rename
    assert (await client.patch(f"/api/v1/chat/groups/{gid}", json={"name": "G2"}, headers=auth(pm))).status_code == 200
    # demote pm back to member
    await client.patch(f"/api/v1/chat/groups/{gid}", json={"member_role": {"user_id": str(pm.id), "role": "member"}}, headers=auth(owner))
    # pm can no longer manage
    assert (await client.patch(f"/api/v1/chat/groups/{gid}", json={"name": "G3"}, headers=auth(pm))).status_code == 403
```

- [ ] **Step 4: Local gate + commit PR 3** (push, PR "PR 3/6", CI, merge).

---

## Task 8: Backend — `require_role` confirm + edge polish

- [ ] **Step 1:** Confirm `require_role` exists at `app/auth/deps.py` and returns the user (the explore confirmed `def require_role(*roles)`). Confirm `HomeownerMember` import path (`app.models.homeowner_member`) for addable-users. No new code if all present; otherwise adjust imports in `groups_router.py`. (This task is a checkpoint folded into PR 3 — no separate commit.)

---

## Task 9: Backend — group send authorization seam (no behavior yet)

This is a checkpoint: confirm that after PR 3, a group exists but **sending into it still requires the generalized send path (PR 4)**. No code. Verify `POST /chat/messages` with a `conversation_id` currently 422s or ignores it (since `ChatSendIn` has no `conversation_id` yet) — this is expected and fixed in Task 10. (Folded into PR 3 review notes.)

---

## Task 10: Backend — generalize the SEND path + site-group capture (money-sensitive)

**Files:**
- Modify: `constructo/backend/app/chat/router.py` (`ChatSendIn`, `send_message`)
- Test: `constructo/backend/tests/test_chat_api.py`

- [ ] **Step 1: Extend `ChatSendIn`**

```python
class ChatSendIn(BaseModel):
    site_id: UUID | None = None
    conversation_id: UUID | None = None
    client_msg_id: UUID
    body: str | None = None
    # ...rest unchanged...
```

- [ ] **Step 2: Generalize `send_message`**

Replace the opening of `send_message` (the `_require_site` + `_get_or_create_site_conversation` pair) with:
```python
    if body.conversation_id is not None:
        conv = await session.get(Conversation, body.conversation_id)
        if conv is None:
            raise AppError(404, "not_found", "Conversation not found")
        await require_access(session, user, conv)
        if conv.kind is ConversationKind.homeowner:
            raise AppError(403, "forbidden", "Homeowner channel is not open yet")  # Phase 3
        target_site_id = conv.site_id  # group's site (site-scoped) or None (company-wide, Phase 4)
    else:
        if body.site_id is None:
            raise AppError(422, "missing_target", "Provide site_id or conversation_id")
        await _require_site(session, user, body.site_id)
        conv = await _get_or_create_site_conversation(session, user, body.site_id)
        target_site_id = body.site_id
```
Everywhere downstream that used `body.site_id`, use `target_site_id`:
- `_reply_context(session, conv.id, ...)` — unchanged (keys on `conv.id`).
- The `RawMessage(external_group_id=f"app:{body.site_id}", raw={... "site_id": str(body.site_id) ...})` — change to `f"app:{target_site_id}"` and `str(target_site_id)`.
- `_propose_action_item(session, user, body.site_id, ...)` — change to `target_site_id`.
- **Talk-only guard (forward-compat for Phase 4):** only mint the `RawMessage` + `enqueue_extraction` when `target_site_id is not None`. If `target_site_id is None` (a company-wide group — not creatable in Phase 2, but be defensive), skip the raw/extraction block entirely (the message is still stored + broadcast).

> The extraction worker is **unchanged**: a site-group's raw carries `external_group_id="app:{site_id}"`, so `_resolve_site_id` files events to that site exactly like the crew thread.

- [ ] **Step 3: Tests** — add to `tests/test_chat_api.py`

```python
async def test_group_message_mints_event_to_site(client, db_session, factory, world):
    from app.models import Conversation, ConversationKind, ConversationMember, MemberRole
    from app.models.raw_message import RawMessageModel  # match real path
    from sqlalchemy import select
    company, owner, site = world
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Plumbing")
    db_session.add(conv); await db_session.flush()
    db_session.add(ConversationMember(conversation_id=conv.id, user_id=owner.id, role=MemberRole.admin))
    await db_session.flush()
    resp = await client.post("/api/v1/chat/messages", json={"conversation_id": str(conv.id), "client_msg_id": str(__import__('uuid').uuid4()), "body": "cement 50 bori aa gaya"}, headers=auth(owner))
    assert resp.status_code == 201, resp.text
    raw = (await db_session.execute(select(RawMessageModel).where(RawMessageModel.external_group_id == f"app:{site.id}"))).scalars().all()
    assert any(r.text == "cement 50 bori aa gaya" for r in raw)


async def test_group_send_blocks_non_member(client, db_session, factory, world):
    from app.models import Conversation, ConversationKind
    company, owner, site = world
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.group, title="Private")
    db_session.add(conv); await db_session.flush()
    stranger = await factory.user(company=company, role=UserRole.supervisor)
    resp = await client.post("/api/v1/chat/messages", json={"conversation_id": str(conv.id), "client_msg_id": str(__import__('uuid').uuid4()), "body": "hi"}, headers=auth(stranger))
    assert resp.status_code == 403


async def test_site_keyed_send_unchanged(client, world):
    company, owner, site = world
    resp = await client.post("/api/v1/chat/messages", json={"site_id": str(site.id), "client_msg_id": str(__import__('uuid').uuid4()), "body": "hi"}, headers=auth(owner))
    assert resp.status_code == 201 and resp.json()["seq"] == 1
```
Run the full `tests/test_chat_api.py` — every existing send/dedupe/reply/approval test must still pass (the crew thread path is untouched behaviorally).

- [ ] **Step 4: Local gate + commit PR 4** (push, PR "PR 4/6 — generalized send + site-group capture", CI, merge). **Founder to-do generated here:** the prod Neon migration (PR 1) must be applied before this path is exercised on prod (groups need the `conversation_members` table); note it.

---

## Task 11: Mobile — groups API module + chatApi conversation_id

**Files:**
- Create: `constructo/mobile/src/api/groups.ts`
- Modify: `constructo/mobile/src/api/chat.ts`
- Test: `constructo/mobile/src/api/groups.test.ts`

- [ ] **Step 1: `src/api/groups.ts`** (match the `actionItems.ts` module shape + the shared `request<T>` + `qs` helper)

```ts
import { request } from './client'

export type MemberRole = 'admin' | 'member'

export interface GroupMember {
  user_id: string
  name: string | null
  role: MemberRole
  is_homeowner: boolean
}
export interface Group {
  id: string
  name: string | null
  site_id: string | null
  archived: boolean
  members: GroupMember[]
}
export interface AddableUser {
  user_id: string
  name: string | null
  role: string
  already_member: boolean
}

export const groupsApi = {
  create(body: { name: string; site_id: string; member_user_ids: string[] }) {
    return request<Group>('/api/v1/chat/groups', { method: 'POST', body: JSON.stringify(body) })
  },
  members(id: string) {
    return request<{ members: GroupMember[] }>(`/api/v1/chat/groups/${id}/members`)
  },
  addMembers(id: string, userIds: string[]) {
    return request<Group>(`/api/v1/chat/groups/${id}/members`, { method: 'POST', body: JSON.stringify({ user_ids: userIds }) })
  },
  removeMember(id: string, userId: string) {
    return request<void>(`/api/v1/chat/groups/${id}/members/${userId}`, { method: 'DELETE' })
  },
  patch(id: string, body: { name?: string; archived?: boolean; member_role?: { user_id: string; role: MemberRole } }) {
    return request<Group>(`/api/v1/chat/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  addableUsers(siteId: string, groupId?: string) {
    const q = new URLSearchParams({ site_id: siteId })
    if (groupId) q.set('group_id', groupId)
    return request<AddableUser[]>(`/api/v1/chat/groups/addable-users?${q.toString()}`)
  },
}
```
> Confirm the `GET /groups/{id}/members` response shape matches (`{members: [...]}` vs a bare list) and align the type to the backend. Confirm the `POST /members` body key the backend expects (`user_ids` per Task 7).

- [ ] **Step 2: `src/api/chat.ts` — accept `conversationId` on `messages` + `read`**

```ts
  messages(opts: { siteId?: string; conversationId?: string; afterSeq?: number }): Promise<ChatMessage[]> {
    const q = new URLSearchParams()
    if (opts.conversationId) q.set('conversation_id', opts.conversationId)
    else if (opts.siteId) q.set('site_id', opts.siteId)
    q.set('after_seq', String(opts.afterSeq ?? 0))
    return request<ChatMessage[]>(`/api/v1/chat/messages?${q.toString()}`)
  },
  read(opts: { siteId?: string; conversationId?: string; lastSeq: number }): Promise<void> {
    return request<void>('/api/v1/chat/read', {
      method: 'POST',
      body: JSON.stringify(opts.conversationId ? { conversation_id: opts.conversationId, last_seq: opts.lastSeq } : { site_id: opts.siteId, last_seq: opts.lastSeq }),
    })
  },
```
> **This changes `messages`/`read` call signatures.** Update the existing callers: `app/(contractor)/owner/chat/[id].tsx` and the supervisor screen `app/(contractor)/supervisor/chat.tsx` (it calls `chatApi.messages(site.id)` / `chatApi.read(site.id, seq)`). Convert those to the object form (`chatApi.messages({ siteId: site.id, afterSeq })`, `chatApi.read({ siteId: site.id, lastSeq: seq })`). Search the whole mobile app for `chatApi.messages(` and `chatApi.read(` and update every call site. Keep `send` and `conversations` unchanged.

- [ ] **Step 3: `src/api/groups.test.ts`** — a shape guard (mirror `chat.conversations.test.ts`). Then `npm run typecheck && npm test`. (Commit with Task 12 as PR 5.)

---

## Task 12: Mobile — render group threads in the owner detail

**Files:**
- Modify: `constructo/mobile/app/(contractor)/owner/chat/index.tsx` (pass `kind` in nav params)
- Modify: `constructo/mobile/app/(contractor)/owner/chat/[id].tsx` (fetch by conversation_id when group)

> **Pre-task:** invoke `constructo-design-system`.

- [ ] **Step 1: Pass `kind` + `convId` from the inbox**

In `open()` add `kind: c.kind` and `convId: c.id` to params (keep `siteId`, `title`, `hasHomeowner`).

- [ ] **Step 2: Branch the query in the detail**

```tsx
const { id, kind, siteId, title, hasHomeowner } = useLocalSearchParams<{
  id: string; kind?: string; siteId?: string; title?: string; hasHomeowner?: string
}>()
const isGroup = kind === 'group'
const q = useQuery({
  queryKey: ['owner', 'chat', id],
  queryFn: () => chatApi.messages(isGroup ? { conversationId: id, afterSeq: 0 } : { siteId, afterSeq: 0 }),
  refetchInterval: 8000,
  enabled: isGroup ? !!id : !!siteId,
})
```
Update `send` to target the conversation when group: `chatApi.send({ conversation_id: id, ... })` vs `{ site_id: siteId, ... }` (add `conversation_id?: string` to `ChatSendBody` if not present). Update mark-read to `chatApi.read(isGroup ? { conversationId: id, lastSeq } : { siteId, lastSeq })`. Remove the old `!siteId → unavailable` dead-end for groups (a group has no siteId but is valid).

- [ ] **Step 3:** `npm run typecheck && npm test`; commit PR 5 (Tasks 11–12), push "PR 5/6", CI, merge.

---

## Task 13: Mobile — New-group creation flow

**Files:**
- Create: `constructo/mobile/app/(contractor)/owner/_group_sheets.tsx` (`NewGroupSheet`)
- Modify: `constructo/mobile/app/(contractor)/owner/chat/index.tsx` (a "+ New group" header button, owner-only)

> **Pre-task:** invoke `constructo-design-system`. Modal sheet pattern from `supervisor/_dispute.tsx`; multi-select built on the `selected: Set<string>` toggle from `owner/approvals.tsx`; `useMutation`+invalidate; `useInputStyle` for the name field; ≥48px; bilingual; amber-fill primary button.

- [ ] **Step 1: `NewGroupSheet`** — a `Modal` (slide) with: a name `TextInput`; a site picker (the owner's sites — reuse the existing site list source, e.g. `owner.sites()`/the sites query the inbox or approvals use); a multi-select member list from `groupsApi.addableUsers(siteId)` (checkbox rows, `selected` Set, show role + a "client" tag for `is_homeowner`); a Create button (disabled until name + site set). On create: `groupsApi.create({ name, site_id, member_user_ids: [...selected] })`, then `qc.invalidateQueries(['owner','conversations'])`, close, and `router.push` into the new group thread. Surface errors inline (`<Small color={STATUS.risk}>`).

- [ ] **Step 2:** Add a "+ New group" affordance to the inbox header, shown only when `me.role === 'owner'` (read role from `useAuth()`/AuthContext). Opens `NewGroupSheet`.

- [ ] **Step 3:** `npm run typecheck && npm test`. (Commit with Task 14 as PR 6.)

---

## Task 14: Mobile — group manage sheet

**Files:**
- Modify: `constructo/mobile/app/(contractor)/owner/_group_sheets.tsx` (add `ManageGroupSheet`)
- Modify: `constructo/mobile/app/(contractor)/owner/chat/[id].tsx` (a "Manage" header action for group threads, admins only)

> **Pre-task:** invoke `constructo-design-system`.

- [ ] **Step 1: `ManageGroupSheet`** — opened from the group detail header (show the action only when the caller is an admin — determine via `groupsApi.members(id)` and matching `me.id` to an `admin` row). Capabilities: rename (TextInput + `groupsApi.patch(id,{name})`); add members (`groupsApi.addableUsers(siteId, id)` multi-select → `groupsApi.addMembers`); remove a member (`groupsApi.removeMember`, with a confirm; the last-admin 409 surfaces as an inline error); delegate/demote admin (`groupsApi.patch(id,{member_role:{user_id, role}})`); archive (`groupsApi.patch(id,{archived:true})` → close + invalidate inbox + pop the screen). Each mutation invalidates `['owner','conversations']` and the group's member query.

- [ ] **Step 2:** Wire the "Manage" header button into `chat/[id].tsx` for `isGroup` threads, admin-only. Show the "Client is in this thread" cue when any member `is_homeowner` (the detail already has a `hasHomeowner` param; for groups also reflect the live member list).

- [ ] **Step 3:** `npm run typecheck && npm test`; commit PR 6 (Tasks 13–14), push "PR 6/6", CI, merge.

---

## Self-Review (against doc 18 §3–§11 for Phase 2)

**Spec coverage:**
- §3 schema (kind=group, nullable site_id, partial unique index, archived_at, conversation_members + member_role) → Tasks 1–3. ✓
- §3.3 one migration off `f7a8b9c0d1e2`, no backfill → Task 3. ✓
- §4 single `can_access` resolver (derived site/homeowner, explicit group; homeowner never on raw site; create=owner, manage=admin) → Tasks 4, 7. ✓ (create owner-only per founder decision; **no co-owner branch**.)
- §5 capture by kind (site + site-group extract; talk-only company-wide skipped/deferred) → Task 10. ✓
- §6 membrane: groups plain, "client present" cue via `has_homeowner` → Tasks 6, 12, 14. ✓
- §7 API surface (POST /groups, GET /conversations incl. groups, members add/remove, PATCH, GET members, addable-users; generalize messages/read/ws) → Tasks 5–7, 10. ✓
- §8 mobile (owner New-group + manage; group threads in inbox/detail) → Tasks 11–14. ✓
- §9 realtime/unread/notifications → WS generalized (Task 5); unread reuses `ConversationRead` (Task 6). ✓ (Push notifications to group members = reuses `push/sender.py`; **flagged as a small follow-up, not Phase-2-blocking** — see Founder to-dos.)
- §11 testing matrix (access resolver, RBAC, capture, membrane flag, inbox, migration round-trip) → Tasks 2,4,6,7,10 + Task 3 round-trip. ✓

**Deferred-correctly:** company-wide talk-only (Phase 4), homeowner Messages (Phase 3), supervisor group inbox, members_preview — all out of Task scope. ✓

**Placeholder scan:** backend code blocks are complete + runnable; mobile blocks specify exact APIs/files/patterns with the grounded call sites. The few "match the real path/shape" notes point at verified seams (AppError import, members response shape, the `chatApi.messages`/`read` call-site sweep) — integration-fidelity checks, not blanks.

**Type consistency:** `MemberRole` (`admin|member`), `ConversationKind.group`, `GroupOut`/`Group`, `groupsApi.*` names, and the `chatApi.messages({siteId?|conversationId?, afterSeq?})` / `read({...})` object signatures are used consistently across backend tasks and their mobile mirrors. The `chatApi.messages`/`read` signature change has an explicit "update every call site" step (Task 11 Step 2).

---

## Founder to-dos (only you can do these)

- **Apply the migration to prod Neon** after PR 1 merges (and before PR 4's group-send path is used on prod): `cd constructo/backend && DATABASE_URL=<neon> uv run alembic upgrade head` → head becomes `a7c1f2d3b4e5`. Confirm the `ALTER TYPE conversation_kind ADD VALUE 'group'` succeeds on Neon (it should on PG12+; if Neon rejects it in a txn, I'll switch the migration to an `autocommit_block`).
- **Device-test** the New-group flow + manage sheet + a group thread end-to-end (create a "Plumbing" site group, add a supervisor + the site's homeowner, post a challan photo → confirm it books a delivery to that site; delegate admin to a PM; archive).
- **Confirm Hindi copy** for the group surfaces (New group / Manage / Add members / Client in this thread / Archive).
- **Decide push-to-group-members** (reuse `push/sender.py` on new group messages, respecting `muted`) — small follow-up; say if you want it in Phase 2 or deferred.
- **Phase 2 RBAC is owner-create-only** as you chose; loosening to PM-create later is a one-line `require_role(UserRole.owner, UserRole.pm)` change when you want it.

---

## Next: Phase 3 (Homeowner Messages) is a separate plan

Activates the `homeowner` 1:1 channel as a live membrane-curated thread + the homeowner **Messages** tab + her groups. `can_access` already permits a homeowner group member; Phase 3 lifts the inbox's homeowner-role block and adds her surface.
