# Web Chat Phase B — Composer Power-Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add slash commands (with a desktop slash-menu) and a smart-suggest capture chip to the web chat composer, Neev-styled, calling the already-existing `useChatThread.sendProposal` — zero backend changes.

**Architecture:** Two framework-free pure helpers ported from mobile (`slash.ts` parser, `suggest.ts` smart-suggest) + one new presentational `SlashMenu` listbox popover. The existing `ChatComposer` owns all interaction state (menu open/active/usage-hint, suggestion) and routes resolved captures to a new `onSendProposal` prop wired through `ChatThread` to the hook's `sendProposal`.

**Tech Stack:** React 18 + TypeScript, Vite, TanStack Query, Tailwind (semantic tokens), Vitest + @testing-library/react.

## Global Constraints

- **Web-only, zero backend changes.** Reference: `constructo/backend/app/chat/router.py` already accepts `capture_type` + `fields`.
- **Semantic tokens only — no hardcoded hex.** Both `neev` (light) and `neev-dark` must render correctly. Pills use `rounded-full`.
- **English-first** copy.
- **Reference (mobile source of truth):** `constructo/mobile/src/capture/slash.ts`, `constructo/mobile/src/capture/suggest.ts` (+ their `__tests__`). Port logic verbatim; the mobile test files define exact expected shapes for edge cases.
- **Commit scoping:** `git add <explicit paths>` only — never `git add -A` (Phase A swept backend WIP this way).
- **Verify gate (run from `constructo/web`):** `npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build && npm run budget`.

---

### Task B1: Port the slash-command parser (`slash.ts`)

**Files:**
- Create: `constructo/web/src/features/chat/slash.ts`
- Test: `constructo/web/src/features/chat/slash.test.ts`
- Reference: `constructo/mobile/src/capture/slash.ts` (+ its test)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface ParsedCapture { capture_type: string; fields: Record<string, unknown> }
  export interface SlashError { error: 'usage'; command: string }
  export interface SlashCommand { cmd: string; aliases: string[]; label: string; usage: string }
  export const SLASH_COMMANDS: SlashCommand[]
  export function isSlash(text: string): boolean
  export function parseSlash(text: string): ParsedCapture | SlashError | null
  ```

- [ ] **Step 1: Read the mobile source + test** to copy exact grammar and edge-case shapes.

Run: open `constructo/mobile/src/capture/slash.ts` and its test file. Confirm it has **no `react-native` imports** (it is pure TS — safe to port verbatim).

- [ ] **Step 2: Write the failing test** (`slash.test.ts`) with the representative cases, plus any extra edge cases found in the mobile test:

```ts
import { describe, it, expect } from 'vitest'
import { parseSlash, isSlash, SLASH_COMMANDS } from './slash'

describe('isSlash', () => {
  it('detects a leading slash', () => {
    expect(isSlash('/att 24')).toBe(true)
    expect(isSlash('hello')).toBe(false)
    expect(isSlash('  /att')).toBe(false) // leading space = not a command
  })
})

describe('parseSlash', () => {
  it('returns null for non-commands', () => {
    expect(parseSlash('hello team')).toBeNull()
  })
  it('parses attendance', () => {
    expect(parseSlash('/att 24')).toEqual({ capture_type: 'attendance', fields: { headcount: 24 } })
  })
  it('parses attendance by trade', () => {
    expect(parseSlash('/att 12 mason 8 helper')).toEqual({
      capture_type: 'attendance',
      fields: { headcount: 20, by_trade: { mason: 12, helper: 8 } },
    })
  })
  it('parses delivery', () => {
    expect(parseSlash('/del cement 50 bori ABC')).toEqual({
      capture_type: 'delivery',
      fields: { material: 'cement', quantity: 50, unit: 'bori', vendor: 'ABC' },
    })
  })
  it('parses payment', () => {
    expect(parseSlash('/pay 45000 ramesh')).toEqual({ capture_type: 'payment', fields: { amount: 45000, to: 'ramesh' } })
  })
  it('parses invoice', () => {
    expect(parseSlash('/inv 85000 sharma')).toEqual({ capture_type: 'invoice', fields: { amount: 85000, vendor: 'sharma' } })
  })
  it('returns a usage error for an incomplete command', () => {
    const r = parseSlash('/att')
    expect(r).toMatchObject({ error: 'usage' }) // exact `command` value: match the mobile test
  })
})

