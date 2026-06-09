# Owner Chat Surfacing — Implementation Plan (Doc 18, Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the **owner** a first-class **Chat** tab — an inbox of every site's crew thread (unread badges, last-message preview, "client present" cue) — that taps through to the existing crew conversation, with **no schema change** (owners already have API access to those threads via `effective_visible_site_ids`).

**Architecture:** One new read-only backend endpoint `GET /api/v1/chat/conversations` returns the caller's accessible **site** conversations as an inbox (id, kind, site_id, site_name, title, last_message_at, unread_count, has_homeowner), ordered newest-first. On mobile, we extract the message-rendering primitives (`CaptureCard` + bubble) into a shared module so they can be reused outside the supervisor screen, then add an owner **Chat** tab: an inbox screen (pattern-matched to `approvals.tsx`) and a conversation-detail screen that reads + posts to the crew thread via the existing site-keyed chat API. The current owner **Search** tab moves into **More**.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic (backend, Python 3.12, `uv`); React Native + Expo Router + TanStack Query + TypeScript (mobile). Themes: Blueprint (owner/contractor app, light). Tests: pytest (backend), jest + jest-expo (mobile).

**Why Phase 1 needs no schema:** The inbox lists only `kind=site` conversations that already exist. Membership is *derived* (`effective_visible_site_ids` already returns all company sites for an owner). The detail screen reuses the existing `site_id`-keyed `/chat/messages`, `/chat/read`, `/chat/media` routes unchanged. Groups, `conversation_members`, the partial unique index, and the `conversation_id` generalization of the send/list routes are **Phase 2** (its own spec→plan→PRs).

---

## Scope & Non-Goals

**In scope (Phase 1):**
- Backend: `GET /chat/conversations` inbox endpoint (role-agnostic but homeowner-blocked; serves owner now, supervisor/PM later for free).
- Mobile: extract shared message-rendering primitives; owner **Chat** tab + inbox screen; owner conversation-detail screen (read + send/reply + mark-read); move **Search** into **More**.

**Explicitly deferred (NOT this plan):**
- Groups, `conversation_members`, RBAC, the migration — **Phase 2**.
- Homeowner **Messages** tab + activating the `homeowner` 1:1 channel — **Phase 3**.
- Company-wide talk-only groups — **Phase 4**.
- Full feature-parity of the owner thread with the supervisor screen (Radar sheet, dispute raise/resolve sheet, Catch-me-up recap, brief pin, smart-suggest chip, hold-to-talk). The owner detail ships **read + capture-cards + text/photo send + reply**; the richer tools are a fast-follow once the shared *container* is extracted (a bigger refactor best done when Phase 2/3 force 3-surface reuse).
- `members_preview` field in the inbox payload (no member rows exist until Phase 2; only `has_homeowner` ships now as a cheap per-site existence check).

---

## File Structure

**Backend (`constructo/backend/`):**
- Modify `app/chat/router.py` — add `ConversationOut` schema + `GET /conversations` route. Add `Site` / `HomeownerMember` imports.
- Modify `tests/test_chat_api.py` — add inbox tests.

**Mobile (`constructo/mobile/`):**
- Create `src/chat/MessageView.tsx` — presentational message rendering (`CaptureCard` re-export + a `MessageBubble`), moved out of the supervisor screen so owner/homeowner/groups can reuse it.
- Modify `app/(contractor)/supervisor/_components.tsx` — `CaptureCard` moves to `src/chat/MessageView.tsx`; keep a re-export here for back-compat OR update the supervisor import (Task 4 chooses the minimal diff).
- Modify `src/api/chat.ts` — add `ConversationSummary` type + `chatApi.conversations()`.
- Modify `app/(contractor)/owner/_layout.tsx` — add **Chat** tab; hide **Search** from the tab bar (`href: null`).
- Modify `app/(contractor)/owner/more.tsx` — add a row linking to Search.
- Create `app/(contractor)/owner/chat.tsx` — the inbox screen.
- Create `app/(contractor)/owner/_chat_components.tsx` — `ConversationRow`.
- Create `app/(contractor)/owner/chat/[id].tsx` — the conversation-detail screen.
- Modify `src/api/chat.ts` test (new) `src/api/chat.conversations.test.ts` — type/shape guard if a pure helper is added; otherwise covered by a render test.

---

## PR Sequencing (each branch → PR → merge ONLY when CI all-green)

- **PR 1 — Backend inbox endpoint** (Tasks 1–2). Independently shippable + fully unit-tested. No mobile.
- **PR 2 — Mobile: extract shared `MessageView`** (Task 3). Pure refactor; supervisor behavior unchanged; guarded by typecheck + existing jest. De-risks reuse.
- **PR 3 — Mobile: owner Chat tab + inbox** (Tasks 4–6). Owner can browse every site thread with unread badges; tapping opens the detail route.
- **PR 4 — Mobile: owner conversation detail** (Task 7). Read + send/reply + mark-read on the crew thread.

> **Working-agreement reminders (per session memory + vault doc 16 §4):**
> - Local gate BEFORE every push: backend `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run ruff check . && DATABASE_URL=... uv run pytest` (5 storage-env failures are pre-existing/expected locally); mobile `cd constructo/mobile && npm run typecheck && npm test`.
> - Feature branch → PR → `gh pr merge N --merge --delete-branch` only when CI is green. **Never commit to main.**
> - **Explicit `git add <paths>`** — never `-A`, and **never** stage `app/(homeowner)/updates.tsx`.
> - Invoke the `constructo-design-system` skill before each UI task (Tasks 4–7).

