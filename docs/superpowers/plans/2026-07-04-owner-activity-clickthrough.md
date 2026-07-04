# Owner Activity Click-Through & Chat Provisioning — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make every Owner activity/request click land in the right chat thread, and make a newly created project reachable in chat immediately (including a new owner's first project).

**Architecture:** A new non-breaking `/chat` deep-link contract (`?site` / `?conversation` / `?msg`), eager chat-conversation provisioning on site create, and a shared `useOpenHomeownerChannel()` opener wired into all three request-reply surfaces.

**Tech Stack:** FastAPI + SQLAlchemy async (backend), React + TS + Vite + TanStack Query v5 + react-router (web).

## Global Constraints

- Web: verify with `npm run build` (tsc -b, strict) — NOT `npm run lint`. Any new `t()` key must be added to BOTH `src/i18n/en.ts` AND `src/i18n/hi.ts` (hi.ts is a full `Record<TranslationKey,string>`; a missing key fails tsc -b).
- Backend: run tests with `.venv/bin/python3 -m pytest` and lint with `.venv/bin/python3 -m ruff check`. Baseline: 7 pre-existing WeasyPrint PDF `OSError` failures are the ONLY acceptable reds. No new DB migration (the `conversations` table already exists; the `scroll_message_id` addition is API-only).
- Non-breaking: bare `/chat` must still render; the `ActivityLink.scroll_message_id` field is additive/optional; existing chat send/read paths unchanged.
- Keep the branch green at every commit.

## Cross-task gotchas (read before starting)

- **G1:** `linkFor` changes signature from `(link)` → `(item)`; its call site in `ActivityStream.tsx` (line ~128 `to={linkFor(item.link)}`) MUST change to `to={linkFor(item)}` in the SAME task (Task 6) or the build breaks.
- **G2:** `ChatPage` must consume the SAME query key ChatInbox uses — `['chat','conversations']` (React Query dedupes; do NOT invent a new key or add to `qk`).
- **G3:** Backend `POST /chat/homeowner-channel` returns a `ConversationOut` whose JSON shape already equals the web `ConversationSummary` (id, kind, site_id, title, site_name, last_message_at, unread_count, has_homeowner) — no field mapping needed.
- **G4:** `OwnerHome.tsx` is edited by BOTH Task 6 (handleReply) and Task 8 (cold-start modal). Task 8 runs after Task 6.
- **G5:** The activity request row keeps its whole-row link → `/requests`; only the **Reply button** opens the homeowner channel. Two affordances, intentional.
- **G6:** Scroll-to-message is best-effort: `ChatThread` must no-op (never throw) when the `[data-msgid]` element isn't in the loaded thread, and must jsdom-guard `scrollIntoView` (mirror the existing `bottomRef` guard at `ChatThread.tsx:150`).
- **G7:** Eager conversation create uses `await session.flush()` to populate `site.id` before constructing the `Conversation`, in the same transaction.

---

### Task 1: Eager-provision the crew chat conversation on site create

**Files:**
- Modify: `constructo/backend/app/sites/router.py` (imports ~22-31; `create_site` ~134-149)
- Test: the module that tests `POST /api/v1/sites` (locate via `grep -rl 'post("/sites"\|/api/v1/sites' backend/tests` or `grep -rl create_site backend/tests`)

**Interfaces:**
- Produces: after `POST /sites`, a `Conversation(kind=site, site_id=<new site>)` exists → the site shows in `GET /chat/conversations`.

- [ ] **Step 1: Add a failing test** — creating a site provisions a crew conversation that appears in the owner's inbox.

```python
# In the sites API test module. Mirror the existing POST /sites test's fixtures
# (async client, owner auth headers, db session). Adjust imports to the module's style.
from uuid import UUID
from sqlalchemy import select
from app.models import Conversation, ConversationKind

async def test_create_site_provisions_crew_conversation(client, owner_headers, session):
    resp = await client.post(
        "/api/v1/sites", json={"name": "Provision Test Villa", "type": "villa"},
        headers=owner_headers,
    )
    assert resp.status_code == 201
    site_id = resp.json()["id"]

    conv = (
        await session.execute(
            select(Conversation).where(
                Conversation.site_id == UUID(site_id),
                Conversation.kind == ConversationKind.site,
            )
        )
    ).scalar_one_or_none()
    assert conv is not None, "site create must eager-provision a crew conversation"

    inbox = await client.get("/api/v1/chat/conversations", headers=owner_headers)
    assert inbox.status_code == 200
    assert any(c["site_id"] == site_id for c in inbox.json()), \
        "the new site must be visible in the owner chat inbox immediately"
```