describe('SLASH_COMMANDS', () => {
  it('exposes the four commands for the menu', () => {
    expect(SLASH_COMMANDS.map((c) => c.cmd).sort()).toEqual(['att', 'del', 'inv', 'pay'])
    for (const c of SLASH_COMMANDS) {
      expect(c.label).toBeTruthy()
      expect(c.usage).toBeTruthy()
    }
  })
})
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd constructo/web && npx vitest run src/features/chat/slash.test.ts`
Expected: FAIL ("Cannot find module './slash'").

- [ ] **Step 4: Port the implementation** — copy `constructo/mobile/src/capture/slash.ts` into `slash.ts` verbatim, then **add** the `SLASH_COMMANDS` metadata array the menu needs (if mobile lacks it):

```ts
export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: 'att', aliases: ['attendance'], label: 'Log attendance', usage: '/att 24  ·  /att 12 mason 8 helper' },
  { cmd: 'del', aliases: ['delivery'], label: 'Log a delivery', usage: '/del cement 50 bori ABC' },
  { cmd: 'pay', aliases: ['payment'], label: 'Log a payment', usage: '/pay 45000 ramesh' },
  { cmd: 'inv', aliases: ['invoice'], label: 'Log an invoice', usage: '/inv 85000 sharma' },
]
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd constructo/web && npx vitest run src/features/chat/slash.test.ts`
Expected: PASS. If the `/att` usage-error case mismatches, copy the exact expected shape from the mobile test.

- [ ] **Step 6: Commit**

```bash
git add constructo/web/src/features/chat/slash.ts constructo/web/src/features/chat/slash.test.ts
git commit -m "feat(web/chat): port slash-command parser (Phase B)"
```

---

### Task B2: Port the smart-suggest helper (`suggest.ts`)

**Files:**
- Create: `constructo/web/src/features/chat/suggest.ts`
- Test: `constructo/web/src/features/chat/suggest.test.ts`
- Reference: `constructo/mobile/src/capture/suggest.ts` (+ its test)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface CaptureSuggestion { capture_type: string; fields: Record<string, unknown>; label: string }
  export function suggestCapture(text: string): CaptureSuggestion | null
  ```

- [ ] **Step 1: Read the mobile source + test**; confirm it is pure TS (no `react-native` import).

