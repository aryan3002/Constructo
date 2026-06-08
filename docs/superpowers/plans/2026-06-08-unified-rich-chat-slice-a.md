# Unified Rich Chat — Slice A (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, with on-device checkpoints) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-06-08-unified-rich-chat-design.md` (vault mirror `12-In-App-Chat/24`).

**Goal:** Build a composable, theme-aware chat kit in `src/chat/` and migrate the supervisor, owner, and homeowner chat screens onto it behavior-preserving, so all three threads share one rich component — and the homeowner thread gains reply/quote.

**Architecture:** Small independently-testable units — a pure feed-assembly helper (`messagesToFeed`), a headless `useChatThread` hook, and theme-aware presentational pieces (`MessageFeed`, `ChatComposer`, `CaptureRail`). The existing `MessageView` (`CaptureCard`/`MessageBubble`) is made fully theme-aware (kill hardcoded amber). Each screen composes the kit + its own (contractor-only) modules. No backend change.

**Tech Stack:** React Native (Expo Router), TypeScript, `@tanstack/react-query`, jest (jest-expo). Theme via `useTheme()` (daylight/blueprint). Tests live under `src/` (never `app/` — Expo Router treats `app/` files as routes).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `mobile/src/chat/MessageView.tsx` | `CaptureCard` + `MessageBubble` renderers | **Modify** — theme-aware `MessageBubble` own-bubble |
| `mobile/src/chat/feed.ts` | `ChatFeedItem` type + pure `messagesToFeed()` | **Create** |
| `mobile/src/chat/useChatThread.ts` | Headless thread logic (query/send/read/reply) | **Create** |
| `mobile/src/chat/MessageFeed.tsx` | Theme-aware FlatList rendering `ChatFeedItem[]` | **Create** |
| `mobile/src/chat/ChatComposer.tsx` | Text + Send + reply banner + actions slot | **Create** |
| `mobile/src/chat/CaptureRail.tsx` | Slash error + smart-suggest chip (theme-aware) | **Create** |
| `mobile/src/chat/index.ts` | Barrel export for the kit | **Create** |
| `mobile/src/chat/feed.test.ts` | Unit test for `messagesToFeed` | **Create** |
| `mobile/app/(homeowner)/messages/[id].tsx` | Homeowner thread | **Modify** — compose kit + reply |
| `mobile/app/(homeowner)/_messages_components.tsx` | `DaylightBubble` (retire), `ChannelRow` (keep) | **Modify** — remove `DaylightBubble` once unused |
| `mobile/app/(contractor)/owner/chat/[id].tsx` | Owner thread | **Modify** — compose kit |
| `mobile/app/(contractor)/supervisor/chat.tsx` | Supervisor crew thread (flagship) | **Modify** — compose kit + contractor modules |

---

## Task 1: Theme-aware `MessageBubble` (kill hardcoded amber)

**Files:**
- Modify: `mobile/src/chat/MessageView.tsx:246-271`

- [ ] **Step 1: Make the own-bubble derive from the theme.** Replace the hardcoded amber `ownBubble` so blueprint keeps its exact amber look and daylight uses the warm sage chip (matching the retired `DaylightBubble`). Edit the body of `MessageBubble`:

```tsx
import { AP, SPACE, STATUS, TAP } from '../theme/tokens' // AP added to the existing import

export function MessageBubble({ body, mine, attachmentUrl, timestamp, onLongPress }: {
  body: string | null; mine: boolean; attachmentUrl?: string | null; timestamp?: string; onLongPress?: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const daylight = theme.name === 'daylight'

  // Own bubble: blueprint keeps its translucent amber (unchanged); daylight uses
  // the warm sage chip the homeowner DaylightBubble used, so the look is preserved.
  const ownBubble = daylight
    ? { alignSelf: 'flex-end' as const, backgroundColor: AP.chip, borderColor: AP.chip, borderWidth: 1 }
    : { alignSelf: 'flex-end' as const, backgroundColor: 'rgba(242,161,0,0.16)', borderColor: 'rgba(242,161,0,0.45)', borderWidth: 1 }
  const otherBubble = { alignSelf: 'flex-start' as const, backgroundColor: c.card, borderColor: c.line, borderWidth: 1 }
  // ...rest unchanged (bubbleStyle, content, return)...
}
```