---

## Task 1: Backend — `GET /chat/conversations` inbox endpoint

**Files:**
- Modify: `constructo/backend/app/chat/router.py` (add `ConversationOut` near the other schemas ~line 151; add the route near the other GET routes ~line 567; add imports at top)
- Test: `constructo/backend/tests/test_chat_api.py`

**Behavior contract:**
- `GET /api/v1/chat/conversations` → `200` `list[ConversationOut]`.
- Homeowner role → `403` (same gate as `_require_site`; the homeowner channel is Phase 3).
- Lists only **existing** `kind=site` conversations whose `site_id ∈ effective_visible_site_ids(user)`. Does **not** lazily create empty threads.
- `unread_count = max(0, conversation.last_seq - last_read_seq)` where `last_read_seq` comes from `ConversationRead(conversation_id, user.id)` (0 if no cursor row).
- `has_homeowner = True` iff a `HomeownerMember` row exists for that `site_id` (the future "client present" cue).
- `site_name` resolved by join to `Site.name`. `title` is `conversation.title` (currently null for site threads; client falls back to `site_name`).
- Ordered by `last_message_at DESC NULLS LAST`.

- [ ] **Step 1: Write the failing tests**

Add to `constructo/backend/tests/test_chat_api.py` (the file already imports `uuid4`, `select`, `auth`, fixtures `client`, `db_session`, `factory`, `world`; add `func` and the models only if not already imported — `ConversationRead`, `HomeownerMember`, `SiteAssignment`, `UserRole` are referenced):

```python
async def test_conversations_inbox_lists_existing_site_threads(client, world):
    company, owner, site = world
    # A site thread only exists after the first send.
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert len(data) == 1
    row = data[0]
    assert row["site_id"] == str(site.id)
    assert row["kind"] == "site"
    assert row["site_name"] == site.name
    assert row["unread_count"] == 1          # sender's own message, cursor not advanced
    assert row["has_homeowner"] is False
    assert row["last_message_at"] is not None


async def test_conversations_inbox_excludes_sites_without_a_thread(client, factory, world):
    company, owner, site = world
    await factory.site(company, name="Site B")  # no messages -> no conversation row
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    site_ids = {r["site_id"] for r in resp.json()}
    assert site_ids == {str(site.id)}


async def test_conversations_inbox_unread_clears_after_read(client, world):
    company, owner, site = world
    sent = await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    seq = sent.json()["seq"]
    await client.post(
        "/api/v1/chat/read",
        json={"site_id": str(site.id), "last_seq": seq},
        headers=auth(owner),
    )
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.json()[0]["unread_count"] == 0


async def test_conversations_inbox_has_homeowner_flag(client, db_session, world):
    from app.models.homeowner_member import HomeownerMember
    company, owner, site = world
    await client.post(
        "/api/v1/chat/messages",
        json={"site_id": str(site.id), "client_msg_id": str(uuid4()), "body": "hi"},
        headers=auth(owner),
    )
    db_session.add(HomeownerMember(site_id=site.id, join_code="ABC123"))
    await db_session.flush()
    resp = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert resp.json()[0]["has_homeowner"] is True


async def test_conversations_inbox_scoped_to_assigned_sites_for_supervisor(
    client, db_session, factory, world
):
    from app.models.site_assignment import SiteAssignment
    company, owner, site = world
    other = await factory.site(company, name="Site B")
    # Threads exist on both sites.
    for s in (site, other):
        await client.post(
            "/api/v1/chat/messages",
            json={"site_id": str(s.id), "client_msg_id": str(uuid4()), "body": "x"},
            headers=auth(owner),
        )
    sup = await factory.user(company=company, role=UserRole.supervisor)
    db_session.add(SiteAssignment(site_id=site.id, user_id=sup.id))
    await db_session.flush()
    resp = await client.get("/api/v1/chat/conversations", headers=auth(sup))
    assert {r["site_id"] for r in resp.json()} == {str(site.id)}  # not `other`


async def test_conversations_inbox_forbidden_for_homeowner(client, factory, world):
    company, owner, site = world
    ho = await factory.user(company=company, role=UserRole.homeowner)
    resp = await client.get("/api/v1/chat/conversations", headers=auth(ho))
    assert resp.status_code == 403
```

> **Note on imports in the test file:** `UserRole` and `SiteAssignment` are already used by existing tests in this file (e.g. `test_unassigned_site_is_forbidden`), so reuse those imports. If `HomeownerMember` / `SiteAssignment` are imported inline above, keep them inline to avoid touching the header. Verify `factory.site(company, name=...)` and `factory.user(company=..., role=...)` signatures match the existing fixture (they do, per `conftest.py`). Confirm `HomeownerMember(site_id=..., join_code=...)` satisfies NOT NULL columns; if `join_code` uniqueness or another NOT NULL column bites, set the minimal fields the model requires (check `app/models/homeowner_member.py`).

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo \
  uv run pytest tests/test_chat_api.py -k conversations_inbox -v
