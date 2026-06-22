# Web Chat — Phase A (Core Spine) Design Spec

**Date:** 2026-06-22 · **Surface:** `constructo/web` · **Branch:** new `feat/web-chat`
**Related:** `docs/CHAT-RELIABILITY-DESIGN.md`, vault `12-In-App-Chat/`, the Neev re-skin (PR #204).

## Goal
Bring the mobile in-app chat to the **web** for **owner, supervisor (site-engineer), and architect (designer)**, in the **Neev** design, by **mirroring the existing chat kit** against the already-built backend. **Zero backend changes.** This spec covers **Phase A — the core chat spine** (a real, usable chat). Phases B (composer power-tools), C (groups UI), D (supervisor command tools) are separate specs.

## Locked decisions (from brainstorming)
1. **Phased to full parity**, Phase A first.
2. **WebSocket** real-time (ticket-auth, sub/unsub frames) — not polling-only.
3. **Flip supervisor + architect to Neev** (so chat + their whole app are consistently Neev). Folded into Phase A.

## Architecture — mirror the mobile kit, adapt to the web stack
Web stack: React + Vite + TS + TanStack Query + Zustand + react-router + Tailwind semantic tokens. Reuse the **exact** REST + WebSocket contract the mobile apps use (so we inherit reliability: per-conversation `seq` ordering, `client_msg_id` idempotency, cursor-derived receipts). **No AsyncStorage outbox** — web uses in-memory optimistic send + retry (the reliability doc explicitly says offline isn't required for web).

Files:
- `src/api/chat.ts` — the chat API client (mirror mobile `chatApi`) + types.
- `src/features/chat/socket.ts` — shared WebSocket singleton.
- `src/features/chat/useChatThread.ts` — the thread data hook.
- `src/features/chat/*` — components (inbox, thread, bubbles, cards, composer).
- `src/features/chat/ticks.ts` — pure tick computation.
- Route + nav wiring in `src/App.tsx` + `src/ui/AppShell.tsx` (ROLE_TABS).
- `src/ui/themeSkin.ts` — `skinForRole` flip.

### API client (`src/api/chat.ts`)
Mirror mobile `chatApi`, using the web `request`/`client.ts` + `API_BASE`:
- `conversations(): Promise<ConversationSummary[]>` → `GET /api/v1/chat/conversations`
- `messages(addr, { afterSeq?, beforeSeq?, order?, limit? }): Promise<ChatMessage[]>` → `GET /api/v1/chat/messages`
- `send(body: ChatSendBody): Promise<ChatMessage>` → `POST /api/v1/chat/messages` (carries `client_msg_id`)
- `presignMedia(addr, kind): Promise<MediaPresign>` / `uploadMedia(addr, file, kind): Promise<MediaUpload>`
- `read(addr, lastSeq)` / `delivered(addr, lastSeq)` → 204
- `cursors(addr): Promise<CursorOut[]>`
- `wsTicket(): Promise<{ ticket: string }>`
- `brief(siteId)` (used in Phase D; type now)

`ChatAddress = { siteId: string } | { conversationId: string }` (exactly one).

Types (mirror backend `ChatMessageOut` / `ConversationOut`):
```ts
type ConversationKind = 'site' | 'homeowner' | 'group'
type SenderKind = 'user' | 'nivaan' | 'system'
type MessageSide = 'homeowner' | 'contractor'

interface ConversationSummary {
  id: string; kind: ConversationKind; site_id: string | null
  title: string | null; site_name: string | null
  last_message_at: string | null; unread_count: number; has_homeowner: boolean
}
interface ChatEvent {
  id: string; event_type: string; occurred_on: string | null
  summary: string; fields: Record<string, unknown>; confidence: number | null
  needs_clarification: boolean; contested: boolean
}
interface ChatMessage {
  id: string; conversation_id: string; sender_id: string | null
  sender_side: MessageSide; sender_name?: string | null; sender_role?: string | null
  sender_kind?: SenderKind; seq: number; body: string | null; reply_to_id: string | null
  media_type: string; attachment_url: string | null; created_at: string
  events: ChatEvent[]; raw_status?: 'queued'|'processing'|'done'|'failed'|null
  duplicate_of_id?: string | null
  meta?: { blocked?: { reason: string; event_id: string };
           nivaan?: { kind: string; tool: string; evidence_event_ids: string[] };
           proposal?: { tier: string; kind: string; capture_type: string;
                        fields: Record<string, unknown>; summary: string;
                        evidence_event_ids: string[]; committable: boolean } } | null
}
interface CursorOut { user_id: string; last_delivered_seq: number; last_read_seq: number }
```

### WebSocket (`src/features/chat/socket.ts`)
One shared browser `WebSocket` singleton (module-level), multiplexed across mounted views via a `conv → Set<handler>` registry (mirror mobile `ChatSocket`):
- Connect: `wsTicket()` → `new WebSocket(WS_URL + '?ticket=' + ticket)` where `WS_URL = API_BASE.replace(/^http/, 'ws') + '/api/v1/chat/ws'`.
- Outgoing frames: `sub {convs:[{id, after_seq}]}`, `unsub {conv}`, `delivered {conv, seq}`, `read {conv, seq}`, `ping` (every 30s).
- Incoming: `hello`, `sub_ok {conv, last_seq}`, `msg {conv, payload}`, `receipt {conv, user_id, kind, seq}`, `event_update {conv, message_id}`, `pong`, `error`.
- The socket is a **notifier**; `GET /messages?after_seq=` is the sync path (never replay history over WS).
- Reconnect: exponential backoff + jitter (1s→30s), resubscribe-all on reopen, guards for in-flight/closed-by-user.
- Public API: `getSharedSocket()`, `subscribe(addrKey, afterSeq, handler)`, `unsubscribe(addrKey, handler)`, `markDelivered(addrKey, seq)`, `markRead(addrKey, seq)`.

### Thread hook (`src/features/chat/useChatThread.ts`)
```ts
useChatThread(address: ChatAddress): {
  messages: ChatMessage[]; isLoading: boolean; error: unknown; sending: boolean
  reply: ChatMessage | null; setReply(m: ChatMessage | null): void
  send(body: string): void; sendMedia(m): void; sendProposal(captureType, fields): void
  loadOlder(): void; hasOlder: boolean
  deliveryState(seq: number): 'sent' | 'delivered' | 'read' | undefined
  retry(clientMsgId: string): void; pending: PendingMessage[]
}
```
- TanStack Query key `['chat','thread', addrKey]`. Initial load `messages(afterSeq: 0)`; `loadOlder()` fetches `before_seq=minSeq, order=desc` and prepends.
- Merge/dedupe by `seq` (newer copy wins — so extraction upgrades replace the row), keep seq-sorted.
- Subscribe via socket on mount; on `msg` frame → merge + `markDelivered`; on `receipt` → refetch cursors; on `event_update` → refetch the thread.
- **Optimistic send:** generate `client_msg_id` (crypto.randomUUID), push a pending bubble, `POST /messages`; on success reconcile by `client_msg_id`/`seq`; on failure mark pending `failed` (tap-to-retry). In-memory only (no durable outbox).
- Mark-read effect: on newest `seq` change → `read(addr, newestSeq)` + invalidate the conversations query (clears inbox unread).
- Ticks: `ticks.ts` pure `computeDeliveryState(seq, cursors, myUserId)` → excludes own cursor; `read` when all others' read-cursor ≥ seq, else `delivered` when all delivered ≥ seq, else `sent`.
- **Current user identity:** `myUserId` comes from the shared `useMe()` query (`/auth/me`). "Own message" = `message.sender_id === myUserId` (user-id identity, not side) — ticks render only on own messages.

### Components (`src/features/chat/`), Neev-styled (semantic tokens, light + neev-dark)
- **`ChatPage`** — the route. Desktop **two-pane**: `ChatInbox` (left, ~320px) + `ChatThread` (right). Mobile/narrow: inbox, push to thread. Rendered inside `AppShell` (so it gets the Neev shell).
- **`ChatInbox`** + **`ConversationRow`** — list from `conversations()` (15s poll + socket-invalidation). Row: avatar (homeowner glyph / group initials), title (`Homeowner · {site}` | `title ?? site_name`), sub-cue (`◈ Company-wide` / `◆ Client in this thread`, shape+color), recency (Mono), unread badge (sage/amber pill). Empty/loading/error states.
- **`ChatThread`** — scrollable message list (oldest→newest, autoscroll-to-end on new), `loadOlder` on scroll-to-top, **day separators**, header (conversation title + client-present banner).
- **`MessageBubble`** — own (sage `brand-subtle` tint) vs other (`surface-card`); sender name+role (`Micro` muted) on multi-sender non-own; timestamp (Mono); **ticks** (`✓`/`✓✓`/sage `✓✓`) on own; quoted-parent strip when `reply_to_id` resolves; inline image when `attachment_url` + image; doc/voice → attachment chip.
- **`CaptureCard`** — one per `event` (filtered `!= 'unknown'`): type pill (icon+word), key-field line (INR custom-grouped for money), summary, status pills (Disputed/Approved/Check-this), **Show proof ▾** reveal (image + source text + `{time} · {pct}% sure`). `raw_status` processing/failed affordance (failed → retry-extraction).
- **`NivaanProposalCard`** — `✦ Nivaan` eyebrow + draft summary + **Confirm** (when `committable` → `sendProposal(capture_type, fields)`) + **Dismiss**; post-action "✓ Added"/"Dismissed".
- **`SystemNotice`** — centered muted line (`meta.blocked.reason==='contested'` → disputed notice; `sender_kind==='system'` → body).
- **`ChatComposer`** — multiline text + Send (optimistic) + **media** (drag-drop / file picker → `presignMedia` → PUT R2 with canonical MIME → `sendMedia`) + reply banner (snippet + cancel). Slash/voice/smart-suggest are **Phase B** (composer has slots for them).

### Routing, nav & role-flip
- `src/App.tsx`: add `<Route path="/chat" element={<Guarded><ChatPage/></Guarded>} />` (lazy).
- `src/ui/AppShell.tsx` `ROLE_TABS`: add a **Chat** tab (`MessageIcon`, `to:'/chat'`) for `owner`, `supervisor`, `architect`.
- `src/ui/themeSkin.ts`: `skinForRole(role, enabled) → enabled && (role==='owner'||role==='supervisor'||role==='architect') ? 'neev' : 'blueprint'`. Update the `skinForRole` test. Spot-check supervisor/architect surfaces under neev.

## Phase A scope (explicit)
**IN:** inbox (site + homeowner + group rows render identically); thread (text, inline images, doc/voice attachment chips, sender name/role, timestamps, **day separators**, **read/delivered ticks**, reply-to/quote, **CaptureCard** + **Nivaan-proposal** + **system/contested/clarification** rendering, **load-older** via `before_seq`); composer (text + media + reply + optimistic + retry); **WebSocket** real-time + read/delivered cursors + mark-read.
**OUT (later):** slash commands, smart-suggest chip, voice recording (**B**); group create/manage sheets (**C** — group threads still *render* in A); supervisor command tools — brief pin, radar, recap, sentinel, dispute sheets, action-items (**D**); homeowner-channel "start" affordance; typing indicator (backend has none).

## Testing
Vitest: pure `ticks.ts` (all branches), thread merge/dedupe, the socket frame-router (mock WebSocket), the API client (mock fetch), and render tests for `ConversationRow`, `MessageBubble`, `CaptureCard`, `NivaanProposalCard`, `SystemNotice`, `ChatComposer`. Component tests use mock data (no live WS). Live WS is verified by running the backend during integration verification.

## Global constraints
- **ZERO `constructo/backend/` changes.**
- Keep the existing suite green (currently 453), tsc clean, build OK, bundle budget ≤ 250 KB gz (chat is lazy-loaded).
- All chat UI on **semantic tokens** (works neev light + neev-dark); neev AA contrast holds.
- File-content tests use Vite `?raw`; no tsconfig test-exclude.
- Branch `feat/web-chat`.

## Definition of Done (Phase A)
Owner/supervisor/architect (all on Neev) have a **Chat** tab → a two-pane inbox+thread where they can read every conversation they can access, send text + media, reply, see live incoming messages over WebSocket, see read/delivered ticks, and see AI CaptureCards / Nivaan proposals / system notices rendered correctly — in neev light and dark. Suite/types/build/budget green; zero backend changes.
