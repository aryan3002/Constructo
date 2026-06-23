# Web Chat Phase D — Supervisor Command Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the supervisor's five in-chat command tools (brief pin, radar, recap, per-card disputes, action-items) to the web chat, Neev-styled, against existing backend endpoints — zero backend changes.

**Architecture:** Three API clients (extend `api/chat.ts`; new `api/disputes.ts`, `api/actionItems.ts`) + standalone surfaces (`BriefPin`, `RadarDrawer`, `RecapDrawer`, `ActionItemsDrawer`, `DisputeModal`) reusing `Drawer`/`Modal`/`Toast`. Built bottom-up, then wired into `ChatThread` (command bar + brief pin) and `ChatPage` (siteId + drawer state) + `CaptureCard` (dispute/make-to-do actions).

**Tech Stack:** React 18 + TS, Vite, TanStack Query, Tailwind (semantic tokens), Vitest + @testing-library/react.

## Global Constraints

- **Web-only, zero backend changes.** Endpoints already exist (`chat/brief`, `sentinel`, `recap`, `events/{id}/disputes`, `disputes/{id}/resolve|withdraw`, `action-items`).
- **Semantic tokens only — no hardcoded hex.** neev + neev-dark both correct. Pills `rounded-full`. Use the existing chat vocabulary (`bg-surface-card`, `border-edge`, `text-text-primary/secondary/muted`, `bg-brand-subtle`, `text-brand-text`, `celebrate*`, `bg-info-bg`/`text-info`, `risk-fg`).
- **Site-scoped:** command bar + brief pin render only when the thread has a `site_id`. Hidden on company-wide groups.
- **RBAC:** brief/radar/recap/action-items/raise-dispute = all crew in chat; **resolve dispute = owner/pm only** (backend gates regardless). Use `useMeRole()`.
- **Disputes per capture-card** (no site-wide inbox).
- **Commit scoping:** `git add <explicit paths>` only.
- **Verify gate (from `constructo/web`):** `npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build && npm run budget`. Run vitest FROM `constructo/web`.

---

### Task D1: Chat insight clients — brief / sentinel / recap

**Files:** Modify `constructo/web/src/api/chat.ts`; Test `constructo/web/src/api/chatInsights.test.ts`.

**Interfaces — Produces:**
```ts
export interface ChatBriefRisk { kind: string; severity: string; message: string; evidence_event_ids: string[] }
export interface ChatBrief { site_id: string; risk_count: number; headline: string; risks: ChatBriefRisk[] }
export interface SentinelSignal { kind: string; severity: string; message: string; evidence_event_ids: string[] }
export interface SentinelResult { signals: SentinelSignal[] }
export interface Recap { site_id: string; days: number; event_counts: Record<string, number>; material_totals: Record<string, number>; worker_days: number | null; amount_total: number | null; open_disputes: number; summary: string }
// added to chatApi:
chatApi.brief(siteId: string): Promise<ChatBrief>
chatApi.sentinel(siteId: string, windowDays?: number): Promise<SentinelResult>
chatApi.recap(siteId: string, days?: number): Promise<Recap>
```