- [ ] **Step 2: Write the failing test** (`suggest.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { suggestCapture } from './suggest'

describe('suggestCapture', () => {
  it('suggests a delivery from material + unit + number', () => {
    const s = suggestCapture('cement 50 bori aaya')
    expect(s?.capture_type).toBe('delivery')
    expect(s?.fields).toMatchObject({ material: 'cement', quantity: 50 })
    expect(s?.label).toBeTruthy()
  })
  it('suggests attendance from labour + number', () => {
    const s = suggestCapture('20 mistri aaye')
    expect(s?.capture_type).toBe('attendance')
    expect(s?.fields).toMatchObject({ headcount: 20 })
  })
  it('never suggests on a negation', () => {
    expect(suggestCapture('cement khatam ho gaya')).toBeNull()
    expect(suggestCapture('cement chahiye')).toBeNull()
  })
  it('returns null for plain talk', () => {
    expect(suggestCapture('good morning team')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `cd constructo/web && npx vitest run src/features/chat/suggest.test.ts`
Expected: FAIL.

- [ ] **Step 4: Port the implementation** verbatim from mobile `suggest.ts` (keep the EN+HI keyword tables and the negation polarity guard).

- [ ] **Step 5: Run the test, verify it passes**

Run: `cd constructo/web && npx vitest run src/features/chat/suggest.test.ts`
Expected: PASS (adjust assertions to the mobile keyword set if a case differs).

- [ ] **Step 6: Commit**

```bash
git add constructo/web/src/features/chat/suggest.ts constructo/web/src/features/chat/suggest.test.ts
git commit -m "feat(web/chat): port smart-suggest helper (Phase B)"
```

---

### Task B3: SlashMenu popover (presentational listbox)

**Files:**
- Create: `constructo/web/src/features/chat/SlashMenu.tsx`
- Test: `constructo/web/src/features/chat/SlashMenu.test.tsx`
- Reference (keyboard/listbox pattern): `constructo/web/src/components/CommandPalette/CommandPalette.tsx`

**Interfaces:**
- Consumes: `SlashCommand` from `./slash`.
- Produces:
  ```ts
  export interface SlashMenuProps {
    items: SlashCommand[]          // already filtered by the composer
    activeIndex: number            // composer owns keyboard state
    onHoverIndex: (i: number) => void
    onSelect: (cmd: SlashCommand) => void
  }
  export function SlashMenu(props: SlashMenuProps): JSX.Element | null
  ```

The composer owns open/active/query state (the textarea keeps focus). SlashMenu is purely presentational: renders nothing when `items` is empty.

- [ ] **Step 1: Write the failing test** (`SlashMenu.test.tsx`):

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlashMenu } from './SlashMenu'
import { SLASH_COMMANDS } from './slash'

describe('SlashMenu', () => {
  it('renders one option per item with a11y roles', () => {
    render(<SlashMenu items={SLASH_COMMANDS} activeIndex={0} onHoverIndex={() => {}} onSelect={() => {}} />)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(4)
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
  })
  it('renders nothing when empty', () => {
    const { container } = render(<SlashMenu items={[]} activeIndex={0} onHoverIndex={() => {}} onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('calls onSelect when an option is clicked', () => {
    const onSelect = vi.fn()
    render(<SlashMenu items={SLASH_COMMANDS} activeIndex={0} onHoverIndex={() => {}} onSelect={onSelect} />)
    fireEvent.click(screen.getAllByRole('option')[1])
    expect(onSelect).toHaveBeenCalledWith(SLASH_COMMANDS[1])
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd constructo/web && npx vitest run src/features/chat/SlashMenu.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `SlashMenu.tsx`** — an absolutely-positioned popover anchored above the composer input row, Neev-tokenized (mirrors CommandPalette styling):

```tsx
import type { SlashCommand } from './slash'

export interface SlashMenuProps {
  items: SlashCommand[]
  activeIndex: number
  onHoverIndex: (i: number) => void
  onSelect: (cmd: SlashCommand) => void
}

export function SlashMenu({ items, activeIndex, onHoverIndex, onSelect }: SlashMenuProps) {
  if (items.length === 0) return null
  return (
    <div className="absolute bottom-full left-0 z-30 mb-1 w-full max-w-md overflow-hidden rounded-sheet border border-edge bg-surface-card shadow-pop">
      <ul role="listbox" aria-label="Slash commands" className="max-h-60 overflow-y-auto p-1">
        {items.map((c, i) => (
          <li key={c.cmd} role="option" aria-selected={i === activeIndex}>
            <button
              type="button"
              onMouseEnter={() => onHoverIndex(i)}
              onMouseDown={(e) => { e.preventDefault(); onSelect(c) }}
              className={`flex w-full items-center justify-between gap-3 rounded-control px-3 py-2 text-left font-body text-small ${
                i === activeIndex ? 'bg-surface-selected text-text-primary' : 'text-text-primary hover:bg-surface-hover'
              }`}
            >
              <span className="font-medium">/{c.cmd}<span className="ml-2 text-text-muted">{c.label}</span></span>
              <span className="font-mono text-micro text-text-muted">{c.usage}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

(`onMouseDown` + `preventDefault` keeps textarea focus so the menu click doesn't blur the input.)

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd constructo/web && npx vitest run src/features/chat/SlashMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/features/chat/SlashMenu.tsx constructo/web/src/features/chat/SlashMenu.test.tsx
git commit -m "feat(web/chat): SlashMenu listbox popover (Phase B)"
```

---

### Task B4: Integrate slash menu + parse-on-send + smart-suggest into `ChatComposer`

**Files:**
- Modify: `constructo/web/src/features/chat/ChatComposer.tsx`
- Modify (extend): `constructo/web/src/features/chat/ChatComposer.test.tsx`

**Interfaces:**
- Consumes: `parseSlash`, `isSlash`, `SLASH_COMMANDS` from `./slash`; `suggestCapture` from `./suggest`; `SlashMenu` from `./SlashMenu`.
- Produces: new required prop on `ChatComposerProps`:
  ```ts
  onSendProposal: (captureType: string, fields: Record<string, unknown>) => void
  ```

**Behaviour to implement (fill the `PHASE_B_*` slots):**
- Menu open when `text` matches `/^\/\w*$/` (a slash + the command word, no space yet). Filter `SLASH_COMMANDS` where `cmd`/aliases start with the typed prefix.
- Keyboard (in the textarea `onKeyDown`, only while menu open): `ArrowDown`/`ArrowUp` move `activeIndex` (clamped); `Enter`/`Tab` complete the active command → set text to `/${cmd} ` and close menu (`preventDefault`); `Escape` closes the menu.
- On send: `const parsed = parseSlash(text)`. If `parsed && 'error' in parsed` → `setUsageHint(...)`, do not send. Else if `parsed` → `onSendProposal(parsed.capture_type, parsed.fields)` + clear. Else → `onSend(text)` (existing path).
- Suggestion: `const suggestion = useMemo(() => (isSlash(text) ? null : suggestCapture(text)), [text])`. Render one amber chip in the smart-suggest slot; click → `onSendProposal(suggestion.capture_type, suggestion.fields)` + clear text. Use `--celebrate`/clay accent, `rounded-full`.

- [ ] **Step 1: Write failing tests** (add to `ChatComposer.test.tsx`):

```tsx
it('shows the slash menu when the text is a bare command', () => {
  render(<ChatComposer {...baseProps} />)
  fireEvent.change(screen.getByPlaceholderText('Message…'), { target: { value: '/at' } })
  expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeInTheDocument()
})

it('parses a slash command on send → onSendProposal, not onSend', () => {
  const onSend = vi.fn(); const onSendProposal = vi.fn()
  render(<ChatComposer {...baseProps} onSend={onSend} onSendProposal={onSendProposal} />)
  const ta = screen.getByPlaceholderText('Message…')
  fireEvent.change(ta, { target: { value: '/att 24' } })
  fireEvent.keyDown(ta, { key: 'Enter' })
  expect(onSendProposal).toHaveBeenCalledWith('attendance', { headcount: 24 })
  expect(onSend).not.toHaveBeenCalled()
})

it('sends ordinary text via onSend', () => {
  const onSend = vi.fn(); const onSendProposal = vi.fn()
  render(<ChatComposer {...baseProps} onSend={onSend} onSendProposal={onSendProposal} />)
  const ta = screen.getByPlaceholderText('Message…')
  fireEvent.change(ta, { target: { value: 'good morning' } })
  fireEvent.keyDown(ta, { key: 'Enter' })
  expect(onSend).toHaveBeenCalledWith('good morning')
  expect(onSendProposal).not.toHaveBeenCalled()
})

it('offers a smart-suggest chip and sends it as a capture', () => {
  const onSendProposal = vi.fn()
  render(<ChatComposer {...baseProps} onSendProposal={onSendProposal} />)
  fireEvent.change(screen.getByPlaceholderText('Message…'), { target: { value: 'cement 50 bori aaya' } })
  fireEvent.click(screen.getByRole('button', { name: /log delivery/i }))
  expect(onSendProposal).toHaveBeenCalledWith('delivery', expect.objectContaining({ material: 'cement', quantity: 50 }))
})
```

Add `onSendProposal: vi.fn()` to the shared `baseProps` so existing tests keep compiling.

- [ ] **Step 2: Run, verify failure**

Run: `cd constructo/web && npx vitest run src/features/chat/ChatComposer.test.tsx`
Expected: FAIL (prop missing / menu not rendered).

- [ ] **Step 3: Implement** the behaviour above in `ChatComposer.tsx` (add `onSendProposal` to props; add `menuOpen`/`activeIndex`/`usageHint` state; render `<SlashMenu>` in the slash slot and the chip in the smart-suggest slot; update `handleSend` + `handleKeyDown`).

- [ ] **Step 4: Run, verify pass**

Run: `cd constructo/web && npx vitest run src/features/chat/ChatComposer.test.tsx`
Expected: PASS (all old + new tests).

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/features/chat/ChatComposer.tsx constructo/web/src/features/chat/ChatComposer.test.tsx
git commit -m "feat(web/chat): composer slash-menu + parse-on-send + smart-suggest (Phase B)"
```

---

### Task B5: Wire `onSendProposal` through `ChatThread` + full Phase-B verification

**Files:**
- Modify: `constructo/web/src/features/chat/ChatThread.tsx` (one line — pass `onSendProposal={sendProposal}` to `ChatComposer`; `sendProposal` is already destructured from `useChatThread`).
- Modify (if needed): `constructo/web/src/features/chat/ChatThread.test.tsx`.

**Interfaces:**
- Consumes: `sendProposal: (captureType: string, fields) => void` (already returned by `useChatThread`).

- [ ] **Step 1: Add the prop wire** in `ChatThread.tsx`:

```tsx
<ChatComposer
  onSend={send}
  onSendMedia={sendMedia}
  onSendProposal={sendProposal}
  reply={reply}
  onCancelReply={() => setReply(null)}
  sending={sending}
  address={address}
/>
```

- [ ] **Step 2: Run the chat suite**

Run: `cd constructo/web && npx vitest run src/features/chat`
Expected: PASS.

- [ ] **Step 3: Full verification gate**

Run: `cd constructo/web && npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build && npm run budget`
Expected: typecheck clean, all tests pass, build succeeds, budget within limits.

- [ ] **Step 4: Visual verify (neev light + dark)** — add gitignored `constructo/web/.env.local` with `VITE_USE_MOCKS=true` + `VITE_NEEV_OWNER=true`; `preview_start`; mock-owner `+919800000001` / OTP `000000`; resize ≥768px; open a thread; type `/` (menu appears), `/att 24` (sends a capture), `cement 50 bori` (chip appears). Toggle `cstk.theme` dark. Screenshot both. Delete `.env.local` after.

- [ ] **Step 5: Commit**

```bash
git add constructo/web/src/features/chat/ChatThread.tsx constructo/web/src/features/chat/ChatThread.test.tsx
git commit -m "feat(web/chat): wire composer power-tools into ChatThread (Phase B complete)"
```

---

## Self-Review (done)

- **Spec coverage:** slash parser (B1), smart-suggest (B2), slash menu (B3), composer integration + parse-on-send + chip (B4), wiring + verify + visual (B5). Voice is explicitly out of scope per spec. ✓
- **Type consistency:** `onSendProposal(captureType, fields)` matches `useChatThread.sendProposal`'s `(captureType: string, fields: Record<string, unknown>)`; `ParsedCapture.capture_type/fields` feed it directly. ✓
- **Placeholders:** none — port tasks name their source-of-truth file; new code is shown. ✓
