# Homeowner Messages — Implementation Plan (Doc 18, Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the per-site **`homeowner` 1:1 builder channel** as a live two-way chat thread — give the **homeowner** a **Messages** tab (her builder channel + any groups she's in, Daylight-themed) and surface that channel in the **owner Chat inbox** so owner/PM reply.

**Architecture:** No schema change — the `homeowner` conversation kind + the one-per-site partial unique index already exist. We (1) extend the single `can_access` gate so a homeowner-role user reaches a `homeowner`-kind conversation for a site she's an active `HomeownerMember` of (reusing the existing `homeowner_site_ids` helper), while crew reach it via `effective_visible_site_ids`; (2) add a get-or-create entry point for the channel; (3) lift the Phase-2 guards that 403 the homeowner inbox and reject homeowner-kind sends; (4) make homeowner-channel sends **talk-only** (no extraction); (5) build the homeowner **Messages** tab + a Daylight thread; (6) label the homeowner-channel row in the owner inbox. The channel is a **plain** room (no membrane stripping — founder decision 2026-06-07, consistent with groups).

**Tech Stack:** FastAPI + SQLAlchemy async (Python 3.12, `uv`); React Native + Expo Router + TanStack Query + TypeScript. Homeowner app = **Daylight** theme (warm paper, Calm Pine `#1e7a63`, soft 16px radius, one notch larger type). pytest / jest.

**Locked decisions (founder 2026-06-07):**
- **Plain channel** — no auto digit/price stripping on the homeowner channel (trust the humans; the builder deliberately messages her). This refines doc 18 §6: the membrane stays the hard rule for *automated/published* flows (updates/photos/AI), but the live 1:1 channel is human-to-human and plain. The existing `numeric_guard`/`membrane.py` are **intentionally NOT wired** into it.
- **Two-way now** — the channel surfaces in the owner Chat inbox (Phase 1) so owner/PM read + reply.
- Taken from the doc: her channel is the existing per-site `homeowner` kind (lazily created); "Ask the Builder" requests stay on the Ask pill and are **not** migrated in v1; homeowner messages are **talk-only** (no site extraction).

---

## Scope & Non-Goals

**In scope:** homeowner-channel access in `can_access`; a get-or-create entry; lifting the inbox + send guards; talk-only homeowner sends; the homeowner **Messages** tab + Daylight thread (her builder channel + her groups); the homeowner-channel row labeled in the owner inbox.

