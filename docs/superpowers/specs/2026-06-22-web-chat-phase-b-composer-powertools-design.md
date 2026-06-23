# Web Chat — Phase B: Composer Power-Tools (Slash Menu + Smart-Suggest)

- **Date:** 2026-06-22
- **Status:** Approved (design)
- **Branch:** `feat/web-chat-phase-bc` (stacked on `feat/web-chat`)
- **Backend changes:** none (web-only)
- **Predecessor:** Phase A (PR #205) — web chat kit ported from mobile.

## Context

Phase A shipped the web chat (`constructo/web/src/features/chat/`). The composer
already carries labelled `PHASE_B_*` slot comments, and `useChatThread` already
exposes `sendProposal(captureType, fields)` and `sendMedia({…})`. The backend
`POST /api/v1/chat/messages` already accepts `capture_type` + `fields` (a
committed structured capture) — so Phase B is **pure web UI + ported pure
helpers**, no backend work.

Mobile is the reference: `constructo/mobile/src/capture/slash.ts` (parser) and
`constructo/mobile/src/capture/suggest.ts` (smart-suggest) are deterministic,
offline, network-free modules. We port them faithfully.

## Goal

Bring two composer power-tools to the web chat, **Neev-styled** (the warm
"Calm Cockpit / Neev" skin, light + dark):

1. **Slash commands** with a desktop-native **slash menu** (`/att /del /pay /inv`).
2. **Smart-suggest** capture chip (one amber pill that pre-fills a capture).

## Scope

**In:**
- Port `slash.ts` (`parseSlash`, `SLASH_COMMANDS`) + full unit tests.
- Port `suggest.ts` (`suggestCapture`) + full unit tests.
- New `SlashMenu` anchored popover (keyboard-driven listbox).
- Composer integration: slash menu on `/`, parse-on-send, smart-suggest chip row.
- Wire `onSendProposal` from `ChatThread` → `useChatThread.sendProposal`.

**Out (explicit):**
- **Voice recording** — deferred this pass. Browser `MediaRecorder` emits
  `webm/opus`, which mismatches the backend's `m4a`/STT path, and voice is a
  field/mobile affordance with low desk value. Revisit if owners ask.
- New capture types, `@`-mentions, the `nivaan_propose` draft-card flow.
- Any backend change.

## Decisions

- **Slash UX = menu + text-parse.** Typing `/` opens a Slack-style command
  palette anchored above the composer (discoverable, keyboard-nav); raw typed
  text still parses on send. Chosen over mobile's text-only parity for desktop
  ergonomics.
- **`SlashMenu` is a new, self-contained, composer-anchored popover** that
  *cribs* the keyboard model of `components/CommandPalette/CommandPalette.tsx`
  (↑/↓/Enter/Esc, `role="listbox"`/`role="option"`). We do **not** reuse the
  global ⌘K palette — it is full-screen and wired to routing/ui-store (wrong fit).
- **Helpers live in `features/chat/`** (`slash.ts`, `suggest.ts`) — web has no
  `capture/` directory, and these are chat-only.
- **Captures are committed via the existing `sendProposal`** path. The backend
  books a `SiteEvent` for site-bearing threads (site crew, site-group, homeowner);
  a site-less company-wide group is talk-only and the backend skips extraction
  gracefully. **No special-casing** — affordances appear in every thread (matches
  Phase A; sending a structured message is harmless when there is no site).

## Components & files

| File | Type | Responsibility |
|---|---|---|
| `features/chat/slash.ts` | new (port) | `parseSlash(text) → ParsedCapture \| SlashError \| null`, `SLASH_COMMANDS`, `isSlash`. |
| `features/chat/slash.test.ts` | new | Parity with mobile cases (all 4 cmds, multi-trade, usage errors). |
| `features/chat/suggest.ts` | new (port) | `suggestCapture(text) → CaptureSuggestion \| null` (deterministic, EN+HI, negation guard). |
| `features/chat/suggest.test.ts` | new | delivery / attendance / negation / null. |
| `features/chat/SlashMenu.tsx` | new | Anchored listbox popover; props: `query`, `activeIndex`, handlers, `onSelect`. |
| `features/chat/SlashMenu.test.tsx` | new | open/filter/keyboard/select/esc + a11y. |
| `features/chat/ChatComposer.tsx` | edit | Fill `PHASE_B_*` slots; new prop `onSendProposal`. |
| `features/chat/ChatComposer.test.tsx` | edit | Menu-on-`/`, parse-on-send, chip, normal-text unaffected. |
| `features/chat/ChatThread.tsx` | edit | Pass `onSendProposal` adapter to composer. |

## Behaviour / data flow

**Slash menu**
- Textarea value begins with `/` and the user hasn't yet completed a command →
  `SlashMenu` opens, filtered by the typed prefix (`/at` → `/att`).
- ↑/↓ move the active item; Enter/Tab completes the active command's template
  into the textarea (e.g. `/att `) and keeps focus; Esc closes; click completes.
- The menu lists each command's label + usage hint (e.g. `/att 24` → "Log
  attendance").

**Send (Enter or Send button)**
- `parseSlash(text)`:
  - `ParsedCapture` → `onSendProposal(capture_type, fields)`, clear input.
  - `SlashError` → show inline, non-blocking usage hint; **do not** send.
  - `null` → ordinary `onSend(text)` (existing path).

**Smart-suggest**
- On each text change (and not while composing a slash command),
  `suggestCapture(text)` → at most one suggestion → render a single amber chip in
  the existing slot below the input. Click → `onSendProposal(capture_type, fields)`
  and clear input. Never fires on negations (porting the polarity guard).

## Neev design

- **Slash menu:** `bg-[var(--surface-overlay)]`, `rounded-sheet`, `shadow-pop`,
  `border-line`; active row `bg-surface-selected`; mono `kbd` hints. Mirrors the
  CommandPalette look. **Semantic tokens only → neev + neev-dark inherit for free.**
- **Smart-suggest chip:** clay/`celebrate` accent, `rounded-full` pill, zap glyph;
  tokenized (no hex).
- **Verify both in neev light + neev-dark** (mock-owner preview recipe).

## Error handling

- Malformed slash command → inline usage hint, message not sent.
- Suggestion suppressed on negation keywords (ported guard).
- A failed `sendProposal` reuses the hook's existing optimistic `pending`
  `'failed'` + retry path — no new error surface needed.

## Testing & acceptance

- `slash.ts` / `suggest.ts`: faithful unit-test ports (table-driven).
- `SlashMenu`: opens on `/`, filters, ↑/↓/Enter/Esc, click-select, listbox a11y.
- `ChatComposer`: menu shows on `/`; parse-on-send calls `onSendProposal`;
  suggestion chip calls `onSendProposal`; ordinary text still calls `onSend`.
- Suite stays green; `tsc -b --noEmit && vitest run --retry=2 && npm run build &&
  npm run budget` all pass.
- Visually verified in neev light + dark.

## Acceptance criteria (definition of done)

1. `/att 24`, `/del cement 50 bori ABC`, `/pay 45000 ramesh`, `/inv 85000 sharma`
   each send a committed capture via `sendProposal`.
2. Typing `/` shows the menu; keyboard + click complete a command; Esc dismisses.
3. Typing "cement 50 bori aaya" surfaces a one-tap delivery chip; tapping it
   sends the capture. A negation ("cement khatam") shows no chip.
4. Ordinary chat text is unchanged.
5. All new UI is Neev-skinned and AA in light + dark; tests + build + budget green.
