# Unified Rich Chat — Foundation (Slice A) Design

> Status: design / awaiting review · 2026-06-08
> Part of: "flagship chat features for everyone" (multi-slice). This is **Slice A — the foundation**.

## Context

The founder wants the flagship in-app-chat features (capture cards, capture rail, camera, voice,
inline @ask, action items, recap, reply/threading) available to **everyone in a conversation** —
the homeowner and every group member — not just the contractor supervisor crew chat.

The trust model is **human-governed sharing, not an automated wall**: who is in a conversation is a
deliberate contractor decision, so inside any conversation a person is part of they get the full
universal feature set (and, in later slices, their captures book into the ledger). The **trust
membrane stays only for automated/published flows** (the homeowner's curated Updates feed + Home) —
which is why the raw-WhatsApp leak into Updates is a *separate* bug. **Contractor-domain features**
(risk brief, disputes, money/approvals, vendor-confirm) stay contractor-side because they're
contractor *concerns*, expressed as composition (the homeowner screen simply doesn't include them).

Because this spans several subsystems, it is decomposed into shippable slices:
- **A — Unified rich chat foundation (THIS SPEC).**
- B — Inline @ask everywhere (role-aware grounding).
- C — Action items / to-dos universal.
- D — Capture → ledger from any conversation (backend extraction seam + media unblock).
- E — Crew de-gating (supervisor-only → any participant).

## Goal of Slice A

Build a **composable, theme-aware chat kit** in `src/chat/` and move all three existing chat
surfaces (supervisor crew, owner, homeowner) onto it **behavior-preserving**. No new cross-role
behaviors land here — Slice A removes the homeowner-vs-contractor chat divergence and creates the
seams the later slices plug into. The one user-visible win it carries (free, no backend change) is
**reply/quote in the homeowner thread**.

Today the chat is split: the rich experience lives inline in `app/(contractor)/supervisor/chat.tsx`
(~1094 lines, all features hand-wired); `src/chat/MessageView.tsx` holds the extracted `CaptureCard`
+ `MessageBubble`; the homeowner thread (`app/(homeowner)/messages/[id].tsx` +
`_messages_components.tsx`) is a separate, simpler Daylight UI (`DaylightBubble`, no cards, no rich
composer). The kit unifies these.

## Architecture — a composable kit, not a god-component

`chat.tsx` is already a 1094-line god-component; a single `<RichChatThread features={…}/>` would make
that worse and harder to test. Instead, `src/chat/` gains small, independently-testable units, and
each screen *composes* what it needs. Contractor-only modules are passed as composed slots that are
simply absent on the homeowner screen.

### Units (each: one purpose, clear interface, testable)

- **`useChatThread(address)`** — headless logic hook (no UI). `address` is the existing
  `ChatAddress` discriminated union (`{siteId}` XOR `{conversationId}`) from `src/api/chat.ts`.
  Owns: the messages query (poll + `after_seq`), feed assembly, idempotent send with optimistic
  echo + restore-on-failure, mark-read cursor, and reply-target state. Returns
  `{ messages, send, sending, reply, setReply, markReadTo, isLoading, error, refetch }`. This is the
  logic currently duplicated across supervisor/owner/homeowner thread screens.

- **`MessageFeed`** — theme-aware `FlatList` that renders a heterogeneous feed and adapts to the
  active theme via `useTheme()`. Item kinds: `bubble` (→ theme-fixed `MessageBubble`), `card`
  (→ `CaptureCard`), and an extensible `custom` slot so a screen can inject its own row types
  (the homeowner Home Room weave — curated update/decision cards — plugs in here; see
  [Home Room compatibility](#home-room-compatibility)). Exposes `onLongPressMessage(message)` so each
  screen wires its own long-press menu (contractor: Reply/To-do/Dispute/…; homeowner: Reply/To-do).

- **`ChatComposer`** — text input + Send + a reply banner + an **actions slot** (an array of
  composer action buttons). Each screen passes the action set it supports — so the supervisor passes
  camera/voice/slash, and the homeowner passes only what's enabled for it today (text + reply now;
  camera/voice/@ask arrive with their slices). Theme-aware (sage Send on Daylight, amber on
  Blueprint via `theme.colors.accent`).

- **`CaptureRail`** — thin presentational wrapper over the already-pure `src/capture/slash.ts` +
  `src/capture/suggest.ts` (slash parse + smart-suggest chip). Theme-aware chip (no hardcoded amber).

- **`MessageView.tsx` fixes** — make the two shared renderers fully theme-aware (see Theme section).

### Composition per screen

| Screen | Theme | Composes |
|---|---|---|
| `supervisor/chat.tsx` | blueprint | `useChatThread({siteId})` + `MessageFeed` + `ChatComposer` (camera/voice/slash/@ask actions) + `CaptureRail` + **contractor-only**: pinned brief, header tools (Radar/To-dos/Recap), long-press Dispute/Resolve, vendor-confirm, sentinel/recap sheets |
| `owner/chat/[id].tsx` | blueprint | `useChatThread({conversationId\|siteId})` + `MessageFeed` + `ChatComposer` (text + reply) |
| `(homeowner)/messages/[id].tsx` | daylight | `useChatThread({conversationId})` + `MessageFeed` (+ Home Room weave rows) + `ChatComposer` (text + **reply** now; camera/voice/@ask slots reserved for later slices) |

## Theme adaptation

Both themes implement a shared `ThemeColors` interface; `useTheme()`, the Typography components,
`StatusPill`, `Card`, `Button` all already adapt. The only blockers found are hardcoded amber:

- `MessageView.tsx` `MessageBubble` own-bubble uses `rgba(242,161,0,0.16)` bg / `rgba(242,161,0,0.45)`
  border (amber). → derive from `theme.colors.accent` (sage on Daylight, amber on Blueprint). On
  Daylight, match the existing `DaylightBubble` look (soft sage tint `AP.chip`) so the homeowner
  bubble is visually unchanged.
- Supervisor smart-suggest chip hardcodes amber opacity (`chat.tsx`). → move into `CaptureRail`,
  derive from `theme.colors.accent`.
- `Avatar` (`src/ui/Avatar.tsx`) is Daylight-only (`AP.chip`). The feed already differentiates
  sender by alignment/tint, so avatars are out of scope for Slice A; if needed later, make Avatar
  theme-aware. Noted, not done here.

Rule for the kit: **never hardcode hex or font names** — read `theme.colors.*`, `theme.radii.*`,
`theme.shadowCard`, and use Typography components (which auto-pick Eczar/Hind/IBM-Plex on Daylight,
Anek/Hind/Spline on Blueprint).

## Home Room compatibility

PR #158 (open, on `feat/homeowner-calm-cockpit`) weaves curated **update/decision cards** into the
homeowner builder thread. `MessageFeed`'s `custom` row slot is designed to carry exactly that weave,
so the kit subsumes it rather than conflicting. Sequencing: this branch is cut from
`feat/homeowner-calm-cockpit`; if #158 merges first, the homeowner migration re-expresses the weave
through `MessageFeed`'s custom rows; if it merges after, #158's `mergeHomeRoom` output feeds the
`custom` slot. Either way the curated-card weave and the unified feed coexist.

## In scope (Slice A)

1. `src/chat/` kit: `useChatThread`, `MessageFeed`, `ChatComposer`, `CaptureRail`.
2. Theme-fix `MessageView.tsx` (`MessageBubble`/`CaptureCard`) so both render correctly in Daylight.
3. Migrate `supervisor/chat.tsx`, `owner/chat/[id].tsx`, `(homeowner)/messages/[id].tsx` onto the kit
   **behavior-preserving** (contractor screens look/work identically; homeowner gains reply/quote).
4. Reply/quote working in the homeowner thread (universal comms; `reply_to_id` already supported).
5. Unit tests for `useChatThread` feed assembly + any pure helpers; mobile typecheck + jest green.

## Out of scope (explicitly — later slices)

- Capture → ledger for homeowner/group (Slice D: backend extraction seam + `/chat/media` unblock).
- Inline @ask in homeowner/group threads (Slice B: role-aware routing — homeowner →
  `/homeowner/ask` membrane-scoped, crew → `/ask`).
- Action items / to-dos universal (Slice C).
- Crew de-gating supervisor-only → any participant (Slice E).
- Voice (Sarvam STT key unconfirmed/blocked) and the Updates membrane-leak bug (separate).

## Risks & mitigations

- **Supervisor chat is the flagship and the refactor is large/delicate.** Mitigation: extract
  incrementally, keep it strictly behavior-preserving, lean on the existing mobile typecheck + jest
  gate, and **verify on the iOS simulator** (drive the supervisor chat before/after — cards, capture
  rail, camera, @ask, brief, long-press menu, sheets all identical).
- **Two themes, one component.** Mitigation: rely only on shared `ThemeColors` tokens + Typography;
  snapshot/typecheck both; visually verify homeowner (Daylight) + supervisor (Blueprint).
- **PR #158 overlap.** Mitigation: the `custom` feed slot is designed for the weave; coordinate
  merge order (above).
- **No backend change in Slice A** → low blast radius server-side.

## Verification

- `cd constructo/mobile && npm run typecheck` green; `npx jest` green (new `useChatThread`/helper tests).
- Live on the iOS simulator: supervisor crew chat is byte-for-byte behavior-identical; homeowner
  thread renders via the kit (bubbles unchanged, reply/quote works); owner chat unchanged.
- One feature/PR discipline; behavior-preserving refactor reviewed before the feature slices land.
