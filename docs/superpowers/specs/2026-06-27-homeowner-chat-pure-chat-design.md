# Homeowner Chat Hardening — "Chat is for people, surfaces are for AI"

**Date:** 2026-06-27
**Status:** Approved design — ready for implementation plan
**Scope:** Homeowner mobile app (`constructo/mobile`) + the shared chat kit (`src/chat/`)
**Author:** Aryan + Claude (brainstormed from annotated app screenshots)

---

## 1. Problem

The homeowner thread (`app/(homeowner)/messages/[id].tsx`) does not feel like a
chat. From the user's annotated screenshots and a verified code map, the thread
is a **feed that weaves four different things into one scroll**:

1. Real human messages (chat bubbles via `MessageBubble`)
2. "Progress" **update cards** woven in (`HomeRoomUpdateCard`) — the serif
   "Planning for moulding…", "CNC work…" cards
3. Approve/comment **decision cards** (`HomeRoomDecisionCard`)
4. **Capture / vision cards** — the "upholstered chair… 22% sure / Show proof"
   AI-detection content (`CaptureCard`)

Three distinct complaints all trace to this:

- **"Doesn't feel like a chat group"** — the weave turns a bubble stream into a
  wall of full-width letter-cards; bubbles have no sender names/avatars, no day
  separators, no grouping, a card-sized radius, and a serif type on the cards.
- **"Scrolling doesn't work like normal scrolling"** — the list is a
  non-inverted `FlatList` that force-calls `scrollToEnd({animated:true})` on
  **every** `onContentSizeChange`, so any height change (8s poll, socket frame,
  image load, card expand, keyboard) yanks the viewport to the bottom mid-read.
- **"Messages have AI written shown"** — AI-derived content (updates, decisions,
  vision detections, proof) is rendered as messages inside the thread.

## 2. Goal

Make the homeowner thread a **pure human message stream** that feels like a
WhatsApp group, and move everything AI-derived **out** of the thread to the
screens that already host it — surfaced back in the thread only as a single
**pinned summary strip** at the top.

### Success criteria

- The thread renders **only** human messages (bubbles + photos) and the one
  ephemeral `@ask` exchange. No update/decision/capture cards inline.
- Scrolling behaves like a normal chat: you can scroll up freely; new content
  sticks to the bottom only when you're already at the bottom or you sent it;
  idle refetches never move the viewport.
- The thread reads as a group chat: sender names + avatars on others' bubbles,
  day separators, consecutive-message grouping, real bubble shape, clustered
  timestamps.
- A pinned strip at the top shows `[ N updates ] [ N needs you ]` and deep-links
  to Updates / Decisions. It is absent when there is nothing to show.
- `@ask` stays in the thread as a clearly-ephemeral assistant reply.
- Contractor / site-engineer / architect chats inherit the scroll + bubble +
  grouping improvements (shared kit) with **no visual regression**.

## 3. Non-goals

- No backend / API changes. All destination screens (Updates, Decisions,
  Photos, Heads-up) already exist; this is a client-side re-routing + UI pass.
- No new "what the AI saw" screen. Vision detections continue to reach the
  homeowner via the existing Heads-up (Home) + Photos surfaces; the strip just
  counts them.
- No change to the contractor weave (the contractor screens have no Home Room
  weave) beyond what the shared kit naturally improves.
- Voice messages remain the existing honest "coming soon" stub.

## 4. Decisions (locked with the user)

| # | Decision | Choice |
|---|---|---|
| D1 | How much leaves the thread | **Pure chat + light pointers** — thread is human-only; all AI/derived content moves to its own screens; a small tappable nudge stays in the thread. |
| D2 | The inline `@ask` feature | **Keep in chat** — an ephemeral, "only you can see this" assistant reply; never a persisted person bubble. |
| D3 | Scope of the chat-feel fixes | **Shared kit for all roles**, AI-content **un-weave for homeowner only**. |
| D4 | How the pointer appears | **Pinned strip on top** — one persistent bar (`N updates · N needs you →`) above the messages; the message flow stays 100% pure. |