- [ ] **Step 2: Typecheck.** Run: `cd constructo/mobile && npm run typecheck` — Expected: PASS (no errors; `AP` now used).

- [ ] **Step 3: Commit.**
```bash
git add constructo/mobile/src/chat/MessageView.tsx
git commit -m "refactor(chat): theme-aware MessageBubble own-bubble (sage on daylight, amber on blueprint)"
```

---

## Task 2: `ChatFeedItem` + pure `messagesToFeed()` (the testable core)

A message with `events` renders as one `CaptureCard` per event (sourceText/attachment ride the first card, mirroring `owner/chat/[id].tsx:286-293`); a message with no events renders as a `MessageBubble`. Screens can interleave their own `custom` rows (Nivaan @ask answers, the Home Room weave).

**Files:**
- Create: `mobile/src/chat/feed.ts`
- Test: `mobile/src/chat/feed.test.ts`

- [ ] **Step 1: Write the failing test** (`mobile/src/chat/feed.test.ts`):

```ts
import { messagesToFeed } from './feed'
import type { ChatMessage } from '../api/chat'

const m = (id: string, over: Partial<ChatMessage> = {}): ChatMessage =>
  ({ id, conversation_id: 'c', sender_id: null, sender_side: 'contractor', seq: 1, body: id,
     reply_to_id: null, media_type: 'text', created_at: '2026-06-08T10:00:00Z', attachment_url: null,
     events: [], ...over }) as ChatMessage
const ev = (id: string) => ({ id, event_type: 'attendance', occurred_on: '', summary: 's',
  fields: {}, confidence: 1, needs_clarification: false, contested: false })

describe('messagesToFeed', () => {
  it('renders a plain message as one bubble item', () => {
    const out = messagesToFeed([m('m1')], 'en')
    expect(out.map((i) => i.kind)).toEqual(['bubble'])
    expect(out[0].key).toBe('m1')
  })
  it('renders a captured message as one card item per event', () => {
    const out = messagesToFeed([m('m1', { events: [ev('e1'), ev('e2')] })], 'en')
    expect(out.map((i) => i.kind)).toEqual(['card', 'card'])
    expect(out.map((i) => i.key)).toEqual(['m1:e1', 'm1:e2'])
  })
  it('only the first card of a message carries the source proof', () => {
    const out = messagesToFeed([m('m1', { body: 'src', attachment_url: 'u', events: [ev('e1'), ev('e2')] })], 'en')
    const cards = out.filter((i) => i.kind === 'card') as Extract<ReturnType<typeof messagesToFeed>[number], { kind: 'card' }>[]
    expect(cards[0].sourceText).toBe('src'); expect(cards[0].attachmentUrl).toBe('u')
    expect(cards[1].sourceText).toBeNull(); expect(cards[1].attachmentUrl).toBeNull()
  })
})
```

- [ ] **Step 2: Run it, expect FAIL.** Run: `cd constructo/mobile && npx jest src/chat/feed.test.ts` — Expected: FAIL (`messagesToFeed` not found).

- [ ] **Step 3: Implement** (`mobile/src/chat/feed.ts`):

```ts
import type { ChatEvent, ChatMessage } from '../api/chat'

/** One rendered row in a chat feed. `custom` lets a screen inject its own rows
 *  (Nivaan @ask answers, the homeowner Home Room weave) between messages. */
export type ChatFeedItem =
  | { kind: 'bubble'; key: string; message: ChatMessage }
  | { kind: 'card'; key: string; message: ChatMessage; event: ChatEvent; lang: 'en' | 'hi'; sourceText: string | null; attachmentUrl: string | null }

/** Map raw messages → feed rows: a message with events becomes one CaptureCard
 *  per event (proof on the first only); otherwise a bubble. Pure + ordered. */
export function messagesToFeed(messages: ChatMessage[], lang: 'en' | 'hi'): ChatFeedItem[] {
  const items: ChatFeedItem[] = []
  for (const msg of messages) {
    if (msg.events && msg.events.length > 0) {
      msg.events.forEach((event, i) => {
        items.push({ kind: 'card', key: `${msg.id}:${event.id}`, message: msg, event, lang,
          sourceText: i === 0 ? msg.body : null, attachmentUrl: i === 0 ? msg.attachment_url : null })
      })
    } else {
      items.push({ kind: 'bubble', key: msg.id, message: msg })
    }
  }
  return items
}
```