**Explicitly deferred (NOT this plan):**
- **Migrating "Ask the Builder" requests** (`/homeowner/requests`) into the live channel — stays on the Ask pill; a later follow-up.
- **Membrane/curation on the channel** — decided plain.
- **Capture cards in the homeowner thread** — her thread renders plain bubbles only (she's not crew; the channel is talk-only). If she's in a *site group* that has CaptureCards, her Daylight thread still renders those messages as plain bubbles (no structured-capture UI for her).
- **Owner proactively starting the channel before she does** — the channel is born when the homeowner opens her Messages tab (get-or-create); the owner replies once it exists. (Owner-initiated creation is a trivial later add — the get-or-create endpoint already accepts a crew caller.)
- **Multi-site homeowner** beyond her primary site — the Messages tab handles her primary `siteId`; a homeowner who is a member of several sites gets one builder channel (primary) in v1.
- **Push notifications** to the channel — reuse `push/sender.py` later.

---

## File Structure

**Backend (`constructo/backend/`):**
- Modify `app/chat/access.py` — `can_access` homeowner-kind branch (homeowner via `homeowner_site_ids`; crew via `effective_visible_site_ids`).
- Modify `app/chat/router.py` — add `_get_or_create_homeowner_conversation`; add `POST /chat/homeowner-channel`; lift the homeowner-403 in `list_conversations` + add homeowner-kind rows; lift the homeowner-kind reject in `send_message` + make homeowner-kind talk-only.
- Tests: `tests/test_homeowner_channel.py` + additions to `tests/test_chat_api.py` / `tests/test_chat_access.py`.

**Mobile (`constructo/mobile/`):**
- Modify `src/api/chat.ts` — add `chatApi.homeownerChannel(siteId)` (get-or-create) returning a `ConversationSummary`.
- Modify `app/(homeowner)/_layout.tsx` — add the **Messages** tab.
- Create `app/(homeowner)/messages.tsx` — the homeowner inbox (Daylight).
- Create `app/(homeowner)/messages/[id].tsx` — the Daylight thread (bubbles + composer).
- Create `app/(homeowner)/_messages_components.tsx` — Daylight `MessageRow` + `DaylightBubble`.
- i18n: add `nav.messages` + the Messages strings.
- Modify `app/(contractor)/owner/_chat_components.tsx` — label `kind === 'homeowner'` rows ("Homeowner · {site}").
- Modify `app/(contractor)/owner/chat/[id].tsx` — header reads right for a homeowner channel.

---

## PR Sequencing (each branch → PR → merge ONLY when CI all-green)

- **PR 1 — Backend: homeowner channel activation** (Tasks 1–3).
- **PR 2 — Mobile: homeowner Messages tab + Daylight thread** (Tasks 4–6).
- **PR 3 — Mobile: owner-inbox homeowner-channel label** (Task 7).

> **Working agreement (memory / vault doc 16 §4):** local gate before each push — backend `cd constructo/backend && DATABASE_URL=postgresql+asyncpg://constructo:constructo@localhost:5433/constructo uv run ruff check . && DATABASE_URL=... uv run pytest` (5 storage-env failures expected); mobile `cd constructo/mobile && npm run typecheck && npm test`. Feature branch → PR → `gh pr merge N --merge --delete-branch` only when CI green. **Never commit to main.** Explicit `git add <paths>` — never `-A`, and **NEVER stage `app/(homeowner)/updates.tsx`**, `tmp/`, `.env.bak`, `docs/`. Invoke `constructo-design-system` (Daylight) before each UI task (Tasks 4–7). **No migration this phase.**

---

## Task 1: Backend — `can_access` homeowner-kind branch

**Files:**
- Modify: `constructo/backend/app/chat/access.py`
- Test: `constructo/backend/tests/test_chat_access.py`

Currently the `site`/`homeowner` branch uses `effective_visible_site_ids`, which returns `[]` for a homeowner role — so a homeowner can't even reach her own channel. Split the resolution by role.

- [ ] **Step 1: Update `can_access`**

```python
from app.homeowner.scoping import homeowner_site_ids  # add import

async def can_access(session, user, conversation) -> bool:
    if conversation.kind in (ConversationKind.site, ConversationKind.homeowner):
        if conversation.site_id is None:
            return False
        if user.role is UserRole.homeowner:
            # A homeowner NEVER reaches the raw `site` crew thread; she reaches the
            # curated `homeowner` channel for a site she's an active member of.
            if conversation.kind is ConversationKind.site:
                return False
            return conversation.site_id in await homeowner_site_ids(session, user)
        # Crew (owner/pm/supervisor/...) reach both the site thread AND the
        # homeowner channel for sites they can see.
        return conversation.site_id in await effective_visible_site_ids(session, user)
    if conversation.kind is ConversationKind.group:
        if conversation.company_id != user.company_id:
            return False
        member = await session.get(ConversationMember, (conversation.id, user.id))
        return member is not None
    return False
```
> Confirm `homeowner_site_ids` signature `(session, user) -> list[UUID]` (it filters `HomeownerMember.user_id == user.id AND status == active`). Keep `effective_visible_site_ids` import.

- [ ] **Step 2: Tests** — add to `tests/test_chat_access.py`

```python
async def test_homeowner_can_access_her_homeowner_channel(db_session, factory, world):
    from app.models import Conversation, ConversationKind, MemberStatus
    from app.models.homeowner_member import HomeownerMember
    company, owner, site = world
    ho = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=ho.id, status=MemberStatus.active))
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.homeowner)
    db_session.add(conv)
    await db_session.flush()
    assert await can_access(db_session, ho, conv) is True


async def test_homeowner_still_blocked_from_site_thread(db_session, factory, world):
    from app.models import Conversation, ConversationKind, MemberStatus
    from app.models.homeowner_member import HomeownerMember
    company, owner, site = world
    ho = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=ho.id, status=MemberStatus.active))
    site_conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.site)
    db_session.add(site_conv)
    await db_session.flush()
    assert await can_access(db_session, ho, site_conv) is False


async def test_homeowner_blocked_from_other_sites_channel(db_session, factory, world):
    from app.models import Conversation, ConversationKind
    company, owner, site = world
    other = await factory.site(company, name="Site B")
    ho = await factory.user(company=company, role=UserRole.homeowner)  # member of NO site
    conv = Conversation(company_id=company.id, site_id=other.id, kind=ConversationKind.homeowner)
    db_session.add(conv)
    await db_session.flush()
    assert await can_access(db_session, ho, conv) is False


async def test_crew_can_access_homeowner_channel(db_session, world):
    from app.models import Conversation, ConversationKind
    company, owner, site = world
    conv = Conversation(company_id=company.id, site_id=site.id, kind=ConversationKind.homeowner)
    db_session.add(conv)
    await db_session.flush()
    assert await can_access(db_session, owner, conv) is True   # owner has site visibility
```
> Verify `MemberStatus` import path (`from app.models.homeowner_member import MemberStatus` or `from app.models import MemberStatus`) and that `HomeownerMember` requires only site_id/user_id/status (set `join_code` etc. if NOT NULL — check the model; earlier tests constructed it with just `site_id` + `join_code`, so include whatever is NOT NULL).

Run `pytest tests/test_chat_access.py -v` → all green (existing + 4 new).

---

## Task 2: Backend — get-or-create + lift inbox/send guards

**Files:**
- Modify: `constructo/backend/app/chat/router.py`
- Test: `constructo/backend/tests/test_homeowner_channel.py`, `tests/test_chat_api.py`

- [ ] **Step 1: `_get_or_create_homeowner_conversation` helper**

Mirror `_get_or_create_site_conversation` but for `kind=homeowner`, resolving `company_id` from the Site (so a homeowner caller — whose `company_id` should equal the site's — is never relied on):

```python
async def _get_or_create_homeowner_conversation(session: AsyncSession, site_id: UUID) -> Conversation:
    conv = (
        await session.execute(
            select(Conversation).where(
                Conversation.site_id == site_id,
                Conversation.kind == ConversationKind.homeowner,
            )
        )
    ).scalar_one_or_none()
    if conv is None:
        site = await session.get(Site, site_id)
        if site is None:
            raise AppError(404, "not_found", "Site not found")
        conv = Conversation(company_id=site.company_id, site_id=site_id, kind=ConversationKind.homeowner)
        session.add(conv)
        await session.flush()
    return conv
```
> `Site` is already imported in router.py (Phase-1 inbox). The one-per-site partial unique index guarantees a single homeowner conversation per site.

- [ ] **Step 2: `POST /chat/homeowner-channel`** (get-or-create + return the summary)

```python
class HomeownerChannelIn(BaseModel):
    site_id: UUID


@router.post("/homeowner-channel", response_model=ConversationOut)
async def homeowner_channel(
    body: HomeownerChannelIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ConversationOut:
    """Get-or-create the homeowner 1:1 channel for a site. Callable by the
    homeowner (member of the site) or crew (site visibility)."""
    # Authorize against the would-be conversation's site.
    if user.role is UserRole.homeowner:
        if body.site_id not in await homeowner_site_ids(session, user):
            raise AppError(403, "forbidden", "Not your property")
    else:
        if body.site_id not in await effective_visible_site_ids(session, user):
            raise AppError(403, "forbidden", "You are not assigned to this site")
    conv = await _get_or_create_homeowner_conversation(session, body.site_id)
    await session.commit()
    site = await session.get(Site, body.site_id)
    return ConversationOut(
        id=conv.id, kind=conv.kind, site_id=conv.site_id, title=conv.title,
        site_name=site.name if site else None,
        last_message_at=conv.last_message_at,
        unread_count=max(0, conv.last_seq - 0),  # cursor read below if you prefer; 0 on a fresh channel
        has_homeowner=True,
    )
```
> Import `homeowner_site_ids` here too. For `unread_count`, a freshly-created channel has `last_seq=0` → 0; if the channel already exists, compute from `ConversationRead` like the inbox does (reuse the inbox's read-cursor helper for consistency — `_reads_for` if present).

- [ ] **Step 3: Lift the homeowner-403 in `list_conversations` + add homeowner-kind rows**

Replace the `if user.role is UserRole.homeowner: raise AppError(403, ...)` guard. New behavior:
- **Homeowner caller:** return her existing `homeowner`-kind conversations (for sites in `homeowner_site_ids`) + her group memberships. (Do NOT get-or-create here — the Messages tab calls `POST /chat/homeowner-channel` to ensure existence; the inbox stays read-only.)
- **Crew caller (unchanged site + group logic):** ALSO include existing `homeowner`-kind conversations for their visible sites, so the owner sees the homeowner channel.

```python
    if user.role is UserRole.homeowner:
        site_ids = await homeowner_site_ids(session, user)
        ho_convs = (
            await session.execute(
                select(Conversation, Site.name).join(Site, Site.id == Conversation.site_id).where(
                    Conversation.kind == ConversationKind.homeowner,
                    Conversation.site_id.in_(site_ids) if site_ids else False,
                )
            )
        ).all() if site_ids else []
        # group memberships (reuse the existing group block, which keys on ConversationMember.user_id)
        # build ConversationOut rows for ho_convs (has_homeowner=True, site_name set) + groups, sort, return.
        ...
        return combined
    # ---- crew path (existing) ----
    # after building out_sites + out_groups, ALSO query existing homeowner-kind convs for `visible`:
    ho_rows = (
        await session.execute(
            select(Conversation, Site.name).join(Site, Site.id == Conversation.site_id).where(
                Conversation.kind == ConversationKind.homeowner,
                Conversation.site_id.in_(visible),
            )
        )
    ).all()
    out_homeowner = [ConversationOut(id=c.id, kind=c.kind, site_id=c.site_id, title=c.title,
                                     site_name=name, last_message_at=c.last_message_at,
                                     unread_count=max(0, c.last_seq - reads.get(c.id, 0)),
                                     has_homeowner=True) for c, name in ho_rows]
    combined = out_sites + out_homeowner + out_groups
    combined.sort(key=lambda c: c.last_message_at or _MIN_DT, reverse=True)
    return combined
```
> Reuse the existing read-cursor batch (`reads`/`_reads_for`) for `unread_count`. For the homeowner branch, batch her read cursors the same way. Keep the implementation DRY — factor a small `_conv_out(conv, site_name, last_read)` helper if it reduces duplication across site/homeowner/group rows.

- [ ] **Step 4: Lift the homeowner-kind reject in `send_message` + make it talk-only**

In `send_message`, the `conversation_id` branch currently has:
```python
        if conv.kind is ConversationKind.homeowner:
            raise AppError(403, "forbidden", "Homeowner channel is not open yet")  # Phase 3
        target_site_id = conv.site_id
```
Replace with:
```python
        target_site_id = conv.site_id
        talk_only = conv.kind is ConversationKind.homeowner  # plain channel, no extraction
```
For the site branch, set `talk_only = False`. Then change the raw/extraction guard from `if target_site_id is not None:` to `if target_site_id is not None and not talk_only:` (a homeowner-channel message stores/commits/broadcasts but mints NO RawMessage and runs NO extraction — it's human conversation, not site truth). The `_propose_action_item` call (already guarded by `target_site_id is not None`) should ALSO be gated on `not talk_only` — fold `talk_only` into its condition. Everything keyed on `conv.id` (seq, reply_context, idempotency, broadcast) is unchanged.
> Net: `require_access` (Task 1) already lets a homeowner send to her channel and a crew member reply; both produce plain stored messages, no events.

- [ ] **Step 5: Tests** — `tests/test_homeowner_channel.py`

```python
# helpers: a local `world` + make a homeowner member + her token via auth()
async def test_homeowner_channel_get_or_create_and_send(client, db_session, factory, world):
    from app.models import MemberStatus
    from app.models.homeowner_member import HomeownerMember
    from app.models.raw_message import RawMessageModel
    from sqlalchemy import select, func
    company, owner, site = world
    ho = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=ho.id, status=MemberStatus.active, join_code="HOABC1"))
    await db_session.flush()
    # get-or-create her channel
    r = await client.post("/api/v1/chat/homeowner-channel", json={"site_id": str(site.id)}, headers=auth(ho))
    assert r.status_code == 200, r.text
    conv_id = r.json()["id"]
    assert r.json()["kind"] == "homeowner"
    # she sends — talk-only, NO RawMessage minted
    s = await client.post("/api/v1/chat/messages", json={"conversation_id": conv_id, "client_msg_id": str(__import__('uuid').uuid4()), "body": "the paint looks streaky"}, headers=auth(ho))
    assert s.status_code == 201
    raw_count = await db_session.scalar(select(func.count()).select_from(RawMessageModel))
    assert raw_count == 0   # homeowner channel does not extract
    # she can list her channel via the inbox
    inbox = await client.get("/api/v1/chat/conversations", headers=auth(ho))
    assert any(c["kind"] == "homeowner" and c["id"] == conv_id for c in inbox.json())


async def test_crew_sees_and_replies_to_homeowner_channel(client, db_session, factory, world):
    from app.models import MemberStatus
    from app.models.homeowner_member import HomeownerMember
    company, owner, site = world
    ho = await factory.user(company=company, role=UserRole.homeowner)
    db_session.add(HomeownerMember(site_id=site.id, user_id=ho.id, status=MemberStatus.active, join_code="HOABC2"))
    await db_session.flush()
    conv_id = (await client.post("/api/v1/chat/homeowner-channel", json={"site_id": str(site.id)}, headers=auth(ho))).json()["id"]
    await client.post("/api/v1/chat/messages", json={"conversation_id": conv_id, "client_msg_id": str(__import__('uuid').uuid4()), "body": "hi"}, headers=auth(ho))
    # owner sees the homeowner channel in their inbox + can reply
    inbox = await client.get("/api/v1/chat/conversations", headers=auth(owner))
    assert any(c["kind"] == "homeowner" and c["id"] == conv_id for c in inbox.json())
    reply = await client.post("/api/v1/chat/messages", json={"conversation_id": conv_id, "client_msg_id": str(__import__('uuid').uuid4()), "body": "we'll fix it tomorrow"}, headers=auth(owner))
    assert reply.status_code == 201


async def test_homeowner_cannot_send_to_site_thread(client, db_session, factory, world):
    company, owner, site = world
    ho = await factory.user(company=company, role=UserRole.homeowner)
    # she has no homeowner-channel and no site access; sending by site_id is blocked
    r = await client.post("/api/v1/chat/messages", json={"site_id": str(site.id), "client_msg_id": str(__import__('uuid').uuid4()), "body": "x"}, headers=auth(ho))
    assert r.status_code == 403


async def test_homeowner_channel_forbidden_for_nonmember(client, factory, world):
    company, owner, site = world
    stranger_ho = await factory.user(company=company, role=UserRole.homeowner)  # member of nothing
    r = await client.post("/api/v1/chat/homeowner-channel", json={"site_id": str(site.id)}, headers=auth(stranger_ho))
    assert r.status_code == 403
```
> Confirm `HomeownerMember` NOT NULL columns (the earlier Phase-1 test used `join_code="ABC123"`; include `status=MemberStatus.active` + `user_id`). Confirm `_side_for(user)` yields `homeowner` for a homeowner sender so the message's `sender_side` is correct (used by the mobile `mine` flag).

---

## Task 3: Backend — local gate + PR 1

- [ ] **Step 1:** Full gate (ruff + pytest; only the 5 storage-env failures). Confirm EVERY existing chat/group test still passes (the crew + group paths are unchanged; only the homeowner guards lifted).
- [ ] **Step 2:** Commit + PR.
```bash
cd /Users/aryantripathi/Developer/contructionAI
git checkout main && git pull --ff-only && git checkout -b feat/homeowner-channel
git add constructo/backend/app/chat/access.py constructo/backend/app/chat/router.py \
        constructo/backend/tests/test_chat_access.py constructo/backend/tests/test_homeowner_channel.py constructo/backend/tests/test_chat_api.py
git commit -m "feat(chat): activate homeowner 1:1 channel — access + get-or-create + talk-only send + inbox (doc 18 Phase 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Push, PR "PR 1/3", CI green, merge.

---

## Task 4: Mobile — chat API + Messages tab registration

**Files:**
- Modify: `constructo/mobile/src/api/chat.ts`
- Modify: `constructo/mobile/app/(homeowner)/_layout.tsx` (+ i18n `nav.messages`)

> **Pre-task:** invoke `constructo-design-system` (Daylight: warm paper `#faf6ee`, Calm Pine `#1e7a63` primary, `accentWarm #cde7dd`, 16px card radius, soft shadow, one-notch-larger type, ≥48px, never emoji, bilingual).

- [ ] **Step 1: `chatApi.homeownerChannel`**

In `src/api/chat.ts`, add:
```ts
  homeownerChannel(siteId: string): Promise<ConversationSummary> {
    return request<ConversationSummary>('/api/v1/chat/homeowner-channel', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId }),
    })
  },
```
(`ConversationSummary` already exists and includes `kind: 'site'|'homeowner'|'group'`.)

- [ ] **Step 2: register the Messages tab**

In `app/(homeowner)/_layout.tsx`, add a `<Tabs.Screen name="messages" options={{ title: t('nav.messages') }} />` in the tab list (between `updates` and `design`, or wherever reads best), and a `<Tabs.Screen name="messages/[id]" options={{ href: null }} />` for the off-tab thread route. Add `nav.messages` to the homeowner i18n table (EN "Messages" / HI e.g. "संदेश"). The `AskPill` + Daylight theme already wrap all tabs — no change.

- [ ] **Step 3:** `npm run typecheck` clean. (Commit with Tasks 5–6 as PR 2.)

---

## Task 5: Mobile — Daylight Messages inbox + thread components

**Files:**
- Create: `constructo/mobile/app/(homeowner)/_messages_components.tsx`

> **Pre-task:** `constructo-design-system` (Daylight).

- [ ] **Step 1: `DaylightBubble`** — a calm message bubble (own = Calm Pine fill `c.accent` with `c.onAccent` white text; other = `c.card` with `c.line` border + soft shadow; 16px radius; Mono timestamp muted). Props `{ body: string | null; mine: boolean; timestamp?: string; attachmentUrl?: string | null }`. Pattern-match the existing request-thread look in `app/ask.tsx` (lines ~286–363). Do NOT reuse the Blueprint `MessageBubble` (it hardcodes amber).

- [ ] **Step 2: `ChannelRow`** — a Daylight inbox row (≥48px, 16px card): for `kind === 'homeowner'` show "Your builder" + the site name; for `kind === 'group'` show the group title + a small "Group" tag; unread dot (Calm Pine + shape, not color-alone); recency (Mono). Props `{ conversation: ConversationSummary; onPress }`.

- [ ] **Step 3:** `npm run typecheck`. (Commit with Task 6.)

---

## Task 6: Mobile — Messages inbox screen + thread screen

**Files:**
- Create: `constructo/mobile/app/(homeowner)/messages.tsx`
- Create: `constructo/mobile/app/(homeowner)/messages/[id].tsx`

> **Pre-task:** `constructo-design-system` (Daylight). Empty/loading states calm; pull-to-refresh.

- [ ] **Step 1: Inbox `messages.tsx`**
- On mount, ensure her builder channel exists: `const siteId = useAuth().siteId`; `useQuery(['homeowner','channel',siteId], () => chatApi.homeownerChannel(siteId!), { enabled: !!siteId })`.
- `useQuery(['homeowner','conversations'], () => chatApi.conversations(), { refetchInterval: 15000 })` for the full list (her channel + groups).
- Render: a "Your builder" `ChannelRow` (from the homeownerChannel result or the kind==='homeowner' row) pinned at top, then her group rows. Tap → `router.push({ pathname: '/(homeowner)/messages/[id]', params: { id: conv.id, kind: conv.kind, title, siteName } })`.
- Calm empty state if she has no groups (the builder channel is always present).

- [ ] **Step 2: Thread `messages/[id].tsx`**
- Params `{ id, kind, title, siteName }`. `useQuery(['homeowner','thread',id], () => chatApi.messages({ conversationId: id, afterSeq: 0 }), { refetchInterval: 8000, enabled: !!id })`.
- Render a FlatList of `DaylightBubble` (`mine = m.sender_side === 'homeowner'`, body, timestamp). **Render ALL messages as bubbles** — ignore `m.events` (no CaptureCard in her Daylight thread).
- Composer: Daylight TextInput (≥48px, 16px radius) + a Calm Pine send button (icon + accessibilityLabel, never icon-only). `onSend`: `chatApi.send({ conversation_id: id, client_msg_id: newClientMsgId(), body, media_type: 'text' })` then refetch. (`newClientMsgId` is exported from `src/api/chat.ts`.)
- mark-read: a `useEffect` on the newest seq → `chatApi.read({ conversationId: id, lastSeq })` → invalidate `['homeowner','conversations']`.
- Header: the title ("Your builder" for her channel, or the group name) + the site name as a calm subtitle.

- [ ] **Step 3:** `npm run typecheck && npm test` (35 green; no new jest unless you extract a pure helper). Commit PR 2 (Tasks 4–6):
```bash
git checkout main && git pull --ff-only && git checkout -b feat/homeowner-messages-tab
git add constructo/mobile/src/api/chat.ts \
        constructo/mobile/app/\(homeowner\)/_layout.tsx \
        constructo/mobile/app/\(homeowner\)/_messages_components.tsx \
        constructo/mobile/app/\(homeowner\)/messages.tsx \
        "constructo/mobile/app/(homeowner)/messages" \
        <the i18n file you edited>
git commit -m "feat(chat): homeowner Messages tab — live builder channel + groups (Daylight) (doc 18 Phase 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
> **NEVER stage `app/(homeowner)/updates.tsx`.** Verify `git status` shows only intended files. Push, PR "PR 2/3", CI green, merge.

---

## Task 7: Mobile — label the homeowner channel in the owner inbox

**Files:**
- Modify: `constructo/mobile/app/(contractor)/owner/_chat_components.tsx` (`ConversationRow`)
- Modify: `constructo/mobile/app/(contractor)/owner/chat/[id].tsx` (header)

> **Pre-task:** `constructo-design-system` (Blueprint).

- [ ] **Step 1:** In `ConversationRow`, when `conversation.kind === 'homeowner'`, render the title as "Homeowner · {site_name}" (bilingual "Homeowner"/"गृहस्वामी") with a small person/house glyph cue (shape, not color-alone), so the owner distinguishes it from the crew site thread (which shares the same site). The existing `addressByConv = kind !== 'site'` in `chat/[id].tsx` already routes it by conversation_id — no fetch change. Confirm tapping a homeowner row opens + lets the owner reply (it already does via Phase 1/2 plumbing).
- [ ] **Step 2:** In `chat/[id].tsx`, ensure the header label reads sensibly for a homeowner channel (e.g. show "Homeowner · {site}"); the "client present" cue is implicit (it IS the homeowner channel). No Manage button for homeowner kind (that's group-only).
- [ ] **Step 3:** `npm run typecheck && npm test`. Commit PR 3:
```bash
git checkout main && git pull --ff-only && git checkout -b feat/owner-homeowner-row
git add constructo/mobile/app/\(contractor\)/owner/_chat_components.tsx constructo/mobile/app/\(contractor\)/owner/chat/\[id\].tsx
git commit -m "feat(chat): label the homeowner channel in the owner Chat inbox (doc 18 Phase 3 complete)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Push, PR "PR 3/3", CI green, merge.

---

## Self-Review (against doc 18 §4/§6/§8.2/§10.3)

- §10.3 "activate the `homeowner` 1:1 channel as a live membrane-curated thread + homeowner Messages tab + show groups she's in" → Tasks 1–6. ✓ (membrane is **plain** per the founder decision — recorded.)
- §4 "homeowner role NEVER gets the raw site thread; the `homeowner` kind additionally allows the site's homeowner members" → `can_access` Task 1 (homeowner blocked from site kind; allowed on homeowner kind via `homeowner_site_ids`). ✓
- §6 "her 1:1 builder channel" digit-safe → **refined to plain** (founder decision); membrane left for automated/published flows. ✓ (documented departure)
- §8.2 "Messages = her 1:1 builder channel + groups she's in; the Ask pill stays; migrate requests later (not v1)" → Tasks 5–6 (channel + groups, Ask pill untouched, requests not migrated). ✓
- Two-way in the owner inbox → Tasks 2 (crew homeowner-kind rows) + 7 (label). ✓
- Talk-only homeowner sends (no extraction) → Task 2 Step 4 + the `raw_count == 0` test. ✓
- No schema change → confirmed (homeowner kind + per-site index pre-exist). ✓

**Placeholder scan:** backend code is complete; the `list_conversations` homeowner branch is sketched with a `...` for the row-building — the implementer fills it by mirroring the crew `out_homeowner`/`out_groups` builders already shown (factor a `_conv_out` helper). Mobile blocks specify exact APIs/files/Daylight tokens with grounded call sites.

**Type consistency:** `ConversationOut`/`ConversationSummary` reused unchanged (kind already includes `homeowner`); `chatApi.homeownerChannel` returns `ConversationSummary`; `chatApi.messages/read/send` use the existing discriminated-union/conversation_id forms; `DaylightBubble` `mine = sender_side === 'homeowner'`.

---

## Founder to-dos (only you can do these)

- **No migration this phase** — nothing to apply to Neon.
- **Device-test:** as a homeowner, open Messages → confirm a "Your builder" channel + any groups; send "the paint looks streaky" → confirm it does NOT create a site event; as the owner, confirm the homeowner channel appears in the Chat inbox (labeled "Homeowner · {site}", distinct from the crew thread) and you can reply two-way.
- **Confirm Hindi copy** on the homeowner Messages surfaces (Messages / Your builder / send) and the owner "Homeowner ·" label.
- **Decide later:** migrating "Ask the Builder" requests into the channel; push notifications; owner-initiated channel start; multi-site homeowner.

---

## Phase 3 closes the doc 18 build-order (§10)

Phases 1 (owner Chat surfacing), 2 (groups), 3 (homeowner Messages) are then all shipped. **Phase 4 (company-wide talk-only groups)** remains — `site_id=null` create path + company-wide member eligibility + inbox grouping; the schema + the talk-only send guard already support it, so Phase 4 is mostly lifting the `site_id` requirement on `POST /chat/groups` + the eligibility query + UI. That's its own small plan when you want it.
