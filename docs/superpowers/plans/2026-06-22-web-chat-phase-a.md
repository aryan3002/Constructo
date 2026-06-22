# Web Chat — Phase A (Core Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** Ship a real, usable web chat (inbox + thread + text/media + WebSocket real-time + read receipts + reply + AI capture-card rendering) for owner/supervisor/architect, Neev-styled, against the existing backend.

**Architecture:** Mirror the mobile chat kit in the web stack (React + Vite + TanStack Query + react-router + semantic tokens). Reuse the exact REST + WebSocket contract (`/api/v1/chat/*`). In-memory optimistic send (no offline outbox). Spec: `docs/superpowers/specs/2026-06-22-web-chat-phase-a-design.md`.

**Tech Stack:** React 18, TS, Vite, @tanstack/react-query v5, react-router v6, Tailwind (semantic tokens), Vitest + Testing Library.

## Global Constraints
- **ZERO `constructo/backend/` changes.** All paths below are under `constructo/web/`.
- Keep the suite green (currently **453**), `tsc -b` clean, `npm run build` OK, `npm run budget` ≤ 250 KB gz (chat is **lazy-loaded** so it stays out of the entry chunk).
- All chat UI uses **semantic tokens** (works neev light + neev-dark); never hardcoded hex/`bg-white`.
- File-content tests use Vite `?raw`; **no** tsconfig test-exclude.
- Branch `feat/web-chat` (already checked out, stacks on the Neev re-skin).
- The current user id comes from the shared `useMe()` hook (`src/auth/useCan.ts` / `src/pages/auth/useMe.ts`); "own message" = `sender_id === me.id`.

## File structure
- `src/api/chat.ts` — chat API client + types (Task 2)
- `src/features/chat/ticks.ts` — pure delivery-state (Task 3)
- `src/features/chat/threadMerge.ts` — pure message merge/dedupe (Task 4)
- `src/features/chat/socket.ts` — shared WebSocket singleton (Task 5)
- `src/features/chat/useChatThread.ts` — thread data hook (Task 6)
- `src/features/chat/ConversationRow.tsx`, `ChatInbox.tsx` (Task 7)
- `src/features/chat/MessageBubble.tsx` (Task 8)
- `src/features/chat/CaptureCard.tsx` (Task 9)
- `src/features/chat/NivaanProposalCard.tsx`, `SystemNotice.tsx` (Task 10)
- `src/features/chat/ChatComposer.tsx` (Task 11)
- `src/features/chat/ChatThread.tsx` (Task 12)
- `src/features/chat/ChatPage.tsx` (Task 13) + route in `src/App.tsx` + tab in `src/ui/AppShell.tsx`
- `src/ui/themeSkin.ts` — `skinForRole` flip (Task 1)

---

### Task 1: Flip supervisor + architect to the Neev skin

**Files:** Modify `src/ui/themeSkin.ts`; Modify `src/ui/themeSkin.test.ts`.

**Interfaces:** Produces: `skinForRole(role, enabled)` now returns `'neev'` for `owner|supervisor|architect`.

- [ ] **Step 1: Update the failing test** — in `src/ui/themeSkin.test.ts`, replace the `skinForRole` describe block body with:
```ts
describe('skinForRole', () => {
  it('is neev for owner/supervisor/architect when enabled', () => {
    expect(skinForRole('owner', true)).toBe('neev')
    expect(skinForRole('supervisor', true)).toBe('neev')
    expect(skinForRole('architect', true)).toBe('neev')
  })
  it('is blueprint for those roles when the flag is off', () => {
    expect(skinForRole('owner', false)).toBe('blueprint')
    expect(skinForRole('supervisor', false)).toBe('blueprint')
  })
  it('is blueprint for other roles', () => {
    expect(skinForRole('pm', true)).toBe('blueprint')
    expect(skinForRole('accountant', true)).toBe('blueprint')
    expect(skinForRole(undefined, true)).toBe('blueprint')
  })
})
```
- [ ] **Step 2: Run → FAIL** — `npx vitest run src/ui/themeSkin.test.ts` (supervisor/architect return blueprint).
- [ ] **Step 3: Implement** — in `src/ui/themeSkin.ts` replace `skinForRole`:
```ts
const NEEV_ROLES = new Set(['owner', 'supervisor', 'architect'])
/** The Neev skin is gated by VITE_NEEV_OWNER and applies to the roles that have it. */
export function skinForRole(role: string | undefined, enabled: boolean): ThemeSkin {
  return enabled && role !== undefined && NEEV_ROLES.has(role) ? 'neev' : 'blueprint'
}
```
- [ ] **Step 4: Run → PASS** — `npx vitest run src/ui/themeSkin.test.ts`.
- [ ] **Step 5: Full suite + tsc** — `npx tsc -b --noEmit && npx vitest run` (all green).
- [ ] **Step 6: Commit** — `git add src/ui/themeSkin.ts src/ui/themeSkin.test.ts && git commit -m "feat(web/neev): extend skin to supervisor + architect"`