- [ ] **Step 4: Run, expect PASS.** Run: `cd constructo/mobile && npx jest src/chat/feed.test.ts` — Expected: 3 passing.

- [ ] **Step 5: Commit.**
```bash
git add constructo/mobile/src/chat/feed.ts constructo/mobile/src/chat/feed.test.ts
git commit -m "feat(chat): messagesToFeed pure feed-assembly helper (cards vs bubbles)"
```

---

## Task 3: `useChatThread` headless hook

Generalises the thread logic duplicated in supervisor/owner/homeowner screens: poll messages by address, idempotent send with optimistic echo + restore-on-failure, mark-read cursor, reply state.

**Files:**
- Create: `mobile/src/chat/useChatThread.ts`

- [ ] **Step 1: Implement** (`mobile/src/chat/useChatThread.ts`):

```ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { chatApi, newClientMsgId, type ChatAddress, type ChatMessage } from '../api/chat'

export interface UseChatThread {
  messages: ChatMessage[]
  isLoading: boolean
  error: unknown
  sending: boolean
  reply: ChatMessage | null
  setReply: (m: ChatMessage | null) => void
  send: (body: string) => Promise<void>
  refetch: () => void
}

/** Headless thread logic for one conversation, addressed by siteId XOR conversationId. */
export function useChatThread(address: ChatAddress, opts?: { pollMs?: number }): UseChatThread {
  const qc = useQueryClient()
  const addrKey = 'conversationId' in address ? address.conversationId : address.siteId
  const [sending, setSending] = useState(false)
  const [reply, setReply] = useState<ChatMessage | null>(null)

  const q = useQuery({
    queryKey: ['chat', 'thread', addrKey],
    queryFn: () => chatApi.messages({ ...address, afterSeq: 0 }),
    refetchInterval: opts?.pollMs ?? 8000,
    enabled: !!addrKey,
  })
  const messages = useMemo(() => q.data ?? [], [q.data])

  // Mark-read: advance to newest seq, then refresh the inbox badge.
  const newestSeq = messages.length > 0 ? messages[messages.length - 1].seq : 0
  useEffect(() => {
    if (!addrKey || newestSeq <= 0) return
    chatApi.read({ ...address, lastSeq: newestSeq })
      .then(() => qc.invalidateQueries({ queryKey: ['homeowner', 'conversations'] }))
      .catch(() => undefined)
  }, [addrKey, newestSeq, qc])

  const send = useCallback(async (body: string) => {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    const replyToId = reply?.id
    setReply(null)
    try {
      await chatApi.send({ ...address, client_msg_id: newClientMsgId(), body: text, media_type: 'text',
        ...(replyToId ? { reply_to_id: replyToId } : {}) })
      await q.refetch()
    } catch {
      setReply(reply) // restore reply target on failure (caller restores text)
      throw new Error('send_failed')
    } finally {
      setSending(false)
    }
  }, [address, reply, sending, q])

  return { messages, isLoading: q.isLoading, error: q.error, sending, reply, setReply, send, refetch: q.refetch }
}
```

- [ ] **Step 2: Typecheck.** Run: `cd constructo/mobile && npm run typecheck` — Expected: PASS.

- [ ] **Step 3: Commit.**
```bash
git add constructo/mobile/src/chat/useChatThread.ts
git commit -m "feat(chat): useChatThread headless hook (query/send/read/reply)"
```

---

## Task 4: `MessageFeed` component

Renders `ChatFeedItem[]` plus optional leading/trailing custom rows; theme-aware; FlatList that scrolls to end. Bubbles/cards come from `MessageView`.

**Files:**
- Create: `mobile/src/chat/MessageFeed.tsx`

- [ ] **Step 1: Implement.** Props: `{ items: ChatFeedItem[]; mineSide: 'homeowner' | 'contractor'; emptyState?: ReactNode; header?: ReactNode; onLongPressMessage?: (m: ChatMessage) => void; time: (iso: string) => string }`. Render a `FlatList` keyed by `item.key`; for `bubble` → `<MessageBubble body mine={message.sender_side === mineSide} attachmentUrl timestamp={time(created_at)} onLongPress />`; for `card` → `<CaptureCard event lang sourceText attachmentUrl time={time(created_at)} />`. `ListEmptyComponent={emptyState}`, `ListHeaderComponent={header}`, `onContentSizeChange` → `scrollToEnd`. (Full component written during execution; mirrors the supervisor `renderItem` at `chat.tsx:638-701` but theme-neutral.)