- [ ] **Step 2: Run it, verify it fails** — `Run: .venv/bin/python3 -m pytest <module>::test_create_site_provisions_crew_conversation -v` → FAIL (no conversation).

- [ ] **Step 3: Implement** — add `Conversation, ConversationKind` to the `from app.models import (...)` block, and provision in `create_site`:

```python
@router.post("/sites", response_model=SiteOut, status_code=201)
async def create_site(
    body: SiteCreate,
    user: User = Depends(require_role(UserRole.owner, UserRole.pm)),
    session: AsyncSession = Depends(get_session),
) -> SiteOut:
    site = Site(
        company_id=user.company_id,
        name=body.name,
        type=body.type,
        location=body.location,
        status=body.status or "active",
    )
    session.add(site)
    await session.flush()  # G7: populate site.id before building the conversation
    # Eager-provision the crew chat thread so the project is reachable in chat
    # immediately — the inbox lists only sites that already have a Conversation
    # (otherwise it is created lazily on the first message send).
    session.add(
        Conversation(
            company_id=user.company_id,
            site_id=site.id,
            kind=ConversationKind.site,
            created_by=user.id,
        )
    )
    await session.commit()
    await session.refresh(site)
    return _site_out(site)
```

- [ ] **Step 4: Run tests** — the new test + the existing sites suite pass. `Run: .venv/bin/python3 -m pytest <sites test module> -q`.
- [ ] **Step 5: Commit** — `feat(sites): provision crew chat conversation on project create`.

---

### Task 2: Enrich activity items — photo scroll target + request subtitle