---

### Task 2: Chat API client + types (`src/api/chat.ts`)

**Files:** Create `src/api/chat.ts`; Create `src/api/chat.test.ts`.

**Interfaces:** Produces the types in the spec (`ConversationSummary`, `ChatMessage`, `ChatEvent`, `CursorOut`, `ChatAddress`, `SenderKind`, `ConversationKind`) and `chatApi` with: `conversations`, `messages`, `send`, `presignMedia`, `uploadMedia`, `read`, `delivered`, `cursors`, `wsTicket`. Consumes the existing HTTP client.

First READ `src/api/client.ts` (and `src/api/config.ts`, an existing `src/api/*.ts` like `dashboard.ts`) to follow the established request helper + auth-header pattern. Mirror it — do NOT invent a new fetch wrapper.

- [ ] **Step 1: Write the failing test** `src/api/chat.test.ts` — test that `addrParams` builds the right query string and `messages`/`send` call the client with the right path/params. Example (adapt the client mock to the real client API after reading `client.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('./client', () => ({ apiGet: vi.fn(), apiPost: vi.fn() })) // adapt names to client.ts
import { addrParams } from './chat'

describe('addrParams', () => {
  it('site address → site_id', () => {
    expect(addrParams({ siteId: 's1' })).toEqual({ site_id: 's1' })
  })
  it('conversation address → conversation_id', () => {
    expect(addrParams({ conversationId: 'c1' })).toEqual({ conversation_id: 'c1' })
  })
})
```
- [ ] **Step 2: Run → FAIL** — `npx vitest run src/api/chat.test.ts`.
- [ ] **Step 3: Implement** `src/api/chat.ts` — the types from the spec, plus:
```ts
export type ChatAddress = { siteId: string } | { conversationId: string }
export function addrParams(a: ChatAddress): Record<string, string> {
  return 'siteId' in a ? { site_id: a.siteId } : { conversation_id: a.conversationId }
}
```
and `chatApi` functions wrapping the existing client (use the real `client.ts` helpers). `send` accepts a `ChatSendBody` (`{ ...addr, client_msg_id, body?, reply_to_id?, capture_type?, fields?, attachment_key?, attachment_mime?, media_type?, attachment_sha256? }`). `messages(addr, opts)` → GET with `{ ...addrParams(addr), after_seq, before_seq?, order?, limit? }`. Media: `presignMedia` → `POST /chat/media/presign`; `uploadMedia` → multipart `POST /chat/media`. Mirror mobile `src/api/chat.ts` semantics exactly.
- [ ] **Step 4: Run → PASS**; then `npx tsc -b --noEmit`.
- [ ] **Step 5: Commit** — `git add src/api/chat.ts src/api/chat.test.ts && git commit -m "feat(web/chat): chat API client + types"`

---

### Task 3: Pure delivery-state (`src/features/chat/ticks.ts`)

**Files:** Create `src/features/chat/ticks.ts`; Create `src/features/chat/ticks.test.ts`.

**Interfaces:** Produces `computeDeliveryState(seq, cursors, myUserId): 'sent'|'delivered'|'read'`. Consumes `CursorOut` from `../../api/chat`.

- [ ] **Step 1: Write the failing test** `ticks.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeDeliveryState } from './ticks'
const me = 'me'
const others = (d: number, r: number) => [
  { user_id: 'me', last_delivered_seq: 99, last_read_seq: 99 },
  { user_id: 'a', last_delivered_seq: d, last_read_seq: r },
]
describe('computeDeliveryState', () => {
  it('read when every other has read >= seq', () => {
    expect(computeDeliveryState(5, others(9, 9), me)).toBe('read')
  })
  it('delivered when every other delivered >= seq but not read', () => {
    expect(computeDeliveryState(5, others(9, 2), me)).toBe('delivered')
  })
  it('sent when an other is behind on delivered', () => {
    expect(computeDeliveryState(5, others(2, 0), me)).toBe('sent')
  })
  it('sent when no other cursors (solo)', () => {
    expect(computeDeliveryState(5, [{ user_id: 'me', last_delivered_seq: 9, last_read_seq: 9 }], me)).toBe('sent')
  })
})
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `ticks.ts`:
```ts
import type { CursorOut } from '../../api/chat'
export type DeliveryState = 'sent' | 'delivered' | 'read'
/** Cursor-derived tick for an OWN message at `seq`. Excludes the caller's own cursor. */
export function computeDeliveryState(
  seq: number, cursors: CursorOut[], myUserId: string | null,
): DeliveryState {
  const others = cursors.filter((c) => c.user_id !== myUserId)
  if (others.length === 0) return 'sent'
  if (others.every((c) => c.last_read_seq >= seq)) return 'read'
  if (others.every((c) => c.last_delivered_seq >= seq)) return 'delivered'
  return 'sent'
}
```
- [ ] **Step 4: Run → PASS**.
- [ ] **Step 5: Commit** — `git commit -m "feat(web/chat): cursor-derived delivery ticks"`

---

### Task 4: Message merge/dedupe (`src/features/chat/threadMerge.ts`)

**Files:** Create `src/features/chat/threadMerge.ts`; Create `threadMerge.test.ts`.

**Interfaces:** Produces `mergeMessages(existing, incoming, max=200): ChatMessage[]` — dedupe by `seq` (newer object wins so extraction upgrades replace), seq-sorted ascending, capped to the last `max`.

- [ ] **Step 1: Failing test** — assert: dedupe by seq keeps the incoming copy; result is ascending by seq; cap keeps the last N.
```ts
import { describe, it, expect } from 'vitest'
import { mergeMessages } from './threadMerge'
const m = (seq: number, body: string) => ({ seq, body, id: String(seq) } as never)
describe('mergeMessages', () => {
  it('dedupes by seq, newer wins, sorted asc', () => {
    const out = mergeMessages([m(1,'a'), m(2,'b')], [m(2,'B'), m(3,'c')])
    expect(out.map((x: any) => [x.seq, x.body])).toEqual([[1,'a'],[2,'B'],[3,'c']])
  })
  it('caps to the last max', () => {
    const a = [m(1,'a'), m(2,'b'), m(3,'c')]
    expect(mergeMessages(a, [], 2).map((x: any) => x.seq)).toEqual([2,3])
  })
})
```
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement**:
```ts
import type { ChatMessage } from '../../api/chat'
export function mergeMessages(
  existing: ChatMessage[], incoming: ChatMessage[], max = 200,
): ChatMessage[] {
  const bySeq = new Map<number, ChatMessage>()
  for (const m of existing) bySeq.set(m.seq, m)
  for (const m of incoming) bySeq.set(m.seq, m) // newer wins
  const sorted = [...bySeq.values()].sort((a, b) => a.seq - b.seq)
  return sorted.slice(Math.max(0, sorted.length - max))
}
```
- [ ] **Step 4: Run → PASS**; **Step 5: Commit** — `git commit -m "feat(web/chat): message merge/dedupe"`

---

### Task 5: Shared WebSocket singleton (`src/features/chat/socket.ts`)

**Files:** Create `src/features/chat/socket.ts`; Create `socket.test.ts`.

**Interfaces:** Produces `getChatSocket()` returning a singleton with `subscribe(addrKey, afterSeq, onFrame): () => void` (returns unsubscribe), `markDelivered(addrKey, seq)`, `markRead(addrKey, seq)`. Consumes `chatApi.wsTicket` + `API_BASE`. A frame handler receives `{ type, conv, payload?, ... }`.

Design for testability: the socket takes an injectable WebSocket factory (default `globalThis.WebSocket`) so tests pass a `MockWebSocket`. Read mobile `src/chat/socket.ts` for the exact frame protocol + reconnect logic and port it (browser `WebSocket`, `crypto`-safe).

- [ ] **Step 1: Failing test** `socket.test.ts` — using a `MockWebSocket` (records sent frames, lets the test push incoming frames), assert: on `subscribe` it sends a `sub` frame for the conv with `after_seq`; an incoming `msg` frame for that conv invokes the handler; `markDelivered` sends a `delivered` frame; `unsubscribe` sends `unsub` and stops delivering. (Write a minimal MockWebSocket in the test.)
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `socket.ts` — a module-singleton `ChatSocket`: lazy-connect via `chatApi.wsTicket()` → `new WS(API_BASE.replace(/^http/,'ws') + '/api/v1/chat/ws?ticket=' + ticket)`; a `Map<convKey, Set<handler>>` registry; queue `sub` frames until open, flush on open; route incoming `{conv}` frames to that conv's handlers; reconnect with exponential backoff + jitter (1s→30s) and resubscribe-all on reopen; `ping` every 30s; expose `subscribe/markDelivered/markRead`. Export `getChatSocket()`. (Port from mobile `src/chat/socket.ts`.)
- [ ] **Step 4: Run → PASS**; `npx tsc -b --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(web/chat): shared WebSocket singleton"`

---

### Task 6: Thread hook (`src/features/chat/useChatThread.ts`)

**Files:** Create `src/features/chat/useChatThread.ts`; Create `useChatThread.test.tsx`.

**Interfaces:** Produces `useChatThread(address)` returning the shape in the spec (`messages, isLoading, error, sending, reply, setReply, send, sendMedia, sendProposal, loadOlder, hasOlder, deliveryState, retry, pending`). Consumes `chatApi`, `mergeMessages`, `computeDeliveryState`, `getChatSocket`, `useMe`.

- [ ] **Step 1: Failing test** `useChatThread.test.tsx` — with `chatApi` mocked (returns 2 messages) and the socket mocked, render the hook in a QueryClientProvider; assert `messages` loads and `send('hi')` produces an optimistic pending entry then resolves. (Keep it focused; the heavy logic is in the pure utils already tested.)
- [ ] **Step 2: Run → FAIL**.
- [ ] **Step 3: Implement** `useChatThread.ts`:
  - `useQuery(['chat','thread', addrKey], () => chatApi.messages(address, { afterSeq: 0 }))` → store merged messages in a `useRef`/state via `mergeMessages` so incremental sync + socket frames accumulate.
  - `useEffect` subscribe to `getChatSocket().subscribe(addrKey, maxSeq, onFrame)`; `onFrame`: `msg` → merge payload + `markDelivered(addrKey, payload.seq)`; `receipt` → refetch cursors; `event_update` → refetch messages.
  - Cursors: `useQuery(['chat','cursors', addrKey], () => chatApi.cursors(address))`; `deliveryState(seq)` uses `computeDeliveryState(seq, cursors, me.id)`.
  - `send(body)`: `const cid = crypto.randomUUID()`; push pending `{clientMsgId: cid, body, state:'sending'}`; `chatApi.send({...address, client_msg_id: cid, body, reply_to_id: reply?.id})`; on success drop the pending (the real row arrives via merge/refetch); on error mark pending `failed`. `retry(cid)` re-sends.
  - `sendMedia`/`sendProposal` analogous (media: presign→PUT→send with attachment_key; proposal: send with capture_type+fields).
  - `loadOlder()`: `chatApi.messages(address, { beforeSeq: minSeq, order: 'desc', limit: 50 })` → prepend-merge; `hasOlder` from whether the last page filled `limit`.
  - Mark-read effect: on newest seq change → `chatApi.read(address, newestSeq)` + `queryClient.invalidateQueries(['chat','conversations'])`.
- [ ] **Step 4: Run → PASS**; `npx tsc -b --noEmit && npx vitest run`.
- [ ] **Step 5: Commit** — `git commit -m "feat(web/chat): useChatThread hook (query + socket + optimistic)"`

---

### Tasks 7–12: Components (Neev-styled). Token map + reference + tests.

For every component task: build from the **mobile reference** (`constructo/mobile/src/chat/MessageView.tsx`, `_chat_components.tsx`, `_chat_inbox.tsx`, `ChatComposer.tsx`) translated to web + the Neev **token map** below. Each ends with a Vitest render test (mock data, no live socket) and `tsc`+suite green, then a commit. Use semantic tokens only.

**Token map (chat-specific):**
| Element | Tailwind/token |
|---|---|
| own bubble | `bg-brand-subtle text-text-primary rounded-sheet` (sage tint) |
| other bubble | `bg-surface-card border border-edge rounded-sheet` |
| sender name | `text-micro font-semibold text-text-muted` |
| timestamp | `cstk-mono text-micro text-text-muted` |
| read tick | `text-brand` (sage); sent/delivered | `text-text-muted` |
| capture card | `bg-surface-card border border-edge rounded-card shadow-card` |
| card type pill | `bg-surface-sunken text-text-secondary rounded-pill` |
| "check this"/clarify | `bg-warn-bg text-warn-fg`; disputed | `bg-risk-bg text-risk-fg`; approved | `bg-ok-bg text-ok-fg` |
| nivaan eyebrow | `text-[var(--celebrate-text)]` |
| unread badge | `bg-brand text-text-on-brand rounded-pill` |
| inbox row | `hover:bg-surface-hover rounded-control` |

### Task 7: `ConversationRow` + `ChatInbox`
**Files:** Create `ConversationRow.tsx`, `ChatInbox.tsx`, `ChatInbox.test.tsx`.
- Render `conversations()` (TanStack Query, `refetchInterval: 15000`). Row: avatar (homeowner→person glyph / else initials), title (`Homeowner · {site_name}` for homeowner kind else `title ?? site_name ?? 'Site'`), sub-cue (`◈ Company-wide` if group+no site / `◆ Client in this thread` if `has_homeowner` & not homeowner kind — shape+color, never color alone), recency (Mono, from `last_message_at`), unread badge when `unread_count>0`. Empty/loading/error states. `onSelect(conv)` prop.
- Test: renders a homeowner row + a group row, shows unread badge, shows empty state. **Commit.**

### Task 8: `MessageBubble`
**Files:** Create `MessageBubble.tsx`, `MessageBubble.test.tsx`.
- Props: `message, mine, showSenderName, deliveryState, onReply, resolveParent(id)`. Renders body, sender name (when `showSenderName && !mine`), timestamp, ticks (own only: `✓`/`✓✓`/sage `✓✓`), quoted-parent strip when `reply_to_id` resolves, inline `<img>` when `attachment_url` + `media_type==='image'`, attachment chip for doc/voice.
- Test: own vs other alignment classes; tick for read state; sender name shown only for others. **Commit.**

### Task 9: `CaptureCard`
**Files:** Create `CaptureCard.tsx`, `CaptureCard.test.tsx`.
- Props: `event: ChatEvent, message`. Type pill (icon+word per `EVENT_META` — port the map from mobile MessageView), key-field line (port `keyFields()` incl. INR custom-grouping `inr()`), summary, status pills (Disputed/Approved/Check-this), **Show proof ▾** toggle revealing image + source text + `{time} · {pct}% sure`. `raw_status` processing/failed affordance.
- Test: renders an attendance event's key fields; "Check this" pill when `needs_clarification`; proof toggles. **Commit.**

### Task 10: `NivaanProposalCard` + `SystemNotice`
**Files:** Create `NivaanProposalCard.tsx`, `SystemNotice.tsx`, `chatExtras.test.tsx`.
- `NivaanProposalCard`: `✦ Nivaan` eyebrow + summary + Confirm (when `meta.proposal.committable` → `onConfirm(capture_type, fields)`) + Dismiss; post-action status line.
- `SystemNotice(message)`: returns centered muted line for `meta.blocked.reason==='contested'` (disputed notice) or `sender_kind==='system'` (body); else null.
- Test: proposal Confirm calls back with capture_type+fields; system notice renders contested line. **Commit.**

### Task 11: `ChatComposer`
**Files:** Create `ChatComposer.tsx`, `ChatComposer.test.tsx`.
- Multiline textarea + Send (disabled empty/sending); reply banner (snippet + cancel); media: a file input / drop zone → `chatApi.presignMedia` → PUT to `put_url` with the canonical MIME → `onSendMedia({attachmentKey, mime, sha256, mediaType})` (compute sha256 with `crypto.subtle.digest`). Slash/voice/smart-suggest are **out** (Phase B) — leave clearly-named slots.
- Test: typing + Send calls `onSend(body)` and clears; reply banner cancel clears reply. **Commit.**

### Task 12: `ChatThread`
**Files:** Create `ChatThread.tsx`, `ChatThread.test.tsx`.
- Props: `address`. Uses `useChatThread(address)` + `useMe()`. Renders header (title + client-present banner), a scrollable list mapping each message to the right primitive (events→`CaptureCard`s, `meta.proposal`→`NivaanProposalCard`, system→`SystemNotice`, else `MessageBubble`), **day separators** between dates, autoscroll-to-end on new, `loadOlder` on scroll-to-top, then the `ChatComposer`. Pending bubbles (sending/failed→retry) at the end.
- Test (mock `useChatThread`): renders a text bubble + a capture card + a system notice in order; day separator appears between two dates. **Commit.**

### Task 13: `ChatPage` + route + nav
**Files:** Create `ChatPage.tsx`, `ChatPage.test.tsx`; Modify `src/App.tsx` (lazy route `/chat`); Modify `src/ui/AppShell.tsx` (`ROLE_TABS` add Chat to owner/supervisor/architect).
- `ChatPage`: two-pane — `ChatInbox` (left, `md:w-80`) + selected `ChatThread` (right); on narrow, show inbox then thread. Wrapped in `AppShell` (role from `useMe`, sites for the switcher). Empty state when no conversation selected.
- `AppShell` ROLE_TABS: add `{ to: '/chat', labelKey: 'nav.chat', label: 'Chat', icon: <MessageIcon /> }` to `owner`, `pm`(optional—skip), `supervisor`, `architect`. Add the `nav.chat` i18n key to `en.ts` + `hi.ts`.
- Test: ChatPage renders the inbox; selecting a conversation renders the thread (mock the hooks). **Commit.**

---

### Task 14: Phase A verification

**Files:** none (verification).
- [ ] **Gate:** `npx tsc -b --noEmit && npx vitest run && npm run build && npm run budget` — all green; confirm chat is a lazy chunk (not in entry).
- [ ] **Visual (mock):** with `.env.local` (`VITE_USE_MOCKS=true VITE_NEEV_OWNER=true`), preview → log in owner → `/chat` → confirm inbox + thread render in neev light and dark. (Mock chat data may be thin; at minimum the empty/loading states + layout render.)
- [ ] **Role-flip spot-check:** log in as supervisor/architect (mock) → their app is neev + the Chat tab shows.
- [ ] **Live WS smoke (if backend runnable):** start the backend (`uv run --directory constructo/backend uvicorn app.main:app --port 8000`) with a seeded chat; point web `.env.local` at it (`VITE_USE_MOCKS=false`); send a message, open a second session, confirm live delivery + ticks. If the backend isn't runnable here, note it and rely on the socket/hook unit tests.
- [ ] **Commit** any notes; mark Phase A done.

## Definition of Done
Per the spec §DoD: owner/supervisor/architect (Neev) have a Chat tab → two-pane inbox+thread, send text+media, reply, live WebSocket messages, read/delivered ticks, and correct CaptureCard/Nivaan/system rendering, in neev light+dark. Suite/types/build/budget green; zero backend changes.

## What's next (separate plans)
Phase B (slash + smart-suggest + voice), Phase C (groups create/manage UI), Phase D (supervisor command tools: brief pin, radar, recap, disputes, action-items).