```
Expected: FAIL — `404 Not Found` (route doesn't exist yet) / assertion errors.

- [ ] **Step 3: Add imports to `app/chat/router.py`**

At the top of `app/chat/router.py`, alongside the existing model imports, add:

```python
from app.models.site import Site
from app.models.homeowner_member import HomeownerMember
```

> Verify the existing import style: the file already imports `Conversation, ConversationKind, ConversationRead, ChatMessage` from `app.models.chat` and `effective_visible_site_ids` from `app.sites.router`, plus `UserRole`. Match that. Confirm `Site` lives at `app.models.site` (it is imported as `Site` in `app/auth/scoping.py` and `app/sites/router.py` — copy whichever path those use).

- [ ] **Step 4: Add the `ConversationOut` schema**

In `app/chat/router.py`, after `ChatMessageOut` (~line 151), add:

```python
class ConversationOut(BaseModel):
    """One row in the chat inbox (owner Chat tab / future supervisor + homeowner)."""

    id: UUID
    kind: ConversationKind
    site_id: UUID | None
    title: str | None
    site_name: str | None
    last_message_at: datetime | None
    unread_count: int
    has_homeowner: bool
```

- [ ] **Step 5: Add the `GET /conversations` route**

In `app/chat/router.py`, near the other GET routes (after `GET /messages` ~line 567, before `GET /brief`), add:

```python
@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ConversationOut]:
    """The chat inbox: every site crew thread the caller can access, with unread
    counts and a 'client present' cue. Membership is derived from site scope
    (no group rows in Phase 1). Homeowner role is blocked (Phase 3)."""
    if user.role is UserRole.homeowner:
        raise AppError(403, "forbidden", "Homeowner chat is not available yet")
    visible = await effective_visible_site_ids(session, user)
    if not visible:
        return []
    rows = (
        await session.execute(
            select(Conversation, Site.name)
            .join(Site, Site.id == Conversation.site_id)
            .where(
                Conversation.kind == ConversationKind.site,
                Conversation.site_id.in_(visible),
            )
            .order_by(Conversation.last_message_at.desc().nullslast())
        )
    ).all()
    if not rows:
        return []

    conv_ids = [conv.id for conv, _ in rows]
    site_ids = [conv.site_id for conv, _ in rows]

    reads = {
        r.conversation_id: r.last_read_seq
        for r in (
            await session.execute(
                select(ConversationRead).where(
                    ConversationRead.conversation_id.in_(conv_ids),
                    ConversationRead.user_id == user.id,
                )
            )
        )
        .scalars()
        .all()
    }
    homeowner_site_ids = set(
        (
            await session.execute(
                select(HomeownerMember.site_id)
                .where(HomeownerMember.site_id.in_(site_ids))
                .distinct()
            )
        )
        .scalars()
        .all()
    )

    return [
        ConversationOut(
            id=conv.id,
            kind=conv.kind,
            site_id=conv.site_id,
            title=conv.title,
            site_name=site_name,
            last_message_at=conv.last_message_at,
            unread_count=max(0, conv.last_seq - reads.get(conv.id, 0)),
            has_homeowner=conv.site_id in homeowner_site_ids,
        )
        for conv, site_name in rows
    ]
```

> **Ordering note:** Postgres defaults `DESC` to `NULLS FIRST`; `.nullslast()` forces null `last_message_at` (never-messaged threads — shouldn't exist here, but safe) to the bottom. **Definition order matters:** ensure `list_conversations` is defined *before* any catch-all `/{...}` path on this router so the literal path wins; the existing routes are literal, so appending near `GET /messages` is safe.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo \
  uv run pytest tests/test_chat_api.py -k conversations_inbox -v
```
Expected: PASS (6 tests).

- [ ] **Step 7: Run the full local gate**

```bash
cd constructo/backend
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run ruff check .
DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run pytest
```
Expected: ruff clean; pytest green except the 5 known storage-env failures.

- [ ] **Step 8: Commit**

```bash
cd /Users/aryantripathi/Developer/contructionAI
git checkout -b feat/owner-chat-inbox-api
git add constructo/backend/app/chat/router.py constructo/backend/tests/test_chat_api.py
git commit -m "feat(chat): GET /chat/conversations inbox endpoint (owner Chat surfacing 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend — open the PR and merge green

- [ ] **Step 1: Push + open PR**

```bash
cd /Users/aryantripathi/Developer/contructionAI
git push -u origin feat/owner-chat-inbox-api
gh pr create --title "feat(chat): owner Chat inbox API (doc 18 Phase 1, PR 1/4)" \
  --body "$(cat <<'EOF'
Adds `GET /api/v1/chat/conversations` — the chat inbox endpoint that powers the
owner Chat tab. Read-only, no schema change. Lists existing `kind=site`
conversations the caller can access (derived from `effective_visible_site_ids`),
with `unread_count`, `last_message_at`, `site_name`, and a `has_homeowner`
"client present" cue. Homeowner role is blocked (Phase 3 activates her channel).

Part of doc 18 (Multi-Role Chat & Groups), Phase 1 — owner Chat surfacing.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Poll CI; merge only when all-green**

```bash
gh pr checks --watch
gh pr merge --merge --delete-branch
```
Expected: all checks green, branch merged + deleted.

---

## Task 3: Mobile — extract a shared `MessageView` (refactor; supervisor unchanged)

**Goal:** Move the presentational message-rendering primitives out of the supervisor screen into `src/chat/` so the owner detail (Task 7) and future homeowner/groups surfaces can reuse them without importing across route groups. **No behavior change** to the supervisor screen.