**Files:**
- Modify: `constructo/backend/app/activity/schemas.py` (`ActivityLink` model)
- Modify: `constructo/backend/app/activity/aggregate.py` (`_item`, `_map_photo`, `_map_request`)
- Test: `constructo/backend/tests/**/test_activity_aggregate.py` (the aggregate's existing unit test file — locate via `grep -rl build_activity backend/tests`)

**Interfaces:**
- Produces: photo items carry `link.scroll_message_id` (= `PublishedPhoto.source_chat_message_id` as str, or null); homeowner-request items carry `subtitle = request.detail`.

- [ ] **Step 1: Add failing tests** (aggregate is pure — no DB):

```python
# Mirror the file's existing row-builder helpers. If it builds PublishedPhoto /
# HomeownerRequest inline, add source_chat_message_id / detail there.
def test_photo_item_carries_scroll_message_id(...):
    msg_id = uuid4()
    photo = _make_photo(source_chat_message_id=msg_id)  # existing helper style
    out = _map_photo(photo, site)
    assert out["link"]["scroll_message_id"] == str(msg_id)

def test_photo_item_scroll_none_for_direct_upload(...):
    photo = _make_photo(source_chat_message_id=None)
    assert _map_photo(photo, site)["link"]["scroll_message_id"] is None

def test_request_item_subtitle_is_detail(...):
    req = _make_request(detail="Room: Kitchen Urgency: Normal")
    assert _map_request(req, site, NOW)["subtitle"] == "Room: Kitchen Urgency: Normal"
```

- [ ] **Step 2: Run, verify fail** — `Run: .venv/bin/python3 -m pytest <aggregate test> -v`.

- [ ] **Step 3: Implement.** In `schemas.py`, add the optional field to `ActivityLink`:

```python
class ActivityLink(BaseModel):
    type: str
    id: str
    # Optional scroll target for feed_photo items — the source chat message id,
    # so the web deep-link can open the thread AND scroll to the photo. None for
    # direct uploads / non-photo links.
    scroll_message_id: str | None = None
```

In `aggregate.py`, extend `_item` and the two mappers:

```python
def _item(*, kind, row_id, site, title, subtitle, occurred_at, actor,
          link_type, link_id, severity, scroll_message_id: str | None = None) -> dict:
    return {
        "id": f"{kind}:{row_id}",
        "kind": kind,
        "site_id": str(site.id),
        "site_name": site.name,
        "title": title,
        "subtitle": subtitle,
        "occurred_at": _as_utc(occurred_at).isoformat(),
        "actor": actor,
        "link": {"type": link_type, "id": str(link_id),
                 "scroll_message_id": scroll_message_id},
        "severity": severity,
    }

def _map_photo(p: PublishedPhoto, site: Site) -> dict:
    return _item(kind=KIND_PHOTO, row_id=p.id, site=site,
                 title=p.caption or "New photo", subtitle=None,
                 occurred_at=p.published_at, actor=None,
                 link_type=LINK_FEED_PHOTO, link_id=p.id, severity="success",
                 scroll_message_id=(str(p.source_chat_message_id)
                                    if p.source_chat_message_id else None))

def _map_request(r: HomeownerRequest, site: Site, now: dt.datetime) -> dict:
    sev = "warning" if _request_overdue(r, now) else "info"
    return _item(kind=KIND_REQUEST, row_id=r.id, site=site,
                 title=r.title, subtitle=(r.detail or None), occurred_at=r.created_at,
                 actor=None, link_type=LINK_REQUEST, link_id=r.id, severity=sev)
```

- [ ] **Step 4: Run tests** — new tests + full activity suite green (`.venv/bin/python3 -m pytest -k activity -q`). Confirm `PublishedPhoto.source_chat_message_id` exists (it is used in `chat/router.py:1048`).
- [ ] **Step 5: Commit** — `feat(activity): photo scroll target + request detail subtitle`.

---

### Task 3: ChatThread — best-effort scroll to a target message

**Files:**
- Modify: `constructo/web/src/features/chat/ChatThread.tsx`
- Test: `constructo/web/src/features/chat/ChatThread.test.tsx`

**Interfaces:**
- Produces: `ChatThreadProps.scrollToMessageId?: string` — on load, scrolls the `[data-msgid="<id>"]` row into view (once per id) and suppresses the initial bottom-autoscroll so it lands on the message.

- [ ] **Step 1: Failing test** — with a message id present in the thread and `scrollToMessageId` set, that row's `scrollIntoView` is called.

```tsx
// Follow the file's existing useChatThread/api mock pattern. Seed messages incl.
// one with a known id; spy on Element.prototype.scrollIntoView.
it('scrolls to scrollToMessageId when the message is loaded', async () => {
  const spy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {})
  // ...render <ChatThread address={...} scrollToMessageId="msg-2" /> with messages [msg-1, msg-2, msg-3]
  await screen.findByTestId('message-list')
  // the row for msg-2 carries data-msgid="msg-2"; assert scrollIntoView fired
  expect(spy).toHaveBeenCalled()
  spy.mockRestore()
})
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Add the prop and a guarded effect; suppress bottom autoscroll while a target is pending.

```tsx
export interface ChatThreadProps {
  address: ChatAddress
  title?: string
  hasHomeowner?: boolean
  onManageGroup?: () => void
  siteId?: string
  /** Best-effort: scroll this message id into view on open (activity deep-link). */
  scrollToMessageId?: string
}
export function ChatThread({ address, title, hasHomeowner, onManageGroup, siteId, scrollToMessageId }: ChatThreadProps) {
  // ...existing hooks...
  const scrolledToRef = useRef<string | null>(null)
  const pendingScroll = Boolean(scrollToMessageId && scrolledToRef.current !== scrollToMessageId)

  // In the EXISTING autoscroll layout effect (ChatThread.tsx ~146), gate it:
  //   const shouldScroll = (firstPaintRef.current || ownSend || atBottomRef.current) && !pendingScroll
  // (leave the rest untouched)

  useLayoutEffect(() => {
    if (!scrollToMessageId || scrolledToRef.current === scrollToMessageId) return
    if (messages.length === 0) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-msgid="${scrollToMessageId}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center' })
      scrolledToRef.current = scrollToMessageId
      firstPaintRef.current = false // don't let the bottom anchor override it
    }
  }, [scrollToMessageId, messages])
  // ...
}
```

Note: the message row already renders `data-msgid={message.id}` (`ChatThread.tsx:401`) — no change needed there.

- [ ] **Step 4: Run** — `npm run build` + `npx vitest run src/features/chat/ChatThread.test.tsx`. Existing autoscroll tests still pass (target unset → `pendingScroll=false` → unchanged behavior).
- [ ] **Step 5: Commit** — `feat(chat): ChatThread scrollToMessageId (best-effort deep-link scroll)`.

---

### Task 4: Chat API + hook to open the homeowner channel

**Files:**
- Modify: `constructo/web/src/api/chat.ts` (add `openHomeownerChannel`)
- Create: `constructo/web/src/features/chat/useOpenHomeownerChannel.ts`
- Test: `constructo/web/src/features/chat/useOpenHomeownerChannel.test.tsx`

**Interfaces:**
- Produces: `chatApi.openHomeownerChannel(siteId: string): Promise<ConversationSummary>`; `useOpenHomeownerChannel()` → a mutation whose `.mutate(siteId)` opens/creates the channel, invalidates `['chat','conversations']`, and navigates to `/chat?conversation=<id>` with `state.conversation` set.

- [ ] **Step 1: Failing test** for the hook.

```tsx
// Mock chatApi.openHomeownerChannel + react-router useNavigate; wrap in a QueryClientProvider.
it('opens the channel, invalidates the inbox, and navigates with state', async () => {
  const conv = { id: 'c9', kind: 'homeowner', site_id: 's1', title: null, site_name: 'Villa A', last_message_at: null, unread_count: 0, has_homeowner: true }
  // openHomeownerChannel mock resolves conv; render a component calling mutate('s1')
  // assert navigate called with '/chat?conversation=c9' and { state: { conversation: conv } }
  // assert queryClient.invalidateQueries called for ['chat','conversations']
})
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** In `chat.ts`:

```ts
/** Get-or-create the per-site homeowner 1:1 channel; returns its inbox row. */
openHomeownerChannel(siteId: string): Promise<ConversationSummary> {
  return request<ConversationSummary>('/api/v1/chat/homeowner-channel', {
    method: 'POST',
    body: JSON.stringify({ site_id: siteId }),
  })
},
```

New `useOpenHomeownerChannel.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { chatApi } from '../../api/chat'

/** Open (get-or-create) a project's homeowner 1:1 channel and jump into it. */
export function useOpenHomeownerChannel() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: (siteId: string) => chatApi.openHomeownerChannel(siteId),
    onSuccess: (conversation) => {
      void qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })
      navigate(`/chat?conversation=${conversation.id}`, { state: { conversation } })
    },
  })
}
```

- [ ] **Step 4: Run** — `npm run build` + the new vitest file.
- [ ] **Step 5: Commit** — `feat(chat): openHomeownerChannel api + useOpenHomeownerChannel hook`.

---

### Task 5: ChatPage — resolve deep-link params and auto-select

**Files:**
- Modify: `constructo/web/src/features/chat/ChatPage.tsx`
- Test: `constructo/web/src/features/chat/ChatPage.test.tsx`

**Interfaces:**
- Consumes: `ChatThread.scrollToMessageId` (Task 3); the `['chat','conversations']` query (G2).
- Behavior: `?conversation=<id>` / `?site=<id>` selects that thread; `location.state.conversation` selects instantly (before the list refetch); bare `/chat` on desktop auto-selects the most-recent conversation; `?msg=<id>` is passed to `ChatThread` as `scrollToMessageId`. While a param is present but unresolved, show a spinner (not the empty state).

- [ ] **Step 1: Failing tests** (extend the existing ChatPage test; it already mocks ChatInbox/ChatThread):

```tsx
// Seed the inbox query: qc.setQueryData(['chat','conversations'], [convSite, convHome])
// 1) initialEntries ['/chat?conversation=c-home'] → ChatThread rendered for c-home
// 2) initialEntries ['/chat?site=s1'] → selects the kind==='site' conv for s1
// 3) router state { conversation: convHome } → selects immediately even with empty list
// 4) bare '/chat' (desktop width) → auto-selects conversations[0]
// 5) ['/chat?conversation=c-home&msg=m5'] → ChatThread receives scrollToMessageId="m5"
```

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Read params + state; run one query for the list; resolve in an effect; render spinner while resolving.