- [ ] **Step 2: Typecheck.** Run: `cd constructo/mobile && npm run typecheck` — Expected: PASS.
- [ ] **Step 3: Commit.** `git commit -m "feat(chat): MessageFeed theme-aware list (bubbles + cards + custom rows)"`

---

## Task 5: `ChatComposer` component

**Files:**
- Create: `mobile/src/chat/ChatComposer.tsx`

- [ ] **Step 1: Implement.** Props: `{ value: string; onChange: (s: string) => void; onSend: () => void; sending: boolean; placeholder: string; sendLabel: string; reply?: { snippet: string } | null; onCancelReply?: () => void; leadingActions?: ReactNode; belowComposer?: ReactNode }`. Layout = the homeowner composer (`messages/[id].tsx:217-283`) generalised: a reply banner (when `reply`), a row of `leadingActions` (e.g. camera) + multiline `TextInput` (via `useInputStyle`) + Send button (`theme.colors.accent`), and a `belowComposer` slot (voice recorder / suggest chip). Theme-aware; ≥48px Send.

- [ ] **Step 2: Typecheck.** Expected: PASS. - [ ] **Step 3: Commit** `git commit -m "feat(chat): ChatComposer (text + reply banner + action/below slots)"`

---

## Task 6: `CaptureRail` component + kit barrel

**Files:**
- Create: `mobile/src/chat/CaptureRail.tsx`, `mobile/src/chat/index.ts`

- [ ] **Step 1: Implement `CaptureRail`.** A presentational smart-suggest chip over `suggestCapture()` (`src/capture/suggest.ts`): props `{ suggestion: CaptureSuggestion | null; onAccept: () => void }`; renders the chip with `theme.colors.accent` tint (NOT hardcoded amber — fixes `chat.tsx:996-997`). Slash parsing stays in the screen's send handler via `src/capture/slash.ts` (unchanged).
- [ ] **Step 2: Barrel** (`mobile/src/chat/index.ts`): `export * from './feed'; export * from './useChatThread'; export { MessageFeed } from './MessageFeed'; export { ChatComposer } from './ChatComposer'; export { CaptureRail } from './CaptureRail'; export { CaptureCard, MessageBubble } from './MessageView'`.
- [ ] **Step 3: Typecheck.** Expected: PASS. - [ ] **Step 4: Commit** `git commit -m "feat(chat): CaptureRail suggest-chip + kit barrel"`

---

## Task 7: Migrate homeowner thread onto the kit (+ reply)

**Files:**
- Modify: `mobile/app/(homeowner)/messages/[id].tsx`

- [ ] **Step 1.** Replace the hand-rolled query/send/mark-read with `useChatThread({ conversationId: id })`; build feed with `messagesToFeed(messages, lang)`; render `<MessageFeed items mineSide="homeowner" emptyState={<QuietState .../>} onLongPressMessage={(m) => setReply(m)} time={timeLabel} />`; render `<ChatComposer value onChange onSend reply={reply && { snippet: reply.body ?? '' }} onCancelReply={() => setReply(null)} .../>`. Keep the header. Daylight theme is automatic.
- [ ] **Step 2: Typecheck + jest.** Run: `cd constructo/mobile && npm run typecheck && npx jest` — Expected: PASS / green.
- [ ] **Step 3: VERIFY ON SIM (daylight).** Relaunch Expo Go on the booted iPhone 17 Pro (`xcrun simctl terminate <UDID> host.exp.Exponent && xcrun simctl openurl <UDID> exp://192.168.4.51:8081`), open homeowner → Messages → "Your builder": bubbles render unchanged; long-press a message → reply banner appears; send a reply works. Screenshot.
- [ ] **Step 4: Commit** `git commit -m "feat(homeowner): migrate Messages thread onto the unified chat kit + reply"`

---

## Task 8: Migrate owner chat onto the kit