**Files:**
- Create: `constructo/mobile/src/chat/MessageView.tsx`
- Modify: `constructo/mobile/app/(contractor)/supervisor/_components.tsx` (move `CaptureCard` out; re-export from the new module)
- Modify: `constructo/mobile/app/(contractor)/supervisor/chat.tsx` (update import path only if needed)

> **Pre-task:** Invoke the `constructo-design-system` skill (Blueprint app theme; ≥48px; Mono for amounts/timestamps; status-spine color + shape; warm `--paper`, never pure white; never emoji).

- [ ] **Step 1: Read the current `CaptureCard` + bubble implementation**

Read `constructo/mobile/app/(contractor)/supervisor/_components.tsx` (where `CaptureCard` lives) and the bubble-rendering JSX in `app/(contractor)/supervisor/chat.tsx` (~lines 409–703). Identify the exact prop surface of `CaptureCard` (event fields, `needs_clarification` amber, "show proof" reveal) and the plain-bubble markup (own = amber bg, other = card bg, attachment image).

- [ ] **Step 2: Create `src/chat/MessageView.tsx`**

Create `constructo/mobile/src/chat/MessageView.tsx` that exports:
- `CaptureCard` — moved verbatim from `_components.tsx` (same props, same styles/tokens).
- `MessageBubble` — the plain-message bubble extracted from `chat.tsx`, props: `{ body: string | null; mine: boolean; attachmentUrl?: string | null; mediaType?: string; timestamp?: string }`.

Use the existing token imports the source files already use (e.g. `SPACE`, `COLORS`/theme, Mono font for timestamps). Copy the JSX exactly; do not restyle. Example skeleton (fill the body from the read in Step 1 — match the real markup, do not invent styles):

```tsx
import { View, Text, Image, StyleSheet } from 'react-native'
import { SPACE, /* the real token imports used in chat.tsx */ } from '../theme/tokens'
// ...plus whatever CaptureCard currently imports (event-type labels, StatusPill, etc.)

export function MessageBubble({
  body,
  mine,
  attachmentUrl,
  mediaType,
  timestamp,
}: {
  body: string | null
  mine: boolean
  attachmentUrl?: string | null
  mediaType?: string
  timestamp?: string
}) {
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
      {attachmentUrl ? <Image source={{ uri: attachmentUrl }} style={styles.media} /> : null}
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {timestamp ? <Text style={styles.ts}>{timestamp}</Text> : null}
    </View>
  )
}

// CaptureCard moved here verbatim from supervisor/_components.tsx:
export { CaptureCard } from './_capture_card_moved'  // or inline the component
```

> Prefer **inlining** the real `CaptureCard` body into this file (single source of truth) over a chain of re-exports. The `styles` must use the same token values the original used so the visual diff is zero.

- [ ] **Step 3: Re-point the supervisor screen at the shared module**

In `app/(contractor)/supervisor/_components.tsx`, delete the `CaptureCard` definition and re-export it for any other local importers:

```tsx
export { CaptureCard, MessageBubble } from '../../../src/chat/MessageView'
```

In `app/(contractor)/supervisor/chat.tsx`, leave the existing `CaptureCard` import as-is **if** it resolves through `_components.tsx` (the re-export keeps it working). If `chat.tsx` rendered the bubble inline, replace that inline JSX with `<MessageBubble .../>` **only if** it is a mechanical 1:1 substitution; otherwise leave the inline bubble untouched and just ship the shared `MessageBubble` for the owner screen to consume (zero supervisor risk).

> **Decision rule:** the safest minimal diff is — move `CaptureCard` to the shared module + re-export; add a fresh `MessageBubble` to the shared module for the owner screen; **do not** rewrite the supervisor bubble JSX. This keeps the supervisor screen byte-stable except for one import line.

- [ ] **Step 4: Typecheck + test (no behavior change to verify beyond green)**

```bash
cd constructo/mobile
npm run typecheck
npm test
```
Expected: typecheck clean; existing jest suite green (no new test needed — this is a pure move; correctness = the supervisor screen still compiles and imports resolve).

- [ ] **Step 5: Commit**

```bash
cd /Users/aryantripathi/Developer/contructionAI
git checkout -b refactor/shared-message-view
git add constructo/mobile/src/chat/MessageView.tsx \
        constructo/mobile/app/\(contractor\)/supervisor/_components.tsx
# add chat.tsx ONLY if you changed its import line:
# git add constructo/mobile/app/\(contractor\)/supervisor/chat.tsx
git commit -m "refactor(chat): extract shared MessageView (CaptureCard + MessageBubble)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin refactor/shared-message-view
gh pr create --title "refactor(chat): shared MessageView for cross-surface reuse (doc 18 Phase 1, PR 2/4)" \
  --body "Moves CaptureCard + a MessageBubble into src/chat/MessageView.tsx so the owner Chat tab (and future homeowner/groups surfaces) can render crew threads without importing across route groups. No supervisor behavior change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr checks --watch && gh pr merge --merge --delete-branch
```

---

## Task 4: Mobile — chat inbox API client + owner tab wiring

**Files:**
- Modify: `constructo/mobile/src/api/chat.ts` (add `ConversationSummary` + `chatApi.conversations()`)
- Modify: `constructo/mobile/app/(contractor)/owner/_layout.tsx` (add Chat tab, hide Search)
- Modify: `constructo/mobile/app/(contractor)/owner/more.tsx` (link to Search)