```tsx
import { useSearchParams, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { chatApi } from '../../api/chat'
// ...
const [params] = useSearchParams()
const location = useLocation()
const siteParam = params.get('site')
const convParam = params.get('conversation')
const msgParam = params.get('msg')
const stateConv = (location.state as { conversation?: ConversationSummary } | null)?.conversation ?? null

const { data: conversations } = useQuery({
  queryKey: ['chat', 'conversations'],
  queryFn: chatApi.conversations,
})

useEffect(() => {
  if (selectedConv) return
  if (stateConv && (!convParam || stateConv.id === convParam)) {
    setSelectedConv(stateConv); setMobileShowThread(true); return
  }
  if (convParam) {
    const c = conversations?.find((x) => x.id === convParam)
    if (c) { setSelectedConv(c); setMobileShowThread(true) }
    return
  }
  if (siteParam) {
    const c = conversations?.find((x) => x.kind === 'site' && x.site_id === siteParam)
    if (c) { setSelectedConv(c); setMobileShowThread(true) }
    return
  }
  // Bare /chat on desktop: auto-open the most-recent thread (server-sorted first).
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  if (isDesktop && conversations && conversations.length > 0) setSelectedConv(conversations[0])
}, [conversations, siteParam, convParam, stateConv, selectedConv])

const resolving = Boolean((siteParam || convParam) && !selectedConv)
```

In the right pane, order the branches: `chatAddress && selectedConv ? <ChatThread ... scrollToMessageId={msgParam ?? undefined} /> : resolving ? <Spinner/> : <EmptyState "Select a conversation"/>`. Pass `scrollToMessageId={msgParam ?? undefined}` into the existing `<ChatThread />`.

- [ ] **Step 4: Run** — `npm run build` + ChatPage vitest. The existing "empty state when nothing selected" test still holds for bare `/chat` with an EMPTY list.
- [ ] **Step 5: Commit** — `feat(chat): deep-link ?site/?conversation/?msg + auto-select most-recent`.

---

### Task 6: Repoint activity feed clicks (photo → thread, request Reply → homeowner channel)

**Files:**
- Modify: `constructo/web/src/api/activity.ts` (`ActivityLink` type + the mock feed_photo item)
- Modify: `constructo/web/src/features/owner/ActivityStream.tsx` (`linkFor` + its call site — G1)
- Modify: `constructo/web/src/pages/owner/OwnerHome.tsx` (`handleReply` → hook)
- Tests: `ActivityStream.test.tsx`, `OwnerHome.test.tsx`

**Interfaces:**
- Consumes: `useOpenHomeownerChannel` (Task 4); `ActivityLink.scroll_message_id` (Task 2).

- [ ] **Step 1: Failing tests.** `ActivityStream`: a `feed_photo` row links to `/chat?site=<site_id>&msg=<scroll_message_id>` (and `/chat?site=<site_id>` when scroll id is null); a `request` row's whole-row link is still `/requests`. `OwnerHome`: `handleReply(item)` calls `openHomeownerChannel.mutate(item.site_id)` (replace the old `navigate('/requests')` assertion).

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** `activity.ts` — add the field + a scroll id to the mock photo:

```ts
export interface ActivityLink { type: ActivityLinkType; id: string; scroll_message_id?: string | null }
// in the mock feed_photo item, add e.g. scroll_message_id: 'aaaaaaaa-0000-0000-0000-0000000000c1'
```

`ActivityStream.tsx` — new `linkFor(item)` + change the call site `to={linkFor(item)}`:

```ts
export function linkFor(item: { link: ActivityLink; site_id: string }): string {
  const { link, site_id } = item
  switch (link.type) {
    case 'feed_photo': {
      const msg = link.scroll_message_id ? `&msg=${encodeURIComponent(link.scroll_message_id)}` : ''
      return `/chat?site=${encodeURIComponent(site_id)}${msg}`
    }
    case 'update':
    case 'milestone': return `/sites/${link.id}`
    case 'request': return '/requests'
    case 'decision': return '/approvals'
    case 'finding': return `/health/${link.id}`
    default: return '/owner'
  }
}
```
(The request Reply button already calls `onReply(item)` — no change in ActivityStream beyond `linkFor`.)

`OwnerHome.tsx`:

```tsx
import { useOpenHomeownerChannel } from '../../features/chat/useOpenHomeownerChannel'
// ...
const openHomeowner = useOpenHomeownerChannel()
function handleReply(item: ActivityItem) {
  openHomeowner.mutate(item.site_id)
}
```
(Remove the now-unused `navigate('/requests')`; keep `navigate` only if still used elsewhere — it is not, so drop the import if unused to satisfy tsc.)

- [ ] **Step 4: Run** — `npm run build` + both vitest files.
- [ ] **Step 5: Commit** — `feat(owner): photo rows open the project thread; request Reply opens the homeowner channel`.