## 5. Current architecture (verified)

- **Screen:** `app/(homeowner)/messages/[id].tsx`. Builds a `FeedRow[]` via
  `weaveHomeRoom()` (`app/(homeowner)/_home_room.util.ts`), wrapping update rows
  in `HomeRoomUpdateCard`, decision rows in `HomeRoomDecisionCard`, system rows
  in `SystemNotice`, then appends `@ask` rows and durable-outbox pending bubbles.
  Renders through `MessageFeed`.
- **Shared kit:** `src/chat/`
  - `MessageFeed.tsx` — a plain non-inverted `FlatList`; `onContentSizeChange →
    scrollToEnd` (lines 42–46, 89). Renders `bubble` / `card` / `custom` rows.
    **Never forwards** `showSenderName` / `senderName` to `MessageBubble`.
  - `MessageView.tsx` — `MessageBubble` (own/other tint, `radii.card`,
    per-bubble Mono timestamp, own-side delivery tick). Already accepts
    `showSenderName` / `senderName` (dead today). `CaptureCard` (the
    Progress/Delivery/Check-this card with "show proof"). Eczar serif comes
    from `Title` inside cards, not bubble body (bubble body is Hind sans).
  - `feed.ts` — `messagesToFeed()`: a message with `events[]` → one `CaptureCard`
    per event; else a `bubble`.
- **Data:** `ChatMessage` (`src/api/chat.ts`) carries `sender_name`,
  `sender_role`, `sender_side`, `sender_kind` (`user|nivaan|system`),
  `created_at`, `events[]`. Sender attribution data exists; only the render
  wiring is missing.
- **Thread state:** `useChatThread` polls every 8s + socket invalidations and
  rebuilds the list; this is what makes the forced auto-scroll twitch.

## 6. Design

### 6.1 Un-weave the homeowner thread (D1, D3)

In the homeowner builder channel, the thread stops weaving updates/decisions and
renders **only** messages (bubbles + capture-from-photo handled per 6.2),
`@ask` rows, system notices, and pending bubbles.

- `weaveHomeRoom()` is **repurposed**, not deleted. Today it returns rows for
  rendering; we split its responsibility:
  - A new pure function `summarizeWaiting(updates, decisions)` →
    `{ updateCount, needsYouCount, latestUpdateAt }` (+ deep-link targets).
    This drives the pinned strip.
  - The message feed itself is built directly from `messagesToFeed(messages)`
    (no updates/decisions injected). The `weaveHomeRoom` weave call in
    `messages/[id].tsx:227-259` is removed; update/decision `custom` nodes are
    removed.
- `HomeRoomUpdateCard` / `HomeRoomDecisionCard` are **no longer rendered in the
  thread**. They remain available to their existing host screens. (If, after
  this change, they are unreferenced anywhere, they are dead code — flag for a
  follow-up, do not delete in this pass to avoid scope creep.)
- Net surface lost: **zero** — every card already has a home (Updates tab,
  Decisions detail, Heads-up, Photos), per the verified inventory.

### 6.2 Capture cards (photos that minted events)

Decision D1 = pure chat. A photo a human sent **stays** as a photo bubble (it is
a human action). The AI's structured detection (event type, fields, confidence,
"show proof") is **not** rendered inline.

- In the homeowner thread, `messagesToFeed` is replaced by a homeowner variant
  (or a flag) that renders a captured message as a **plain photo/text bubble**
  (its `attachment_url` + `body`), **not** a `CaptureCard`. The minted event is
  represented only by its contribution to the pinned-strip counts.
- The shared `messagesToFeed` / `CaptureCard` are **unchanged** for contractor
  screens (D3 — capture cards are core to the contractor product).

### 6.3 The pinned summary strip (D4)

A new component `app/(homeowner)/_thread_summary_strip.tsx`:

- Props: `{ updateCount, needsYouCount, onOpenUpdates, onOpenDecisions }`.
- Renders a single row pinned **above** the `MessageFeed` (between the header
  and the list — it must NOT scroll with messages):
  - `✦ N updates` (muted) — taps → Updates tab.
  - `🟠 N needs you` (amber pill, action-first) — taps → Decisions. Only shown
    when `needsYouCount > 0`.
  - trailing chevron.