> **Pre-task:** Invoke `constructo-design-system`. Owner app = Blueprint light; tabs use **monochrome glyphs** (existing: `◆ ▦ ✓ ⌕ ☰`), **never emoji**; labels are bilingual via the `L`/string table already in `_layout.tsx`.

- [ ] **Step 1: Add the inbox type + client call**

In `constructo/mobile/src/api/chat.ts`, add near the other types:

```ts
export interface ConversationSummary {
  id: string
  kind: 'site' | 'homeowner' | 'group'
  site_id: string | null
  title: string | null
  site_name: string | null
  last_message_at: string | null
  unread_count: number
  has_homeowner: boolean
}
```

Add to the `chatApi` object:

```ts
  conversations(): Promise<ConversationSummary[]> =>
    request<ConversationSummary[]>('/api/v1/chat/conversations'),
```

> Match the existing `chatApi` member style in this file (the explored signatures show `messages(siteId, afterSeq=0)`, `read(siteId, lastSeq)`, etc., all using the shared `request<T>()` wrapper). If `chatApi` members are defined as arrow functions in an object literal, follow that exact shape (the comma + arrow above assumes that). If they are method shorthand, convert accordingly.

- [ ] **Step 2: Add a shape unit test**

Create `constructo/mobile/src/api/chat.conversations.test.ts`:

```ts
import type { ConversationSummary } from './chat'

describe('ConversationSummary shape', () => {
  it('accepts a site-thread inbox row', () => {
    const row: ConversationSummary = {
      id: 'c1',
      kind: 'site',
      site_id: 's1',
      title: null,
      site_name: 'Site A',
      last_message_at: '2026-06-07T10:00:00Z',
      unread_count: 3,
      has_homeowner: false,
    }
    expect(row.unread_count).toBe(3)
    expect(row.kind).toBe('site')
  })
})
```

> This is a compile-time guard (the test fails to typecheck/run if the interface drifts). It is intentionally light — the inbox rendering is covered by manual + device verification in Task 6's checklist.

- [ ] **Step 3: Add the Chat tab; hide Search from the tab bar**

In `constructo/mobile/app/(contractor)/owner/_layout.tsx`, the tabs are currently:

```tsx
<Tabs.Screen name="brief" options={{ title: L.brief, tabBarIcon: icon('◆') }} />
<Tabs.Screen name="sites" options={{ title: L.sites, tabBarIcon: icon('▦') }} />
<Tabs.Screen name="approvals" options={{ title: L.approvals, tabBarIcon: icon('✓') }} />
<Tabs.Screen name="search" options={{ title: L.search, tabBarIcon: icon('⌕') }} />
<Tabs.Screen name="more" options={{ title: L.more, tabBarIcon: icon('☰') }} />
```

Change to (Chat takes the 2nd slot; Search hidden from the bar but still routable; the new `chat/[id]` detail route is also hidden):

```tsx
<Tabs.Screen name="brief" options={{ title: L.brief, tabBarIcon: icon('◆') }} />
<Tabs.Screen name="chat" options={{ title: L.chat, tabBarIcon: icon('✉') }} />
<Tabs.Screen name="sites" options={{ title: L.sites, tabBarIcon: icon('▦') }} />
<Tabs.Screen name="approvals" options={{ title: L.approvals, tabBarIcon: icon('✓') }} />
<Tabs.Screen name="more" options={{ title: L.more, tabBarIcon: icon('☰') }} />
<Tabs.Screen name="search" options={{ href: null }} />
<Tabs.Screen name="chat/[id]" options={{ href: null }} />
```

Add `chat` to the `L` string table in this file (find where `brief/sites/approvals/search/more` labels are declared) — English `"Chat"`, Hindi `"चैट"` (or `"संदेश"`/"Messages" — confirm with the design-system Hindi-first convention; `"चैट"` is the common Hinglish rendering and matches WhatsApp-exit familiarity).

> **Glyph note:** `✉` (U+2709) is a monochrome dingbat in the same family as the existing `✓ ⌕`, **not** a color emoji — render it via the same `icon()` helper. Verify on device it renders as a glyph (not an emoji-presentation); if the platform forces emoji presentation, fall back to a geometric glyph like `✎`→ no; prefer `◷`? Confirm visually in Task 6 and swap to a Blueprint-consistent glyph if needed.

- [ ] **Step 4: Surface Search inside More**