---

### Task 7: RequestsView Reply → homeowner channel

**Files:**
- Modify: `constructo/web/src/features/requests/RequestsView.tsx`
- Test: `constructo/web/src/features/requests/RequestsView.test.tsx`

**Interfaces:**
- Consumes: `useOpenHomeownerChannel` (Task 4). The per-row Reply must pass the row's `site_id`.

- [ ] **Step 1: Failing test** — clicking a request's Reply calls `openHomeownerChannel.mutate(<that row's site_id>)` (mock the hook).

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Thread the row into `onReply` so it knows the site:

```tsx
import { useOpenHomeownerChannel } from '../chat/useOpenHomeownerChannel'
// RequestRow: onReply becomes ((r: RequestOut) => void) | null; button → onClick={() => onReply(r)}
// Group: onReply: (r: RequestOut) => void; pass through to RequestRow
// RequestsView:
const openHomeowner = useOpenHomeownerChannel()
const openReply = (r: RequestOut) => openHomeowner.mutate(r.site_id)
// pass onReply={openReply} to each replyable Group; drop the old navigate('/chat')
```

- [ ] **Step 4: Run** — `npm run build` + RequestsView vitest.
- [ ] **Step 5: Commit** — `feat(requests): Reply opens the project's homeowner channel`.

---

### Task 8: New project reaches chat instantly + cold-start is actionable

**Files:**
- Modify: `constructo/web/src/features/owner/NewProjectModal.tsx` (invalidate chat inbox on create)
- Modify: `constructo/web/src/pages/owner/SetupChecklist.tsx` (add_project step → action)
- Modify: `constructo/web/src/pages/owner/OwnerHome.tsx` (render `NewProjectModal` for the cold-start trigger)
- Tests: `NewProjectModal.test.tsx`, `SetupChecklist.test.tsx`, `OwnerHome.test.tsx`

**Interfaces:**
- Consumes: existing `NewProjectModal`. Note G4 — OwnerHome already edited in Task 6.

- [ ] **Step 1: Failing tests.** `NewProjectModal`: on successful create it invalidates `['chat','conversations']` (in addition to the existing three). `SetupChecklist`: rendering with an `add_project` (not-done) step + `onAddProject` shows a control that, when clicked, calls `onAddProject`. `OwnerHome`: on cold start, clicking that control opens the modal (a dialog appears).

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.**

`NewProjectModal.tsx` onSuccess — add one line:
```tsx
qc.invalidateQueries({ queryKey: ['chat', 'conversations'] })
```

`SetupChecklist.tsx` — add an optional action for the first-project step:
```tsx
export function SetupChecklist({ steps, onAddProject }: { steps: SetupStep[]; onAddProject?: () => void }) {
  // For the step where step.key === 'add_project' && !step.done && onAddProject,
  // render a trailing button (reuse Button variant="primary" size sm) labelled
  // t('owner.setup.add_project_cta') that calls onAddProject, instead of the
  // to-do StatusPill. Other steps render unchanged.
}
```
Add the `owner.setup.add_project_cta` key to BOTH `en.ts` and `hi.ts` (e.g. "Add project" / Hindi equivalent).

`OwnerHome.tsx` — own one modal for the cold-start path:
```tsx
const [showNewProject, setShowNewProject] = useState(false)
// in the cold_start branch: <SetupChecklist steps={...} onAddProject={() => setShowNewProject(true)} />
// render once (any branch): <NewProjectModal open={showNewProject} onClose={() => setShowNewProject(false)} />
```
Verify `ProjectsStrip` still owns its own New-project modal for the populated view (leave it; cold_start is exclusive so the two never co-render).

- [ ] **Step 4: Run** — `npm run build` + the three vitest files.
- [ ] **Step 5: Commit** — `feat(owner): new project shows in chat instantly + actionable cold-start`.

---

## Final whole-branch review

After Task 8, dispatch a whole-branch reviewer (most capable model) with the merge-base→HEAD package. Focus lenses: the deep-link resolution race (param present but conversation not yet in the list — must show spinner, never a wrong/empty selection), owner access to the homeowner channel (no 403 regression), the `linkFor` signature change call site (G1), and that bare `/chat` + existing chat tests are unbroken. Then run `finishing-a-development-branch` → PR.