- Renders **nothing** when `updateCount === 0 && needsYouCount === 0`.
- Counts come from `summarizeWaiting()` over the same `updatesQ` / `decisionsQ`
  data already fetched in the screen. `needsYouCount` = pending decisions
  (+ any update of type `decision_needed`, mirroring the old weave's dedupe).
- Daylight ("Calm Cockpit") styling: warm surface, amber accent for "needs you".
  Uses the homeowner design tokens, ≥44px tap targets.

### 6.4 Scrolling fix (D3 — shared kit, `MessageFeed.tsx`)

- Make the `FlatList` **inverted** (render newest-first by reversing the row
  array). This gives bottom-stick and cheap upward pagination for free and
  matches WhatsApp keyboard behavior.
- **Delete** the blanket `onContentSizeChange → scrollToEnd`. With `inverted`,
  new content at the bottom sticks automatically.
- Add an `atBottom` ref tracked via `onScroll`; expose an imperative
  `scrollToBottom()` and only call it on **own send** (the screen already knows
  when the user sends).
- Add `keyboardShouldPersistTaps="handled"`.
- Wire `onEndReached` to a `loadOlder` callback (optional prop; no-op if the
  screen doesn't supply one — pagination wiring can be a later slice, but the
  prop seam ships now).
- `KeyboardAvoidingView` in `messages/[id].tsx`: keep, but the hard-coded
  `keyboardVerticalOffset` becomes less load-bearing with `inverted`; measure
  the header height instead of the magic `56` where practical.

> Inversion interacts with `ListHeaderComponent` / `ListEmptyComponent` and row
> `marginBottom`. The implementation must verify header/empty placement and that
> grouped spacing still reads correctly when inverted (these become visual-bottom
> = array-start). Covered by tests in §8.

### 6.5 Group-chat affordances (D3 — shared kit)

- **Sender name + avatar** on non-mine bubbles: `MessageFeed` forwards
  `showSenderName` + `senderName` (from `m.sender_name`) to `MessageBubble`
  (render branch already exists), and renders a small leading `Avatar` for the
  first bubble of a same-sender run. `mineSide` already determines own/other.
- **Day separators:** add a `'day'` row kind to `FeedRow`. A derivation pass
  inserts a day row whenever the calendar date changes between consecutive
  messages ("Today" / "Yesterday" / "2 Jun"). Rendered as a centered pill
  (reusing the `SystemNotice` centered treatment or a dedicated `DaySeparator`).
- **Consecutive grouping:** within a same-sender run, suppress the repeated
  name/avatar and reduce inter-bubble `marginBottom`; full margin between runs
  and across senders.

### 6.6 Bubble feel (D3 — shared kit, `MessageView.tsx`)

- Introduce a real `radii.bubble` token (tighter than `radii.card`) with an
  asymmetric "tail" corner on the sender's side; apply to `MessageBubble`.
  Remove the stale `--radius-bubble` / `DaylightBubble` comment drift.
- **Clustered timestamps:** show the time only on the **last** bubble of a
  same-sender run (the screen/derivation marks `isRunEnd`), not on every bubble.
  Keep own-side-only delivery ticks (already correct WhatsApp behavior).
- **De-serif** any structured card `Title` that still renders anywhere in chat
  (sans, lighter weight) so nothing reads like a "letter."

### 6.7 `@ask` (D2)

Unchanged behavior; restyled as a clearly-ephemeral assistant reply (a dashed/
tinted bubble with an "Assistant · only you can see this" caption), visually
distinct from both person bubbles and the (now-removed) AI cards. Stays inline
in the thread.

### 6.8 Pending / optimistic bubbles

Merge `pending` bubbles into the timeline **by timestamp** rather than appending
after `@ask` rows (`messages/[id].tsx:275-292`), so an in-flight message appears
in true chronological position.

## 7. Files touched

| File | Change |
|---|---|
| `app/(homeowner)/messages/[id].tsx` | Remove the weave; build feed from messages only; render `ThreadSummaryStrip` above `MessageFeed`; keep `@ask`; merge pending by time. |
| `app/(homeowner)/_home_room.util.ts` | Add `summarizeWaiting()` (counts + deep-link intents). Keep strings. `weaveHomeRoom` retained but unused by the thread (or trimmed). |
| `app/(homeowner)/_thread_summary_strip.tsx` | **New** — the pinned strip component. |
| `app/(homeowner)/_messages_components.tsx` | Remove stale bubble comment; keep `ChannelRow`; `HomeRoom*Card` no longer used by the thread. |
| `src/chat/MessageFeed.tsx` | Invert; remove forced scroll; `atBottom` + own-send scroll; `keyboardShouldPersistTaps`; `onEndReached` seam; forward sender name/avatar; render `day` rows; grouping spacing. |
| `src/chat/MessageView.tsx` | `radii.bubble` + tail; clustered timestamp (`isRunEnd`); leading avatar slot; de-serif card titles. |
| `src/chat/feed.ts` | Add a `'day'` `ChatFeedItem` kind + a derivation helper (date boundaries, `isRunStart`/`isRunEnd`, `showSenderName`); a homeowner "captures-as-plain-bubbles" mode (flag or variant). |
| `src/theme/tokens.ts` (+ theme) | Add `radii.bubble`. |

## 8. Testing

Co-located tests, following existing patterns (`*.test.tsx` next to source).

- `feed.test.ts` — day-boundary insertion; run-start/run-end marking;
  `showSenderName` only on first-of-run, non-mine; homeowner capture→bubble mode
  keeps photo/text and drops the card; contractor mode still emits cards.
- `MessageFeed.test.tsx` — inverted order renders newest at visual bottom;
  no `scrollToEnd` on content-size change; `scrollToBottom` fires on own send;
  `onEndReached` calls `loadOlder`; sender name/avatar forwarded.
- New `_thread_summary_strip.test.tsx` — renders counts; hides "needs you" at 0;
  renders nothing when both counts are 0; taps fire the right deep-links.
- `_home_room.util` test — `summarizeWaiting` counts (pending decisions +
  `decision_needed` updates → needsYou; other published updates → updateCount).
- Update `messages/[id].tsx` thread test (`ChatThread`/screen test) — thread
  shows only bubbles + strip; no `HomeRoomUpdateCard`/`HomeRoomDecisionCard`.
- **Regression guard:** contractor chat screens (owner/supervisor/architect/pm)
  render unchanged (capture cards still present; their tests stay green).
- Run `npm run build` (tsc -b — the strict CI/Vercel build), not just lint,
  per the repo gotcha.

## 9. Rollout / build order

Each step is independently shippable and demoable:

1. **Scroll fix + invert** (`MessageFeed.tsx`) — biggest felt win, one file.
2. **Un-weave + pinned strip** (homeowner screen + `_home_room.util` +
   `_thread_summary_strip`) — removes the card wall.
3. **Sender names/avatars + day separators + grouping** (`feed.ts` +
   `MessageFeed` + `MessageView`).
4. **Bubble shape + clustered timestamps + de-serif + pending-by-time** —
   the visual feel pass.

## 10. Risks & mitigations

- **Inverting the list** can shift header/empty/spacing semantics → covered by
  `MessageFeed` tests + a manual pass on an empty thread and a 1-message thread.
- **Shared-kit regressions** on contractor screens → capture cards and contractor
  bubble look are untouched; their tests must stay green; verify with `npm run
  build` and the contractor screen tests.
- **Avatar/name data** — `sender_name` is nullable for system/nivaan rows; the
  render branch already guards on it; day/grouping derivation must treat
  null-sender rows (system) as non-grouping.
- **Capture-as-bubble** must not hide the photo — the photo bubble must still
  show `attachment_url`.

## 11. Open questions

None blocking. Pagination (`loadOlder`) ships as a seam in step 1 and can be
fully wired in a follow-up if the backend cursor needs work.