In `constructo/mobile/app/(contractor)/owner/more.tsx`, add a navigation row (matching the existing More rows' component/pattern) that pushes to Search:

```tsx
<MoreRow
  label={L.search}            // reuse the existing search label
  glyph="⌕"
  onPress={() => router.push('/(contractor)/owner/search')}
/>
```

> Match `more.tsx`'s actual row component + import for `router` (`expo-router`). If More uses a different row primitive, use that. The point: Search remains reachable after leaving the tab bar.

- [ ] **Step 5: Typecheck + test**

```bash
cd constructo/mobile
npm run typecheck
npm test
```
Expected: clean + green. (The `chat` and `chat/[id]` screens don't exist yet — Expo Router tolerates a declared `Tabs.Screen` whose file is added next; if typecheck/router complains about a missing route file, proceed straight to Task 5/7 on the same branch so the files exist before this lands. **Sequencing:** do Tasks 4→5→7 on a single branch for PR 3 if the router requires the files to exist; otherwise Task 4 can stand alone.)

- [ ] **Step 6: Commit (folded into PR 3 — see Task 6)**

Stage with the inbox screen in Task 6.

---

## Task 5: Mobile — `ConversationRow` component

**Files:**
- Create: `constructo/mobile/app/(contractor)/owner/_chat_components.tsx`

> **Pre-task:** `constructo-design-system` — Blueprint card (8px radius, hairline + subtle shadow, warm `--paper`/card bg), ≥48px row height, Mono for the timestamp, status-spine color **+ shape** for the unread badge (never color alone), never emoji.

- [ ] **Step 1: Write `ConversationRow`**

Create `constructo/mobile/app/(contractor)/owner/_chat_components.tsx`:

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { ConversationSummary } from '../../../src/api/chat'
import { SPACE /*, COLORS/theme tokens as used by owner/_components.tsx */ } from '../../../src/theme/tokens'

function initials(name: string | null): string {
  if (!name) return '#'
  return name.trim().slice(0, 2).toUpperCase()
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.round(hrs / 24)}d`
}

export function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: ConversationSummary
  onPress: () => void
}) {
  const title = conversation.title ?? conversation.site_name ?? 'Site'
  const unread = conversation.unread_count > 0
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(title)}</Text>
      </View>
      <View style={styles.center}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {conversation.has_homeowner ? (
          <Text style={styles.cue} numberOfLines={1}>
            ◆ Client in this thread
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={styles.ts}>{ago(conversation.last_message_at)}</Text>
        {unread ? (
          <View style={styles.badge} accessibilityLabel={`${conversation.unread_count} unread`}>
            <Text style={styles.badgeText}>{conversation.unread_count}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: SPACE.sm, gap: SPACE.sm },
  avatar: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' /* bg: card/sunken token */ },
  avatarText: { fontWeight: '700' /* Anek/Hind */ },
  center: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  cue: { fontSize: 12 /* --info color + the ◆ shape, never color alone */ },
  right: { alignItems: 'flex-end', gap: 4, minWidth: 44 },
  ts: { fontSize: 12 /* Mono */ },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' /* bg: --brand amber FILL, dark ink text */ },
  badgeText: { fontSize: 12, fontWeight: '700' /* --text-on-brand */ },
})
```

> **Fill the real tokens** from `owner/_components.tsx` (it already imports the theme — copy its color/spacing imports so the row matches the Blueprint surfaces around it). The unread badge is an **amber fill with dark ink** (per the amber rule: amber is for fills, not text). The "client present" cue pairs the `◆` shape with `--info` so it's not color-only. Replace the literal strings with bilingual `L.*` lookups consistent with the owner app's i18n.

- [ ] **Step 2: Typecheck**

```bash
cd constructo/mobile && npm run typecheck
```
Expected: clean.

> Commit folded into Task 6 (PR 3).

---

## Task 6: Mobile — owner Chat inbox screen

**Files:**
- Create: `constructo/mobile/app/(contractor)/owner/chat.tsx`

> **Pre-task:** `constructo-design-system` — exceptions-first/calm; empty state is a positive signal (a quiet line, not a dump); pull-to-refresh; ≥48px taps.

- [ ] **Step 1: Write the inbox screen (pattern-matched to `approvals.tsx`)**

Create `constructo/mobile/app/(contractor)/owner/chat.tsx`:

```tsx
import { ScrollView, View, Text, RefreshControl, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { chatApi } from '../../../src/api/chat'
import { ConversationRow } from './_chat_components'
import { SPACE /*, theme tokens */ } from '../../../src/theme/tokens'

export default function OwnerChat() {
  const router = useRouter()
  const q = useQuery({
    queryKey: ['owner', 'conversations'],
    queryFn: () => chatApi.conversations(),
    refetchInterval: 15000, // light poll; WS is per-thread, the inbox just refreshes
  })

  if (q.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  const rows = q.data ?? []

  return (
    <ScrollView
      contentContainerStyle={{ padding: SPACE.md, gap: SPACE.xs }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      {rows.length === 0 ? (
        <Text style={{ textAlign: 'center', marginTop: SPACE.xl /* --text-mute */ }}>
          No site chats yet. They appear here as your crew starts talking.
        </Text>
      ) : (
        rows.map((c) => (
          <ConversationRow
            key={c.id}
            conversation={c}
            onPress={() =>
              router.push({
                pathname: '/(contractor)/owner/chat/[id]',
                params: {
                  id: c.id,
                  siteId: c.site_id ?? '',
                  title: c.title ?? c.site_name ?? 'Site',
                  hasHomeowner: c.has_homeowner ? '1' : '0',
                },
              })
            }
          />
        ))
      )}
    </ScrollView>
  )
}
```

> Match `approvals.tsx`'s actual imports for the query client + theme. The empty-state copy should be bilingual via the i18n table. Passing `siteId`/`title`/`hasHomeowner` as route params lets the detail screen render immediately (it reads the thread by `site_id` — the existing site-keyed API — and shows the header without a second fetch).

- [ ] **Step 2: Typecheck + test**

```bash
cd constructo/mobile
npm run typecheck
npm test
```
Expected: clean + green.

- [ ] **Step 3: Commit + PR 3**

```bash
cd /Users/aryantripathi/Developer/contructionAI
git checkout -b feat/owner-chat-tab
git add constructo/mobile/src/api/chat.ts \
        constructo/mobile/src/api/chat.conversations.test.ts \
        constructo/mobile/app/\(contractor\)/owner/_layout.tsx \
        constructo/mobile/app/\(contractor\)/owner/more.tsx \
        constructo/mobile/app/\(contractor\)/owner/_chat_components.tsx \
        constructo/mobile/app/\(contractor\)/owner/chat.tsx
git commit -m "feat(chat): owner Chat tab + inbox of crew threads (doc 18 Phase 1, PR 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin feat/owner-chat-tab
gh pr create --title "feat(chat): owner Chat tab + inbox (doc 18 Phase 1, PR 3/4)" \
  --body "Adds a first-class Chat tab to the owner app: an inbox (GET /chat/conversations) of every site's crew thread with unread badges, last-message recency, and a 'client present' cue. Search moves into More. Tapping a row opens the conversation detail (PR 4). Blueprint-themed, ≥48px, bilingual, never emoji.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr checks --watch
```

> **If the router requires `chat/[id].tsx` to exist** (declared in `_layout.tsx` Task 4), do Task 7 on **this same branch** before opening PR 3, and merge them together as one PR. Otherwise merge PR 3, then PR 4. Decide based on the typecheck/router behavior observed in Task 4 Step 5.

- [ ] **Step 4: Merge when green**

```bash
gh pr merge --merge --delete-branch
```

---

## Task 7: Mobile — owner conversation-detail screen

**Files:**
- Create: `constructo/mobile/app/(contractor)/owner/chat/[id].tsx`

> **Pre-task:** `constructo-design-system` — Blueprint thread; CaptureCards for structured captures (evidence-on-tap "show proof"), bubbles for talk; composer with a big photo button + text input (≥48px); Mono timestamps; "Client in this thread" header cue when `hasHomeowner`.

- [ ] **Step 1: Write the detail screen (read + send/reply + mark-read), reusing the shared `MessageView`**

Create `constructo/mobile/app/(contractor)/owner/chat/[id].tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { chatApi, type ChatMessage } from '../../../../src/api/chat'
import { CaptureCard, MessageBubble } from '../../../../src/chat/MessageView'
import { SPACE /*, theme tokens */ } from '../../../../src/theme/tokens'

// minimal client-side uuid (match whatever the supervisor screen uses for client_msg_id)
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export default function OwnerConversation() {
  const { siteId, title, hasHomeowner } = useLocalSearchParams<{
    siteId: string
    title: string
    hasHomeowner: string
  }>()
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)

  const q = useQuery({
    queryKey: ['owner', 'chat', siteId],
    queryFn: () => chatApi.messages(siteId, 0),
    refetchInterval: 8000, // matches the supervisor poll cadence
    enabled: !!siteId,
  })

  const messages = useMemo(() => q.data ?? [], [q.data])

  // mark-read whenever the newest seq advances
  useEffect(() => {
    if (!siteId || messages.length === 0) return
    const lastSeq = messages[messages.length - 1].seq
    chatApi.read(siteId, lastSeq).then(() => {
      qc.invalidateQueries({ queryKey: ['owner', 'conversations'] })
    })
  }, [siteId, messages, qc])

  async function send() {
    const body = text.trim()
    if (!body || !siteId) return
    setText('')
    const parent = replyTo
    setReplyTo(null)
    await chatApi.send({
      site_id: siteId,
      client_msg_id: uuid(),
      body,
      reply_to_id: parent?.id,
      media_type: 'text',
    })
    q.refetch()
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {hasHomeowner === '1' ? (
        <View style={{ padding: SPACE.xs /* --info-bg tint */ }}>
          <Text style={{ fontSize: 12 }}>◆ Client is in this thread</Text>
        </View>
      ) : null}

      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: SPACE.md, gap: SPACE.xs }}
        renderItem={({ item }) =>
          item.events && item.events.length > 0 ? (
            <CaptureCard message={item} /* match CaptureCard's real prop shape */ />
          ) : (
            <MessageBubble
              body={item.body}
              mine={item.sender_side === 'contractor'}
              attachmentUrl={item.attachment_url}
              mediaType={item.media_type}
              timestamp={new Date(item.created_at).toLocaleTimeString()}
            />
          )
        }
      />

      {replyTo ? (
        <View style={{ padding: SPACE.xs }}>
          <Text numberOfLines={1}>↩︎ {replyTo.body ?? 'message'}</Text>
          <Pressable onPress={() => setReplyTo(null)}>
            <Text>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, padding: SPACE.sm }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message…"
          style={{ flex: 1, minHeight: 48 /* card bg, hairline border */ }}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!text.trim()}
          style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' /* amber fill when enabled */ }}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Text style={{ fontWeight: '700' }}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}
```

> **Verify against the real `chatApi` + `CaptureCard`:** `CaptureCard`'s prop shape comes from the supervisor screen — pass exactly what it expects (the explored render maps `events_by_raw` onto the message; the supervisor passes the message/event — copy that call site). `chatApi.send` body fields are confirmed (`site_id, client_msg_id, body, reply_to_id, media_type`). Use the **same uuid/client_msg_id helper the supervisor screen already uses** (it has offline-outbox idempotency — import that rather than the inline `uuid()` above if it exists at `src/offline/` or wherever `client_msg_id`s are minted). The send glyph `➤`/photo button must be ≥48px with icon **+** accessible label (never icon-only-without-label for critical actions). This screen intentionally omits Radar/dispute/recap/smart-suggest (deferred fast-follow).

- [ ] **Step 2: Long-press to reply (optional within Phase 1)**

Add an `onLongPress` on the rendered row that calls `setReplyTo(item)` (mirrors the supervisor quote-reply). Keep it minimal — a long-press → "Reply" sets the banner. If this expands scope, ship read+send first and add reply in a follow-up commit on the same PR.

- [ ] **Step 3: Typecheck + test**

```bash
cd constructo/mobile
npm run typecheck
npm test
```
Expected: clean + green.

- [ ] **Step 4: Commit (PR 4, or fold into PR 3 per the Task 6 router note)**

```bash
cd /Users/aryantripathi/Developer/contructionAI
git checkout -b feat/owner-chat-detail   # or stay on feat/owner-chat-tab
git add constructo/mobile/app/\(contractor\)/owner/chat/\[id\].tsx
git commit -m "feat(chat): owner conversation detail — read+send crew thread (doc 18 Phase 1, PR 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push -u origin feat/owner-chat-detail
gh pr create --title "feat(chat): owner conversation detail (doc 18 Phase 1, PR 4/4)" \
  --body "Owner taps an inbox row → reads the crew thread (CaptureCards + bubbles via the shared MessageView), posts text/reply, and the inbox unread badge clears on view. Reuses the existing site-keyed /chat/messages, /chat/read APIs — no schema. Richer tools (Radar, dispute, recap) deferred to a fast-follow.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
gh pr checks --watch && gh pr merge --merge --delete-branch
```

---

## Self-Review (run against doc 18 §10 Phase 1 + §11 testing)

**Spec coverage (doc 18 §10.1 — "Owner Chat surfacing (no schema)"):**
- `GET /chat/conversations` inbox → Task 1. ✓
- Owner **Chat** tab rendering existing crew threads → Tasks 4–7. ✓
- "owners already have API access via `effective_visible_site_ids`" → reused in Task 1's route; no new access logic. ✓
- No schema → confirmed; no migration, no model change. ✓

**Doc 18 §11 testing rows applicable to Phase 1:**
- "owner sees all company threads; supervisor sees only assigned-site threads" → `test_conversations_inbox_*` (owner) + `..._scoped_to_assigned_sites_for_supervisor`. ✓
- "homeowner blocked from `site` kind" → `..._forbidden_for_homeowner`. ✓
- "Inbox: unread counts per conversation; ordering by last_message_at; scoping" → unread tests + `nullslast` ordering + scoping test. ✓
- `has_homeowner` "client present" cue → `..._has_homeowner_flag` + the row/header cue (Tasks 5, 7). ✓
- Group/membrane/migration rows → **out of scope** (Phase 2/3), correctly excluded.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to". Backend code is complete and runnable. Mobile code blocks are concrete; the few "match the real X" notes point at verified call sites (CaptureCard props, the uuid helper, theme tokens) and instruct copying the existing pattern rather than inventing — these are integration-fidelity checks, not unfilled blanks.

**Type consistency:** `ConversationOut` (backend) ↔ `ConversationSummary` (mobile) fields match exactly (id, kind, site_id, title, site_name, last_message_at, unread_count, has_homeowner). `chatApi.conversations()` / `chatApi.messages(siteId, afterSeq)` / `chatApi.read(siteId, lastSeq)` / `chatApi.send({...})` all match the explored signatures. `CaptureCard` / `MessageBubble` exported from `src/chat/MessageView.tsx` are imported with those exact names in Task 7.

---

## Founder to-dos (only you can do these)

- **Device test (PR 3/4):** on the owner build, confirm the **Chat** tab renders, the inbox lists each site's crew thread with correct unread badges, tapping opens the thread, sending posts + the badge clears, and the **Search** screen is still reachable from **More**. Confirm the `✉` tab glyph renders as a **monochrome glyph, not a color emoji** — if it shows as emoji, tell me and I'll swap to a Blueprint-consistent glyph.
- **Hindi labels:** confirm the Chat tab label (proposed `"चैट"`) and the empty-state / "Client is in this thread" copy read right for your users (Hindi-first).
- **Product call (open questions for Phase 2, not blocking Phase 1):** (a) is there a distinct **co-owner** role that should also create groups? (b) keep group-create **owner-only** forever, or let **PMs** create later (today PMs get in only via per-group delegation)? I'll fold your answers into the Phase 2 plan.
- **No new migration in this phase** — nothing to apply to Neon for Phase 1. (Phase 2 will introduce exactly one migration off head `f7a8b9c0d1e2`.)

---

## Next: Phase 2 plan (separate)

Once Phase 1 is merged + device-verified, the **Phase 2 (Groups subsystem)** plan is its own spec→plan→PRs: the single migration (`ConversationKind.group`, nullable `site_id`, partial unique index, `conversation_members`, `archived_at`), the `can_access` resolver, group CRUD + RBAC (owner-create, delegate admin), owner New-group/manage UI, and site-group capture. The two open questions above should be answered before that plan is finalized (they shape the create gate + the `member_role`/co-owner handling).