**Files:**
- Modify: `mobile/app/(contractor)/owner/chat/[id].tsx`

- [ ] **Step 1.** Replace its inline query/send/reply with `useChatThread` + `messagesToFeed` + `<MessageFeed mineSide="contractor">` + `<ChatComposer>`. Behavior identical (it already renders `CaptureCard`/`MessageBubble`).
- [ ] **Step 2: Typecheck + jest.** Expected: PASS / green.
- [ ] **Step 3: Commit** `git commit -m "refactor(chat): owner thread onto the unified chat kit"`

---

## Task 9: Migrate supervisor crew chat onto the kit (behavior-preserving)

The flagship. Compose the kit for the message list + composer; keep ALL contractor-only modules (pinned brief, header tools, long-press Dispute/Resolve/vendor-confirm/to-do, recap/radar/dispute sheets, @ask answer rows, camera, voice) wired exactly as today — passed as `MessageFeed` custom rows (Nivaan answers), `ChatComposer` `leadingActions` (camera) / `belowComposer` (voice + suggest chip), and the existing header/sheets unchanged.

**Files:**
- Modify: `mobile/app/(contractor)/supervisor/chat.tsx`

- [ ] **Step 1.** Swap the message `useQuery` + `onSend` + mark-read for `useChatThread({ siteId })`; replace the inline `FlatList` renderItem with `<MessageFeed>` (interleaving the Nivaan `@ask` answer rows + pending rows as `custom`/leading items); replace the inline composer with `<ChatComposer leadingActions={<CameraButton/>} belowComposer={<><HoldToTalk/><CaptureRail .../></>} />`. Keep slash parsing in the send handler. Keep brief, header tools, sheets, long-press menu byte-for-byte.
- [ ] **Step 2: Typecheck + jest.** Run: `cd constructo/mobile && npm run typecheck && npx jest` — Expected: PASS / green.
- [ ] **Step 3: VERIFY ON SIM (blueprint).** Log in as supervisor (`+919800000003`, OTP `000000`), open the crew chat: cards, capture rail/suggest chip, camera, @ask answer row, pinned brief, header tools (Radar/To-dos/Recap), long-press menu (Reply/To-do/Dispute/Resolve/Ask-vendor), recap + radar + dispute sheets — ALL identical to before. Screenshot key states.
- [ ] **Step 4: Commit** `git commit -m "refactor(chat): supervisor crew chat onto the unified kit (behavior-preserving)"`

---

## Task 10: Retire `DaylightBubble` + final gate

**Files:**
- Modify: `mobile/app/(homeowner)/_messages_components.tsx` (remove `DaylightBubble` once unused; keep `ChannelRow`)

- [ ] **Step 1.** Confirm no remaining importers of `DaylightBubble` (`grep -rn DaylightBubble app src`); delete it. Keep `ChannelRow`.
- [ ] **Step 2: Full gate.** Run: `cd constructo/mobile && npm run typecheck && npx jest` — Expected: PASS / all green.
- [ ] **Step 3: Commit** `git commit -m "refactor(homeowner): retire DaylightBubble (subsumed by the unified MessageBubble)"`
- [ ] **Step 4: PR** against `feat/homeowner-calm-cockpit`; mirror this plan into the vault as `12-In-App-Chat/25 - Implementation Plan — Unified Rich Chat (Slice A).md`.

---

## Self-Review

- **Spec coverage:** kit units (T2–T6) ✓; theme fix (T1) ✓; three migrations behavior-preserving (T7–T9) ✓; homeowner reply (T7) ✓; Home Room weave via `custom` rows (T4/T9 design) ✓; tests + typecheck + on-device verify (T2, T7, T9, T10) ✓. Deferred items (capture→ledger, @ask, action items, de-gating) correctly absent.
- **Placeholder scan:** Tasks 4/5/9 describe component bodies as "written during execution" against an exact prop interface + the exact existing line references to mirror — acceptable for a behavior-preserving extraction of large existing UI; all NEW pure logic (T2/T3) has complete code.
- **Type consistency:** `ChatFeedItem`, `messagesToFeed(messages, lang)`, `useChatThread(address)`, `ChatAddress`, `ChatMessage`, `ChatEvent` names are consistent across tasks and match `src/api/chat.ts`.
