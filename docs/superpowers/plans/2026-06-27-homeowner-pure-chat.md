# Homeowner Pure-Chat Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homeowner mobile chat thread feel like a real WhatsApp-style group chat — pure human messages, normal scrolling, sender names/avatars, day separators, grouped bubbles — and move all AI-derived content out of the thread into a single pinned summary strip that deep-links to the screens that already host it.

**Architecture:** All new behavior is expressed as **pure, unit-tested functions** in `src/chat/feed.ts` and `app/(homeowner)/_home_room.util.ts` (the codebase avoids RN component mount tests — see Global Constraints). The homeowner-only `MessageFeed` consumes those functions to invert the list, kill the forced auto-scroll, and render day separators + grouping + avatars. The thread stops weaving Updates/Decisions; a new `ThreadSummaryStrip` renders their counts. The shared `MessageBubble` gets a real bubble radius (benefiting contractor too); a final slice ports the scroll fix to the contractor screens' own `FlatList`s.

**Tech Stack:** Expo React Native, TypeScript, React Query, Jest (`jest-expo` preset), `@tanstack/react-query`. Theme = "Calm Cockpit" Daylight tokens (`src/theme/tokens.ts`).

## Global Constraints

- **Working dir for all commands:** `constructo/mobile`.
- **Verification gates (this repo's reality):**
  - Pure-logic changes → `npm test` (jest). Component changes → `npm run typecheck` (`tsc --noEmit`) and a preview smoke; **do not** write RN component mount tests (`react-test-renderer` crashes on `Pressable`/`@expo/vector-icons` — see `src/ui/wave0-kit.test.tsx` header).
  - Run `npm run typecheck` after EVERY task (pure or component) — it is the cross-cutting safety net.
- **Language:** English-first copy; Hindi (`hi`) strings provided alongside `en` for any user-visible text (the homeowner screen carries `lang: 'en' | 'hi'`).
- **Homeowner styling:** use Daylight tokens only — `theme.colors`, `AP`, `SPACE`, `theme.radii`. No hardcoded hex in components (existing pattern).
- **Scope:** No backend/API changes. All deep-link destinations already exist (`/(homeowner)/updates`, `/(homeowner)/decisions/[id]` or the Decisions list, `/(homeowner)/photos`).
- **Back-compat:** `messagesToFeed(messages, lang)` MUST keep working unchanged for the contractor screens; new behavior is opt-in via a third options arg.
- **Branch:** `feat/homeowner-pure-chat` (already created off `origin/main`, spec committed).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/chat/feed.ts` | Pure feed assembly | Add `annotateFeed()` (day separators + grouping flags) and a `capturesAsBubbles` option to `messagesToFeed()`. |
| `src/chat/feed.test.ts` | Pure tests | Extend with annotate + captures-as-bubbles cases. |
| `app/(homeowner)/_home_room.util.ts` | Homeowner thread helpers | Add `summarizeWaiting()`; retire the weave from the thread. |
| `app/(homeowner)/_home_room.util.test.ts` | Pure tests | **New** — `summarizeWaiting` cases. |
| `src/theme/tokens.ts` | Theme tokens | Add `radii.bubble` to `ThemeRadii` + both themes. |
| `src/chat/MessageFeed.tsx` | Homeowner list | Invert; remove forced scroll; `atBottom` gating; render day rows + grouping + avatars; `onEndReached` seam. |
| `src/chat/MessageView.tsx` | Shared bubble | `MessageBubble` uses `radii.bubble` with an asymmetric tail. |
| `app/(homeowner)/_thread_summary_strip.tsx` | Pinned strip | **New** component. |
| `app/(homeowner)/messages/[id].tsx` | Homeowner thread screen | Un-weave; build feed via `messagesToFeed(..., {capturesAsBubbles:true})`; render `ThreadSummaryStrip`; keep `@ask`; pending at bottom. |
| `app/(homeowner)/_messages_components.tsx` | Homeowner card kit | Remove stale `--radius-bubble`/`DaylightBubble` comment; `HomeRoom*Card` no longer used by the thread. |
| `app/(contractor)/supervisor/chat.tsx` | Contractor list | Apply the scroll fix (parity slice). |
| `app/(contractor)/owner/chat/[id].tsx` | Contractor list | Apply the scroll fix (parity slice). |

---

## Task 1: `annotateFeed()` — day separators + grouping (pure)

**Files:**
- Modify: `src/chat/feed.ts`
- Test: `src/chat/feed.test.ts`

**Interfaces:**
- Produces:
  - `interface AnnotateRow { key: string; kind: 'msg' | 'other'; createdAt?: string | null; senderId?: string | null; senderKind?: string | null; mine?: boolean }`
  - `interface FeedAnnotations { dayBefore: Map<string,string>; showSender: Set<string>; runEnd: Set<string> }`
  - `function annotateFeed(rows: AnnotateRow[], dayLabel: (iso: string) => string): FeedAnnotations`
  - `function sameLocalDay(a: string, b: string): boolean` (exported helper, used by the default day-label too)

- [ ] **Step 1: Write the failing tests**

Add to `src/chat/feed.test.ts`:

```ts
import { annotateFeed, type AnnotateRow } from './feed'

const r = (key: string, over: Partial<AnnotateRow> = {}): AnnotateRow => ({
  key,
  kind: 'msg',
  createdAt: '2026-06-08T10:00:00Z',
  senderId: 'u1',
  senderKind: 'user',
  mine: false,
  ...over,
})
const label = (iso: string) => iso.slice(0, 10) // deterministic day label for tests

describe('annotateFeed', () => {
  it('inserts a day label before the first row of each calendar day', () => {
    const a = annotateFeed(
      [r('a', { createdAt: '2026-06-08T10:00:00Z' }), r('b', { createdAt: '2026-06-09T09:00:00Z' })],
      label,
    )
    expect(a.dayBefore.get('a')).toBe('2026-06-08')
    expect(a.dayBefore.get('b')).toBe('2026-06-09')
  })

  it('does not repeat a day label within the same day', () => {
    const a = annotateFeed(
      [r('a', { createdAt: '2026-06-08T10:00:00Z' }), r('b', { createdAt: '2026-06-08T18:00:00Z' })],
      label,
    )
    expect(a.dayBefore.has('a')).toBe(true)
    expect(a.dayBefore.has('b')).toBe(false)
  })

  it('shows the sender only on the first non-mine message of a same-sender run', () => {
    const a = annotateFeed(
      [r('a', { senderId: 'u1' }), r('b', { senderId: 'u1' }), r('c', { senderId: 'u2' })],
      label,
    )
    expect(a.showSender.has('a')).toBe(true)
    expect(a.showSender.has('b')).toBe(false)
    expect(a.showSender.has('c')).toBe(true)
  })

  it('never shows the sender on my own messages', () => {
    const a = annotateFeed([r('a', { mine: true })], label)
    expect(a.showSender.has('a')).toBe(false)
  })

  it('never shows the sender on system/nivaan rows', () => {
    const a = annotateFeed([r('a', { senderKind: 'system' }), r('b', { senderKind: 'nivaan' })], label)
    expect(a.showSender.has('a')).toBe(false)
    expect(a.showSender.has('b')).toBe(false)
  })

  it('marks runEnd on the last message of a run (sender change, day change, other-row, end)', () => {
    const a = annotateFeed(
      [
        r('a', { senderId: 'u1' }),
        r('b', { senderId: 'u1' }), // last of u1 run -> runEnd
        r('x', { kind: 'other' }), // breaks runs
        r('c', { senderId: 'u1' }), // new run after the other-row -> its own runEnd at end
      ],
      label,
    )
    expect(a.runEnd.has('a')).toBe(false)
    expect(a.runEnd.has('b')).toBe(true)
    expect(a.runEnd.has('c')).toBe(true)
  })

  it('an other-row breaks a run so the next same-sender message restarts attribution', () => {
    const a = annotateFeed(
      [r('a', { senderId: 'u1' }), r('x', { kind: 'other' }), r('b', { senderId: 'u1' })],
      label,
    )
    expect(a.showSender.has('b')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- feed.test.ts`
Expected: FAIL — `annotateFeed is not a function`.

- [ ] **Step 3: Implement `annotateFeed`**

Append to `src/chat/feed.ts`:

```ts
/** Minimal row shape annotateFeed needs. 'msg' = a bubble/card derived from a
 *  ChatMessage; 'other' = a custom/system row (breaks runs, no day boundary). */
export interface AnnotateRow {
  key: string
  kind: 'msg' | 'other'
  createdAt?: string | null
  senderId?: string | null
  senderKind?: string | null
  /** Precomputed `sender_side === mineSide` so this stays pure. */
  mine?: boolean
}

/** Grouping/day annotations, keyed by row key. */
export interface FeedAnnotations {
  /** rowKey -> day label to render as a separator BEFORE that row. */
  dayBefore: Map<string, string>
  /** message keys that should show the sender name/avatar (first of a run, not mine, human). */
  showSender: Set<string>
  /** message keys that are the LAST of their run (render the clustered timestamp). */
  runEnd: Set<string>
}

/** Local calendar-day key for an ISO timestamp ('' when unparseable). */
function localDayKey(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** True when two ISO timestamps fall on the same local calendar day. */
export function sameLocalDay(a: string, b: string): boolean {
  const ka = localDayKey(a)
  return ka !== '' && ka === localDayKey(b)
}

/** A stable run identity for a message row. */
function senderKeyOf(row: AnnotateRow): string {
  return row.senderId ?? `kind:${row.senderKind ?? 'user'}`
}

/**
 * Derive day separators + same-sender grouping over a chronological row list.
 * Pure: caller precomputes `mine` and supplies `dayLabel(iso)` (so "Today/
 * Yesterday" stays out of this function and it remains deterministic).
 */
export function annotateFeed(
  rows: AnnotateRow[],
  dayLabel: (iso: string) => string,
): FeedAnnotations {
  const dayBefore = new Map<string, string>()
  const showSender = new Set<string>()
  const runEnd = new Set<string>()

  let prevDayKey = ''
  let runSenderKey: string | null = null
  let lastMsgKey: string | null = null

  const closeRun = () => {
    if (lastMsgKey !== null) runEnd.add(lastMsgKey)
    lastMsgKey = null
    runSenderKey = null
  }

  for (const row of rows) {
    if (row.kind === 'other') {
      closeRun()
      continue
    }
    const dayKey = localDayKey(row.createdAt)
    const dayChanged = dayKey !== '' && dayKey !== prevDayKey
    if (dayChanged) {
      closeRun()
      if (row.createdAt) dayBefore.set(row.key, dayLabel(row.createdAt))
      prevDayKey = dayKey
    }
    const sk = senderKeyOf(row)
    if (sk !== runSenderKey) {
      // New run: close the previous one and (maybe) attribute this row.
      if (lastMsgKey !== null) runEnd.add(lastMsgKey)
      runSenderKey = sk
      const human = row.senderKind !== 'system' && row.senderKind !== 'nivaan'
      if (!row.mine && human) showSender.add(row.key)
    }
    lastMsgKey = row.key
  }
  closeRun()
  return { dayBefore, showSender, runEnd }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- feed.test.ts`
Expected: PASS (all annotate cases + the existing `messagesToFeed` cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/chat/feed.ts src/chat/feed.test.ts
git commit -m "feat(chat): annotateFeed — pure day-separator + same-sender grouping

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `messagesToFeed` — capturesAsBubbles mode (pure)

**Files:**
- Modify: `src/chat/feed.ts`
- Test: `src/chat/feed.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `messagesToFeed(messages: ChatMessage[], lang: 'en' | 'hi', opts?: { capturesAsBubbles?: boolean }): ChatFeedItem[]` — when `capturesAsBubbles` is true, a message that minted events renders as a single **bubble** (its photo + text), not one card per event.

- [ ] **Step 1: Write the failing tests**

Add to `src/chat/feed.test.ts` (inside the existing `describe('messagesToFeed')` or a new block):

```ts
describe('messagesToFeed capturesAsBubbles', () => {
  it('renders a captured message as a single bubble when capturesAsBubbles is set', () => {
    const out = messagesToFeed(
      [m('m1', { body: 'delivery photo', attachment_url: 'u', events: [ev('e1'), ev('e2')] })],
      'en',
      { capturesAsBubbles: true },
    )
    expect(out.map((i) => i.kind)).toEqual(['bubble'])
    expect(out[0].key).toBe('m1')
  })

  it('still renders cards by default (contractor behavior unchanged)', () => {
    const out = messagesToFeed([m('m1', { events: [ev('e1')] })], 'en')
    expect(out.map((i) => i.kind)).toEqual(['card'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- feed.test.ts`
Expected: FAIL — the captures-as-bubbles case returns `['card','card']`.

- [ ] **Step 3: Implement the option**

In `src/chat/feed.ts`, change the signature and the events branch:

```ts
export function messagesToFeed(
  messages: ChatMessage[],
  lang: 'en' | 'hi',
  opts?: { capturesAsBubbles?: boolean },
): ChatFeedItem[] {
  const items: ChatFeedItem[] = []
  for (const message of messages) {
    if (!opts?.capturesAsBubbles && message.events && message.events.length > 0) {
      message.events.forEach((event, i) => {
        items.push({
          kind: 'card',
          key: `${message.id}:${event.id}`,
          message,
          event,
          lang,
          sourceText: i === 0 ? message.body : null,
          attachmentUrl: i === 0 ? message.attachment_url : null,
        })
      })
    } else {
      items.push({ kind: 'bubble', key: message.id, message })
    }
  }
  return items
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- feed.test.ts`
Expected: PASS (new cases + all originals).

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add src/chat/feed.ts src/chat/feed.test.ts
git commit -m "feat(chat): messagesToFeed capturesAsBubbles option (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `summarizeWaiting()` — strip counts (pure)

**Files:**
- Modify: `app/(homeowner)/_home_room.util.ts`
- Test (new): `app/(homeowner)/_home_room.util.test.ts`

**Interfaces:**
- Consumes: `Update`, `HomeownerDecision` from `src/api/types`.
- Produces: `interface WaitingSummary { updateCount: number; needsYouCount: number }` and `function summarizeWaiting(updates: Update[], decisions: HomeownerDecision[]): WaitingSummary`.

- [ ] **Step 1: Write the failing test**

Create `app/(homeowner)/_home_room.util.test.ts`:

```ts
import { summarizeWaiting } from './_home_room.util'
import type { Update } from '../../src/api/types'
import type { HomeownerDecision } from '../../src/api/types'

const upd = (id: string, type: string): Update =>
  ({ id, type, published_at: '2026-06-08T10:00:00Z' }) as unknown as Update
const dec = (id: string, state: string): HomeownerDecision =>
  ({ id, state, created_at: '2026-06-08T10:00:00Z' }) as unknown as HomeownerDecision

describe('summarizeWaiting', () => {
  it('counts pending decisions as "needs you" and ignores answered ones', () => {
    const s = summarizeWaiting([], [dec('d1', 'pending'), dec('d2', 'approved')])
    expect(s.needsYouCount).toBe(1)
  })

  it('counts published updates, excluding decision_needed (deduped by the decision)', () => {
    const s = summarizeWaiting([upd('u1', 'progress'), upd('u2', 'decision_needed')], [])
    expect(s.updateCount).toBe(1)
    expect(s.needsYouCount).toBe(0)
  })

  it('returns zeros for empty inputs', () => {
    const s = summarizeWaiting([], [])
    expect(s).toEqual({ updateCount: 0, needsYouCount: 0 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- _home_room.util.test.ts`
Expected: FAIL — `summarizeWaiting is not a function`.

- [ ] **Step 3: Implement `summarizeWaiting`**

Add to `app/(homeowner)/_home_room.util.ts` (top-level export, near `weaveHomeRoom`):

```ts
/** Counts that drive the pinned ThreadSummaryStrip. `needsYouCount` = pending
 *  decisions (the actionable approvals); `updateCount` = published updates,
 *  excluding `decision_needed` (those are represented by their pending Decision,
 *  mirroring the old weave's dedupe). */
export interface WaitingSummary {
  updateCount: number
  needsYouCount: number
}

export function summarizeWaiting(
  updates: Update[],
  decisions: HomeownerDecision[],
): WaitingSummary {
  const needsYouCount = decisions.filter((d) => d.state === 'pending').length
  const updateCount = updates.filter((u) => u.type !== 'decision_needed').length
  return { updateCount, needsYouCount }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- _home_room.util.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add "app/(homeowner)/_home_room.util.ts" "app/(homeowner)/_home_room.util.test.ts"
git commit -m "feat(homeowner): summarizeWaiting — counts for the pinned chat strip (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `radii.bubble` token

**Files:**
- Modify: `src/theme/tokens.ts`
- Test: `src/ui/wave0-kit.test.tsx` (token-integration block)

**Interfaces:**
- Produces: `theme.radii.bubble: number` on both themes.

- [ ] **Step 1: Write the failing test**

Add to the `describe('theme tokens …')` block in `src/ui/wave0-kit.test.tsx`:

```ts
it('both themes expose a tight bubble radius for chat bubbles', () => {
  for (const name of ['neev', 'daylight'] as const) {
    expect(typeof THEMES[name].radii.bubble).toBe('number')
    // a chat bubble is tighter than a card
    expect(THEMES[name].radii.bubble).toBeLessThan(THEMES[name].radii.card)
  }
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- wave0-kit.test.tsx`
Expected: FAIL — `radii.bubble` is `undefined`.

- [ ] **Step 3: Add the token**

In `src/theme/tokens.ts`:

1. Add to `interface ThemeRadii`:

```ts
  /** chat message bubble — tighter than a card. */
  bubble: number
```

2. Add `bubble` to both themes' `radii`:

```ts
// neev:
radii: { chip: 10, card: 14, hero: 18, sheet: 18, pill: 9999, control: 10, bubble: 12 },
// daylight:
radii: { chip: 11, card: 16, hero: 20, sheet: 18, pill: 9999, control: 11, bubble: 14 },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- wave0-kit.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add src/theme/tokens.ts src/ui/wave0-kit.test.tsx
git commit -m "feat(theme): add radii.bubble for tight chat bubbles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `MessageBubble` — real bubble radius + tail (shared)

**Files:**
- Modify: `src/chat/MessageView.tsx:407-416`

**Interfaces:**
- Consumes: `theme.radii.bubble` (Task 4). No prop changes.

- [ ] **Step 1: Replace the bubble radius**

In `MessageBubble`, replace the `bubbleStyle` radius. Find:

```ts
  const bubbleStyle = [
    {
      maxWidth: '82%' as const,
      borderRadius: theme.radii.card,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      gap: 2,
    },
    mine ? ownBubble : otherBubble,
  ]
```

Replace with (asymmetric tail on the sender's side):

```ts
  const TAIL = 4
  const r = theme.radii.bubble
  const tail = mine
    ? { borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: r, borderBottomRightRadius: TAIL }
    : { borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: TAIL, borderBottomRightRadius: r }

  const bubbleStyle = [
    {
      maxWidth: '82%' as const,
      paddingVertical: SPACE.sm,
      paddingHorizontal: SPACE.md,
      gap: 2,
    },
    tail,
    mine ? ownBubble : otherBubble,
  ]
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full pure-test suite (no regressions)**

Run: `npm test`
Expected: PASS (no logic changed; this guards the shared file).

- [ ] **Step 4: Commit**

```bash
git add src/chat/MessageView.tsx
git commit -m "feat(chat): MessageBubble uses radii.bubble with an asymmetric tail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Verification of the visual (homeowner + contractor bubbles) happens in the
> preview smoke at the end of Task 8 and Task 10.

---

## Task 6: `MessageFeed` — invert, scroll fix, day separators, grouping, avatars

**Files:**
- Modify: `src/chat/MessageFeed.tsx`

**Interfaces:**
- Consumes: `annotateFeed`, `AnnotateRow`, `FeedAnnotations`, `sameLocalDay` (Task 1); `Avatar` from `../ui`.
- Produces: `MessageFeed` props gain `dayLabel?: (iso: string) => string`, `inverted?: boolean` (default `true`), `onEndReached?: () => void`. The screen may call an exposed scroll via its own send flow — but to keep this self-contained, `MessageFeed` auto-scrolls to bottom only on its own newest-row change when already at bottom.

- [ ] **Step 1: Rewrite `MessageFeed.tsx`**

Replace the whole file with:

```tsx
/**
 * MessageFeed — the homeowner thread's message list (the only consumer of this
 * component). An INVERTED FlatList: newest row at the visual bottom, sticky by
 * construction, with cheap scroll-up. Renders bubbles, capture cards, screen-
 * supplied custom rows, plus derived day separators and same-sender grouping
 * (names/avatars + clustered timestamps) from the pure `annotateFeed` helper.
 */
import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import {
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from 'react-native'

import { SPACE } from '../theme/tokens'
import { Avatar, Small } from '../ui'
import { useTheme } from '../theme/ThemeProvider'
import type { ChatMessage } from '../api/chat'
import { CaptureCard, MessageBubble } from './MessageView'
import { annotateFeed, type AnnotateRow, type ChatFeedItem } from './feed'
import type { DeliveryState } from './threadState'

/** A row in the rendered feed — a derived bubble/card, or a screen-injected node. */
export type FeedRow = ChatFeedItem | { kind: 'custom'; key: string; node: ReactNode }

/** A synthetic day separator inserted between calendar days. */
type RenderRow = FeedRow | { kind: 'day'; key: string; label: string }

const AVATAR = 28

/** Default day label (English): Today / Yesterday / "8 Jun". The homeowner
 *  screen overrides this with a localized labeler. */
function defaultDayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (key(d) === key(now)) return 'Today'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (key(d) === key(y)) return 'Yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function MessageFeed({
  items,
  mineSide,
  time,
  onLongPressMessage,
  deliveryStateFor,
  emptyState,
  header,
  contentPaddingBottom = SPACE.lg,
  dayLabel = defaultDayLabel,
  inverted = true,
  onEndReached,
}: {
  items: FeedRow[]
  mineSide: 'homeowner' | 'contractor'
  time: (iso: string) => string
  onLongPressMessage?: (m: ChatMessage) => void
  deliveryStateFor?: (msg: ChatMessage) => DeliveryState | undefined
  emptyState?: ReactNode
  header?: ReactNode
  contentPaddingBottom?: number
  dayLabel?: (iso: string) => string
  inverted?: boolean
  onEndReached?: () => void
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const listRef = useRef<FlatList<RenderRow>>(null)
  const atBottom = useRef(true)

  // Track whether the user is at the bottom (inverted: offset.y near 0).
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      atBottom.current = e.nativeEvent.contentOffset.y <= 24
    },
    [],
  )

  // Derive day separators + grouping from the chronological items.
  const annotations = useMemo(() => {
    const rows: AnnotateRow[] = items.map((it) => {
      if (it.kind === 'bubble' || it.kind === 'card') {
        const m = it.message
        return {
          key: it.key,
          kind: 'msg' as const,
          createdAt: m.created_at,
          senderId: m.sender_id,
          senderKind: m.sender_kind ?? 'user',
          mine: m.sender_side === mineSide,
        }
      }
      return { key: it.key, kind: 'other' as const }
    })
    return annotateFeed(rows, dayLabel)
  }, [items, mineSide, dayLabel])

  // Build the chronological render list, inserting a day separator before the
  // first row of each day, then reverse for the inverted list (so the day label
  // sits visually ABOVE that day's first message).
  const data = useMemo(() => {
    const out: RenderRow[] = []
    for (const it of items) {
      const label = annotations.dayBefore.get(it.key)
      if (label) out.push({ kind: 'day', key: `day:${it.key}`, label })
      out.push(it)
    }
    return inverted ? out.reverse() : out
  }, [items, annotations, inverted])

  const senderNameFor = (m: ChatMessage) => m.sender_name ?? null

  const renderItem = useCallback(
    ({ item }: { item: RenderRow }) => {
      if (item.kind === 'day') {
        return (
          <View style={{ alignItems: 'center', paddingVertical: SPACE.sm }}>
            <Small
              muted
              style={{
                backgroundColor: theme.colors.paper,
                color: c.textMute,
                paddingHorizontal: SPACE.md,
                paddingVertical: 4,
                borderRadius: theme.radii.pill,
                overflow: 'hidden',
                fontSize: 12,
              }}
            >
              {item.label}
            </Small>
          </View>
        )
      }
      if (item.kind === 'custom') return <>{item.node}</>
      if (item.kind === 'card') {
        return (
          <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.xs }}>
            <CaptureCard
              event={item.event}
              lang={item.lang}
              sourceText={item.sourceText}
              attachmentUrl={item.attachmentUrl}
              time={time(item.message.created_at)}
            />
          </View>
        )
      }
      // bubble
      const m = item.message
      const mine = m.sender_side === mineSide
      const showSender = annotations.showSender.has(item.key)
      const isRunEnd = annotations.runEnd.has(item.key)
      const bubble = (
        <MessageBubble
          body={m.body}
          mine={mine}
          attachmentUrl={m.attachment_url}
          timestamp={isRunEnd ? time(m.created_at) : undefined}
          deliveryState={deliveryStateFor?.(m)}
          onLongPress={onLongPressMessage ? () => onLongPressMessage(m) : undefined}
          showSenderName={showSender}
          senderName={senderNameFor(m)}
        />
      )
      // tighter spacing inside a run; full gap when the run ends
      const marginBottom = isRunEnd ? SPACE.md : 2
      if (mine) {
        return <View style={{ paddingHorizontal: SPACE.gutter, marginBottom }}>{bubble}</View>
      }
      // received: leading avatar on first-of-run, else an aligning spacer
      return (
        <View
          style={{
            paddingHorizontal: SPACE.gutter,
            marginBottom,
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: SPACE.xs,
          }}
        >
          {showSender ? (
            <Avatar name={senderNameFor(m)} size={AVATAR} />
          ) : (
            <View style={{ width: AVATAR }} />
          )}
          <View style={{ flex: 1 }}>{bubble}</View>
        </View>
      )
    },
    [mineSide, time, onLongPressMessage, deliveryStateFor, annotations, theme, c.textMute],
  )

  return (
    <FlatList
      ref={listRef}
      data={data}
      inverted={inverted}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      contentContainerStyle={{
        paddingTop: SPACE.lg,
        paddingBottom: contentPaddingBottom,
        flexGrow: 1,
      }}
      ListHeaderComponent={header ? <>{header}</> : null}
      ListEmptyComponent={emptyState ? <>{emptyState}</> : null}
    />
  )
}
```

> Why this fixes scrolling: an inverted list keeps the newest row pinned to the
> visual bottom with NO imperative `scrollToEnd`, so idle refetches / socket
> frames / image loads / card expands no longer yank the viewport. The deleted
> `onContentSizeChange → scrollToEnd` was the root cause.

> Note on `ListHeaderComponent` with `inverted`: it renders at the visual bottom.
> The homeowner screen does NOT pass `header`, so this is a non-issue here; if a
> future caller needs a pinned top element, render it OUTSIDE `MessageFeed`
> (as the homeowner screen does for `ThreadSummaryStrip`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (Confirm `Small` and `Avatar` are exported from `../ui`; both are.)

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS (pure tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/chat/MessageFeed.tsx
git commit -m "feat(chat): invert MessageFeed + kill forced scroll; day separators, grouping, avatars

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `ThreadSummaryStrip` component

**Files:**
- Create: `app/(homeowner)/_thread_summary_strip.tsx`

**Interfaces:**
- Consumes: `WaitingSummary` shape (counts) from Task 3 — passed as props.
- Produces: `ThreadSummaryStrip({ updateCount, needsYouCount, onOpenUpdates, onOpenDecisions, lang })` — renders `null` when both counts are 0.

- [ ] **Step 1: Create the component**

```tsx
/**
 * ThreadSummaryStrip — the single pinned bar above the homeowner message thread.
 * The thread itself is pure human chat; everything AI-derived (progress updates,
 * approvals) lives on its own screen and is summarized here, one tap away.
 * Renders nothing when there is nothing waiting (the thread stays 100% chat).
 */
import { Pressable, View } from 'react-native'
import { Feather } from '@expo/vector-icons'

import { useTheme } from '../../src/theme/ThemeProvider'
import { AP, SPACE, TAP } from '../../src/theme/tokens'
import { Small } from '../../src/ui'

const STR = {
  en: { updates: (n: number) => `${n} update${n === 1 ? '' : 's'}`, needsYou: (n: number) => `${n} needs you` },
  hi: { updates: (n: number) => `${n} अपडेट`, needsYou: (n: number) => `${n} पर ध्यान दें` },
} as const

export function ThreadSummaryStrip({
  updateCount,
  needsYouCount,
  onOpenUpdates,
  onOpenDecisions,
  lang,
}: {
  updateCount: number
  needsYouCount: number
  onOpenUpdates: () => void
  onOpenDecisions: () => void
  lang: 'en' | 'hi'
}) {
  const { theme } = useTheme()
  const c = theme.colors
  const t = STR[lang] ?? STR.en
  if (updateCount === 0 && needsYouCount === 0) return null

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        paddingHorizontal: SPACE.gutter,
        paddingVertical: SPACE.sm,
        backgroundColor: c.paper,
        borderBottomWidth: 1,
        borderBottomColor: c.line,
      }}
    >
      <Feather name="layers" size={16} color={c.textMute} />

      {updateCount > 0 ? (
        <Pressable
          onPress={onOpenUpdates}
          accessibilityRole="button"
          hitSlop={8}
          style={{ minHeight: TAP, justifyContent: 'center' }}
        >
          <Small style={{ color: c.textMute }}>{t.updates(updateCount)}</Small>
        </Pressable>
      ) : null}

      {needsYouCount > 0 ? (
        <Pressable
          onPress={onOpenDecisions}
          accessibilityRole="button"
          hitSlop={8}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            minHeight: TAP,
            paddingHorizontal: SPACE.sm,
            borderRadius: theme.radii.pill,
            backgroundColor: AP.surfaceContainer,
          }}
        >
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.warn }} />
          <Small style={{ color: c.warn, fontWeight: '600' }}>{t.needsYou(needsYouCount)}</Small>
        </Pressable>
      ) : null}

      <View style={{ flex: 1 }} />
      <Feather name="chevron-right" size={16} color={c.textMute} />
    </View>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(homeowner)/_thread_summary_strip.tsx"
git commit -m "feat(homeowner): ThreadSummaryStrip — pinned chat bar for AI-derived counts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Un-weave the homeowner thread + render the strip

**Files:**
- Modify: `app/(homeowner)/messages/[id].tsx`

**Interfaces:**
- Consumes: `messagesToFeed(..., {capturesAsBubbles:true})` (Task 2), `summarizeWaiting` (Task 3), `ThreadSummaryStrip` (Task 7), the inverted `MessageFeed` (Task 6).

- [ ] **Step 1: Swap the imports**

In `app/(homeowner)/messages/[id].tsx`:

- Add: `import { messagesToFeed } from '../../../src/chat'` (already re-exported from the barrel) and `import { ThreadSummaryStrip } from '../_thread_summary_strip'` and `import { summarizeWaiting } from '../_home_room.util'`.
- Keep: `weaveHomeRoom` import is removed; keep `HOME_ROOM_STR`, `DecisionAction` (still used by the respond handler), but the `HomeRoomDecisionCard` / `HomeRoomUpdateCard` imports are removed.

- [ ] **Step 2: Replace the `items` memo (remove the weave)**

Replace the current `items` useMemo (the `weaveHomeRoom(...)` block) with a messages-only feed that keeps system-notice routing, `@ask` rows, and pending bubbles:

```tsx
  const items: FeedRow[] = useMemo(() => {
    const base: FeedRow[] = messagesToFeed(thread.messages, (lang as 'en' | 'hi') ?? 'en', {
      capturesAsBubbles: true,
    }).map((row) => {
      // System notices render centered, not as bubbles.
      const noticeText = systemNotice(row.message)
      if (noticeText !== null)
        return { kind: 'custom', key: row.key, node: <SystemNotice text={noticeText} /> }
      return row
    })

    const askRows: FeedRow[] = asks.map((a) => ({
      kind: 'custom',
      key: `ask:${a.id}`,
      node: (
        <HomeownerAskRow
          question={a.question}
          status={a.status}
          answer={a.answer}
          onAskBuilder={a.status === 'abstain' ? () => askBuilder(a) : undefined}
        />
      ),
    }))

    const pendingRows: FeedRow[] = thread.pending.map((p) => ({
      kind: 'custom',
      key: `pending:${p.clientMsgId}`,
      node:
        p.state === 'failed_permanent' ? (
          <Pressable
            onPress={() => void thread.retry(p.clientMsgId)}
            style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}
          >
            <MessageBubble body={p.body} mine timestamp={t.tapRetry} />
          </Pressable>
        ) : (
          <View style={{ paddingHorizontal: SPACE.gutter, marginBottom: SPACE.md }}>
            <MessageBubble body={p.body} mine timestamp={t.send + '…'} />
          </View>
        ),
    }))

    // Pending are the very latest (in-flight) — they belong at the bottom.
    return [...base, ...askRows, ...pendingRows]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.messages, thread.pending, lang, asks])
```

> The `weaveHomeRoom`, `HomeRoomUpdateCard`, `HomeRoomDecisionCard`,
> `onRespondDecision`, `canApprove`, and the `updatesQ`/`decisionsQ`/`capsQ`
> wiring that fed the weave can now be simplified. KEEP `updatesQ` and
> `decisionsQ` — they now feed the strip (Step 4). Remove `capsQ`/`canApprove`/
> `onRespondDecision` only if nothing else references them (the in-thread decision
> actions are gone; decisions are acted on from the Decisions screen). If removing
> them risks unrelated breakage, leave them and let `npm run typecheck` flag dead
> code — prefer a clean removal.

- [ ] **Step 3: Compute the strip summary**

After the `decisionsQ` definition, add:

```tsx
  const waiting = summarizeWaiting(
    homeRoom ? (updatesQ.data?.items ?? []) : [],
    homeRoom ? (decisionsQ.data ?? []) : [],
  )
```

- [ ] **Step 4: Render the strip above the feed**

In the JSX, between the header `</View>` and the `thread.isLoading` block, insert:

```tsx
      {homeRoom ? (
        <ThreadSummaryStrip
          updateCount={waiting.updateCount}
          needsYouCount={waiting.needsYouCount}
          lang={(lang as 'en' | 'hi') ?? 'en'}
          onOpenUpdates={() => router.push('/(homeowner)/updates')}
          onOpenDecisions={() => router.push('/(homeowner)/updates')}
        />
      ) : null}
```

> Both segments deep-link to `/(homeowner)/updates` for now (the Updates screen
> has the Changes/Decisions surfaces). If a dedicated decisions route exists at
> implementation time (`/(homeowner)/decisions`), point `onOpenDecisions` there —
> verify the route with `ls app/(homeowner)` before wiring.

- [ ] **Step 5: Confirm `MessageFeed` usage still compiles**

The existing `<MessageFeed items={items} mineSide="homeowner" time={timeLabel} .../>` now renders inverted by default and gains day separators/grouping automatically. Pass a localized `dayLabel`:

```tsx
          <MessageFeed
            items={items}
            mineSide="homeowner"
            time={timeLabel}
            dayLabel={(iso) => dayLabelFor(iso, (lang as 'en' | 'hi') ?? 'en')}
            onLongPressMessage={onLongPress}
            deliveryStateFor={thread.deliveryState}
            emptyState={/* unchanged */}
          />
```

Add a small local helper near `timeLabel`:

```tsx
function dayLabelFor(iso: string, lang: 'en' | 'hi'): string {
  const d = new Date(iso)
  const now = new Date()
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  if (key(d) === key(now)) return lang === 'hi' ? 'आज' : 'Today'
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (key(d) === key(y)) return lang === 'hi' ? 'कल' : 'Yesterday'
  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : undefined, { day: 'numeric', month: 'short' })
}
```

- [ ] **Step 6: Typecheck + full suite**

Run: `npm run typecheck && npm test`
Expected: no type errors; all tests pass.

- [ ] **Step 7: Preview smoke (the homeowner thread)**

Start the preview, open a homeowner builder thread, and confirm:
- The thread shows only human bubbles + photos (no Progress/Decision/Capture cards).
- A pinned strip sits above the messages when there are updates/decisions; it's absent when there are none.
- Day separators appear; other-party bubbles show a name + avatar on first-of-run; timestamps cluster at run ends.
- Scrolling up works and stays put; new messages stick to the bottom only when you're already there.

Use the preview tools (`preview_start`, `preview_snapshot`, `preview_screenshot`). If preview cannot run an authed homeowner thread, capture `npm run typecheck` output as the gate and note the manual-verification limitation.

- [ ] **Step 8: Commit**

```bash
git add "app/(homeowner)/messages/[id].tsx"
git commit -m "feat(homeowner): un-weave thread to pure chat; render ThreadSummaryStrip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Cleanup — stale bubble comment + dead card kit

**Files:**
- Modify: `app/(homeowner)/_messages_components.tsx`

- [ ] **Step 1: Remove the stale comment**

In `app/(homeowner)/_messages_components.tsx`, find the stale `--radius-bubble` / `DaylightBubble` comment near line 14 and delete it (the live bubble path uses `theme.radii.bubble` now).

- [ ] **Step 2: Confirm `HomeRoomUpdateCard` / `HomeRoomDecisionCard` usage**

Run: `grep -rn "HomeRoomUpdateCard\|HomeRoomDecisionCard" app src | grep -v "_messages_components.tsx"`
- Expected: no matches (the thread no longer uses them).
- If there are no other consumers, add a one-line comment above each marking them as currently unused (kept for the Updates/Decisions surfaces), OR remove them if clearly dead — prefer keeping them if any other screen imports them.

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add "app/(homeowner)/_messages_components.tsx"
git commit -m "chore(homeowner): drop stale bubble-radius comment; note unused HomeRoom cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Contractor scroll parity (D3)

**Files:**
- Modify: `app/(contractor)/supervisor/chat.tsx`
- Modify: `app/(contractor)/owner/chat/[id].tsx`

**Goal:** Apply the same scroll fix (invert + remove forced `scrollToEnd`) to the contractor screens' own `FlatList`s, so "all roles get a better chat."

> These screens build their data array oldest→newest and render their own rows.
> Inverting requires reversing the data array AND ensuring any header/footer and
> "scroll on send" still behave. Each screen is independent — do them one at a
> time, typecheck between.

- [ ] **Step 1: supervisor/chat.tsx — invert + remove forced scroll**

In `app/(contractor)/supervisor/chat.tsx`:
1. On the `<FlatList>` (around line 518), add `inverted` and reverse the data: change `data={rows}` to `data={[...rows].reverse()}` (use the actual data variable name in the file).
2. Remove `onContentSizeChange={scrollToEnd}` (line 523).
3. Keep the explicit `scrollToEnd()` calls on **own send** only; with `inverted`, replace `listRef.current?.scrollToEnd(...)` inside `scrollToEnd` with `listRef.current?.scrollToOffset({ offset: 0, animated: true })` (offset 0 = visual bottom when inverted).
4. Add `keyboardShouldPersistTaps="handled"` to the FlatList.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Commit supervisor**

```bash
git add "app/(contractor)/supervisor/chat.tsx"
git commit -m "fix(contractor): supervisor chat — invert list + remove forced auto-scroll

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: owner/chat/[id].tsx — invert + remove forced scroll**

Apply the same four changes in `app/(contractor)/owner/chat/[id].tsx`:
1. `<FlatList>` (around line 253): add `inverted`, reverse the data array (use the file's actual data variable).
2. Remove `onContentSizeChange={scrollToEnd}` (line 258).
3. Repoint the `scrollToEnd` helper (line 137-138) to `scrollToOffset({ offset: 0, animated: true })`.
4. Add `keyboardShouldPersistTaps="handled"`.

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit owner**

```bash
git add "app/(contractor)/owner/chat/[id].tsx"
git commit -m "fix(contractor): owner chat — invert list + remove forced auto-scroll

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Full suite + typecheck (final gate)**

Run: `npm test && npm run typecheck`
Expected: all pure tests pass; no type errors.

- [ ] **Step 6: Preview smoke (contractor)**

Open a contractor (supervisor or owner) chat thread in preview; confirm bubbles render, scroll-up works, and capture cards still appear (contractor keeps cards). Capture a screenshot.

---

## Self-Review

**Spec coverage:**
- §6.1 un-weave → Task 8. §6.2 captures-as-bubbles → Task 2 + Task 8. §6.3 strip → Tasks 3, 7, 8. §6.4 scroll → Task 6 (homeowner) + Task 10 (contractor). §6.5 day separators/grouping/avatars → Task 1 + Task 6. §6.6 bubble shape + clustered timestamps + de-serif → Tasks 4, 5, 6 (timestamps via `runEnd`), Task 9 (de-serif/cleanup — and the serif cards leave chat via Task 8). §6.7 `@ask` kept → Task 8 (ask rows retained). §6.8 pending placement → Task 8 (pending at bottom = newest). All covered.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Every code step shows the code. The two judgment calls (removing `capsQ`/decision handlers in Task 8; keeping vs deleting `HomeRoom*Card` in Task 9) are explicit decisions with a stated default, not placeholders.

**Type consistency:** `annotateFeed(rows, dayLabel)` and `FeedAnnotations { dayBefore, showSender, runEnd }` are used identically in Task 1 (def) and Task 6 (consume). `messagesToFeed(..., {capturesAsBubbles})` matches between Task 2 and Task 8. `summarizeWaiting → {updateCount, needsYouCount}` matches Task 3 → Tasks 7/8. `radii.bubble` defined in Task 4, used in Task 5. `ThreadSummaryStrip` props match Task 7 def and Task 8 use.

**Open risk to watch during execution:** inverting `MessageFeed` interacts with `KeyboardAvoidingView` in the homeowner screen — verify the keyboard still pushes the composer correctly in the Task 8 preview smoke; if not, reduce `keyboardVerticalOffset` reliance per spec §6.4.