- [ ] **Step 1: Failing test** (`chatInsights.test.ts`) — stub fetch (pattern from `api/groups.test.ts`):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chatApi } from './chat'
function mockFetch(json: unknown){ const fn = vi.fn().mockResolvedValue({ ok:true, status:200, json: async()=>json } as Response); vi.stubGlobal('fetch', fn); return fn }
beforeEach(()=>vi.unstubAllGlobals())
describe('chat insight clients', () => {
  it('brief GETs /chat/brief?site_id', async () => { const f=mockFetch({site_id:'s1',risk_count:0,headline:'',risks:[]}); await chatApi.brief('s1'); expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/chat\/brief\?site_id=s1$/) })
  it('sentinel GETs /sentinel?site_id&window_days', async () => { const f=mockFetch({signals:[]}); await chatApi.sentinel('s1', 7); expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/sentinel\?site_id=s1&window_days=7$/) })
  it('recap GETs /recap?site_id&days', async () => { const f=mockFetch({site_id:'s1',days:1,event_counts:{},material_totals:{},worker_days:null,amount_total:null,open_disputes:0,summary:''}); await chatApi.recap('s1'); expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/recap\?site_id=s1&days=1$/) })
})
```
- [ ] **Step 2: Run, verify fail** — `cd constructo/web && npx vitest run src/api/chatInsights.test.ts` → FAIL.
- [ ] **Step 3: Implement** — add the interfaces + three methods to `chatApi` (using the file's existing private `request<T>`):
```ts
brief(siteId: string): Promise<ChatBrief> { return request<ChatBrief>(`/api/v1/chat/brief?site_id=${encodeURIComponent(siteId)}`) },
sentinel(siteId: string, windowDays = 1): Promise<SentinelResult> { return request<SentinelResult>(`/api/v1/sentinel?site_id=${encodeURIComponent(siteId)}&window_days=${windowDays}`) },
recap(siteId: string, days = 1): Promise<Recap> { return request<Recap>(`/api/v1/recap?site_id=${encodeURIComponent(siteId)}&days=${days}`) },
```
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `git add src/api/chat.ts src/api/chatInsights.test.ts && git commit -m "feat(web/chat): brief/sentinel/recap insight clients (Phase D T1)"`

---

### Task D2: Disputes client (`api/disputes.ts`)

**Files:** Create `constructo/web/src/api/disputes.ts`; Test `constructo/web/src/api/disputes.test.ts`.

**Interfaces — Produces:**
```ts
export type DisputeStatus = 'open' | 'resolved' | 'withdrawn'
export interface Dispute { id: string; event_id: string; site_id: string; raised_by: string | null; raised_by_role: string | null; reason: string; proposed_fields: Record<string, unknown> | null; status: DisputeStatus; resolved_by: string | null; resolution_note: string | null; resolved_fields: Record<string, unknown> | null; resolved_event_id: string | null; created_at: string; resolved_at: string | null }
export const disputesApi: {
  list(eventId: string): Promise<Dispute[]>
  raise(eventId: string, body: { reason: string; proposed_fields?: Record<string, unknown> }): Promise<Dispute>
  resolve(disputeId: string, body: { resolution_note?: string; resolved_fields?: Record<string, unknown> }): Promise<Dispute>
  withdraw(disputeId: string): Promise<Dispute>
}
```
- [ ] **Step 1: Failing test** — stub fetch; assert: `list` GET `/events/E/disputes`; `raise` POST `/events/E/disputes` body `{reason}`; `resolve` POST `/disputes/D/resolve` body `{resolution_note}`; `withdraw` POST `/disputes/D/withdraw`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — copy the local `request<T>` helper from `api/groups.ts` verbatim; implement the four methods at the paths above.
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** — `git add src/api/disputes.ts src/api/disputes.test.ts && git commit -m "feat(web/chat): disputes API client (Phase D T2)"`

---

### Task D3: Action-items client (`api/actionItems.ts`)

**Files:** Create `constructo/web/src/api/actionItems.ts`; Test `constructo/web/src/api/actionItems.test.ts`.

**Interfaces — Produces:**
```ts
export type ActionItemStatus = 'open' | 'done' | 'cancelled'
export interface ActionItem { id: string; site_id: string; title: string; detail: string | null; status: ActionItemStatus; created_by: string | null; created_by_ai: boolean; assignee_id: string | null; due_on: string | null; source_message_id: string | null; created_at: string; updated_at: string; completed_at: string | null }
export interface ActionItemCreate { site_id: string; title: string; detail?: string; assignee_id?: string; due_on?: string; source_message_id?: string }
export interface ActionItemPatch { title?: string; detail?: string; assignee_id?: string | null; due_on?: string | null; status?: ActionItemStatus }
export const actionItemsApi: {
  list(siteId: string, opts?: { status?: ActionItemStatus; mine?: boolean }): Promise<ActionItem[]>
  create(body: ActionItemCreate): Promise<ActionItem>
  update(id: string, patch: ActionItemPatch): Promise<ActionItem>
  remove(id: string): Promise<ActionItem>
}
```
- [ ] **Step 1: Failing test** — assert: `list` GET `/action-items?site_id=s1` (+ `&status=open&mine=true` when opts); `create` POST `/action-items` body; `update` PATCH `/action-items/{id}` body; `remove` DELETE `/action-items/{id}`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — local `request<T>` (as groups.ts); build the query string in `list` from opts.
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** — `git add src/api/actionItems.ts src/api/actionItems.test.ts && git commit -m "feat(web/chat): action-items API client (Phase D T3)"`

---

### Task D4: `BriefPin` (pinned risk card)

**Files:** Create `constructo/web/src/features/chat/insights/BriefPin.tsx` + test.

**Interfaces — Consumes:** `ChatBrief`, `ChatBriefRisk` (D1). **Produces:**
```ts
export interface BriefPinProps { brief: ChatBrief | undefined }  // renders null when undefined or risk_count===0
```
- [ ] **Step 1: Failing test** — `risk_count:0` → renders nothing; `risk_count:2` with risks → shows headline + each risk message + severity dots (role/text assertions).
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — a `rounded-sheet border border-edge bg-surface-card` card pinned at top; headline in `text-text-primary`; each risk a row with a severity dot (`bg-risk`/`bg-warn`/`bg-info` by severity) + `message`. Tokens only.
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** — `…BriefPin.tsx …BriefPin.test.tsx -m "feat(web/chat): BriefPin risk card (Phase D T4)"`

---

### Task D5: `RadarDrawer` (sentinel "what's slipping")

**Files:** Create `constructo/web/src/features/chat/insights/RadarDrawer.tsx` + test.

**Interfaces — Consumes:** `Drawer` (ui), `chatApi.sentinel`, `SentinelResult` (D1). **Produces:**
```ts
export interface RadarDrawerProps { open: boolean; onClose: () => void; siteId: string }
```
- [ ] **Step 1: Failing test** — mock `chatApi.sentinel` → 2 signals; open → Drawer shows each signal message; empty signals → "All clear". (Wrap in QueryClientProvider.)
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — `useQuery(['chat','sentinel',siteId], ()=>chatApi.sentinel(siteId), { enabled: open })`; Drawer title "What's slipping"; list signals with severity dots; "All clear" empty state.
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** — `-m "feat(web/chat): RadarDrawer (Phase D T5)"`

---

### Task D6: `RecapDrawer` ("last 24h")

**Files:** Create `constructo/web/src/features/chat/insights/RecapDrawer.tsx` + test.

**Interfaces — Consumes:** `Drawer`, `chatApi.recap`, `Recap` (D1). **Produces:**
```ts
export interface RecapDrawerProps { open: boolean; onClose: () => void; siteId: string }
```
- [ ] **Step 1: Failing test** — mock `chatApi.recap` → `{summary:'12 worker-days…', event_counts:{attendance:8,delivery:2}, open_disputes:1, ...}`; open → shows summary + counts; `open_disputes>0` → a flagged "1 open dispute" line.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — `useQuery(['chat','recap',siteId], ()=>chatApi.recap(siteId), { enabled: open })`; Drawer title "Last 24 hours"; summary line; event_counts rows; material_totals rows; worker_days / amount_total when present; open_disputes in `text-risk-fg` when >0.
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** — `-m "feat(web/chat): RecapDrawer (Phase D T6)"`

---

### Task D7: `ActionItemsDrawer` (+ make-to-do)

**Files:** Create `constructo/web/src/features/chat/actionitems/ActionItemsDrawer.tsx` + test.

**Interfaces — Consumes:** `Drawer`, `Button`, `useToast`, `actionItemsApi`, `ActionItem` (D3), `useQueryClient`. **Produces:**
```ts
export interface ActionItemsDrawerProps { open: boolean; onClose: () => void; siteId: string }
```
- [ ] **Step 1: Failing test** — mock `actionItemsApi.list` → 1 open + 1 done item; open → both render, open first; clicking the open item's toggle calls `update(id,{status:'done'})`; the "+ Add" flow (type a title, Add) calls `create({site_id, title})`. `created_by_ai` item shows a "Nivaan" badge. (QueryClient + Toast providers.)
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — `useQuery(['chat','actionItems',siteId], ()=>actionItemsApi.list(siteId), {enabled: open})`; render open items (sorted) then done; a circle toggle → `update(id,{status: item.status==='done'?'open':'done'})` then invalidate; an add row (title input + Add → `create`); errors → toast. `created_by_ai` → `bg-brand-subtle text-brand-text` "Nivaan" pill.
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** — `-m "feat(web/chat): ActionItemsDrawer (Phase D T7)"`

---

### Task D8: `DisputeModal` (raise / resolve / withdraw)

**Files:** Create `constructo/web/src/features/chat/disputes/DisputeModal.tsx` + test.

**Interfaces — Consumes:** `Modal`, `Button`, `useToast`, `disputesApi`, `Dispute` (D2), `useMe`/`useMeRole`, `useQueryClient`. **Produces:**
```ts
export interface DisputeModalProps {
  open: boolean
  onClose: () => void
  eventId: string
  contested: boolean           // from the card's event
  onChanged?: () => void        // parent invalidates the thread
}
```
**Behaviour:** on open, `disputesApi.list(eventId)`. If not contested → **raise** form (reason textarea → `raise(eventId,{reason})`). If contested → show the open dispute's reason; **owner/pm** see **Keep as recorded** (`resolve(id,{resolution_note})`) + **Accept correction** (`resolve(id,{resolved_fields: dispute.proposed_fields})`); the raiser sees **Withdraw** (`withdraw(id)`). On success → `onChanged?.()` + toast + close.
- [ ] **Step 1: Failing tests** — (a) not contested: typing a reason + "Raise" calls `raise(eventId,{reason:'wrong qty'})`; (b) contested + `useMeRole='owner'`: "Keep as recorded" calls `resolve`; (c) contested + `useMeRole='supervisor'` (not the raiser): no resolve buttons shown.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** per the behaviour above (gate resolve buttons on `useMeRole()==='owner'||'pm'`; gate withdraw on `dispute.raised_by===me.id`).
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** — `-m "feat(web/chat): DisputeModal raise/resolve/withdraw (Phase D T8)"`

---

### Task D9: `CaptureCard` actions (dispute + make-to-do)

**Files:** Modify `constructo/web/src/features/chat/CaptureCard.tsx` + its test.

**Interfaces — Consumes:** `DisputeModal` (D8), `actionItemsApi` (D3), `useToast`, `useMeRole`. Adds optional props to `CaptureCardProps`:
```ts
onChanged?: () => void   // thread invalidation after a dispute action
```
**Behaviour:** add an actions row/menu to the card: **Dispute** (or **Resolve** when `event.contested`) → opens `DisputeModal` with `eventId=event.id`, `contested=event.contested`; **Make a to-do** → `actionItemsApi.create({ site_id: <thread site>, title: event.summary, source_message_id: message.id })` → toast. (site id: the card has `message`/`event`; pass the thread `siteId` via a prop if needed — add `siteId?: string` to `CaptureCardProps`.)
- [ ] **Step 1: Failing tests** — a Dispute button renders + opens the modal; when `event.contested` the button reads "Resolve"; "Make a to-do" calls `actionItemsApi.create` with `source_message_id` + title.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — add the actions row (tokenized text buttons) + the `DisputeModal` mount (local open state); `Make a to-do` calls create + toast. Gate nothing on raise (any crew); the modal gates resolve.
- [ ] **Step 4: Run, pass** — also run `CaptureCard.test.tsx` fully (no regression).
- [ ] **Step 5: Commit** — `-m "feat(web/chat): CaptureCard dispute + make-to-do actions (Phase D T9)"`

---

### Task D10: Command bar + brief pin + ChatPage wiring

**Files:** Modify `ChatThread.tsx` (+ test), `ChatPage.tsx` (+ test).

**Interfaces:** `ChatThreadProps` gains `siteId?: string`. ChatThread renders, when `siteId`:
- the command bar (buttons **Radar**, **Recap**, **To-dos**) in the header (next to the existing Members button), owning `radarOpen`/`recapOpen`/`todosOpen` state + mounting `RadarDrawer`/`RecapDrawer`/`ActionItemsDrawer`;
- `<BriefPin brief={briefQuery.data} />` atop the message list, via `useQuery(['chat','brief',siteId], ()=>chatApi.brief(siteId), {enabled: !!siteId})`.
ChatPage passes `siteId` = `selectedConv.site_id ?? undefined` (works for site/homeowner/site-group; undefined for company-wide groups → no command bar/pin). Pass the same `siteId` down to `CaptureCard` via ChatThread so make-to-do has it.
- [ ] **Step 1: Failing tests** — ChatThread: with `siteId` set, Radar/Recap/To-dos buttons render and clicking each opens its drawer (mock the drawers shallowly, like ChatPage mocks ChatThread); without `siteId`, no command bar. ChatPage: site conv passes `siteId='site-abc'`; company-wide group passes `siteId=undefined`.
- [ ] **Step 2: Run, fail.**
- [ ] **Step 3: Implement** — add the header command bar (only when `siteId`), the brief query + `<BriefPin>`, the three drawers; thread `siteId` from ChatPage; pass `siteId` to `CaptureCard`.
- [ ] **Step 4: Run, pass** — `npx vitest run src/features/chat`.
- [ ] **Step 5: Commit** — `-m "feat(web/chat): command bar + brief pin + siteId wiring (Phase D T10)"`

---

### Task D11: Full Phase-D verification

- [ ] **Step 1: Gate** — `cd constructo/web && npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build && npm run budget`. Expected: clean, all green (ignore only the 3 pre-existing ReconcileDetail flakes), build OK, budget within limit.
- [ ] **Step 2: Visual (live backend already running)** — on a site thread: brief pin (if risks), Radar/Recap/To-dos drawers open with data, a capture card's Dispute/Resolve + Make-a-to-do, company-wide group shows no command bar. Screenshot light + dark.
- [ ] **Step 3: Commit** any verification-only tweaks — `-m "chore(web/chat): Phase D verification"`

---

## Self-Review (done)
- **Spec coverage:** clients (D1-3), brief pin (D4), radar (D5), recap (D6), action-items (D7), disputes modal (D8) + card actions (D9), command bar + wiring (D10), verify (D11). All five tools + per-card disputes + site-scoping + RBAC covered. ✓
- **Type consistency:** `ChatBrief/SentinelResult/Recap` (D1), `Dispute` (D2), `ActionItem` (D3) defined once, consumed unchanged. `siteId` threaded ChatPage→ChatThread→CaptureCard. Resolve gated on `useMeRole` owner/pm. ✓
- **Placeholders:** none — exact endpoints, interfaces, and test assertions throughout; impl steps name the concrete tokens/queries. ✓
