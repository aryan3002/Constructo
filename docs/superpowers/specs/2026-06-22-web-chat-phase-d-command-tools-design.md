# Web Chat — Phase D: Supervisor Command Tools (Brief / Radar / Recap / Disputes / Action-Items)

- **Date:** 2026-06-22
- **Status:** Approved (design)
- **Branch:** `feat/web-chat-phase-d` (stacked on `feat/web-chat-phase-bc` / PR #207)
- **Backend changes:** none (web-only)
- **Predecessor:** Phase A (PR #205), Phase B+C (PR #207).

## Context

The supervisor mobile app exposes five in-chat "command tools" against existing
backend endpoints. The web chat has **none** of them yet (verified: no web client
fn or route for `/chat/brief`, `/sentinel`, `/recap`, `/action-items`,
`/disputes`). Phase D brings all five to the web chat, **web-only / zero backend
changes**, mirroring the mobile UX adapted to the desktop two-pane.

These tools are **site-scoped**. They appear only when the open thread resolves to
a `site_id` (site crew threads, site-groups, homeowner channels) — hidden on
company-wide groups. `ChatPage` already knows `selectedConv.site_id`.

## Goal

Owner / supervisor / architect (everyone in the web chat) get, inside a site
thread: a pinned **brief**, a **radar** ("what's slipping"), a **recap**
("last 24h"), per-card **disputes** (raise/resolve), and an **action-items**
panel (+ make-from-message). Neev-styled, reusing `Drawer`/`Modal`/`Toast`.

## Scope

**In (all five):**
- API clients (existing endpoints): `chatApi.brief/sentinel/recap`, new `api/disputes.ts`, new `api/actionItems.ts`.
- **BriefPin** — pinned card atop a site thread when `risk_count > 0`.
- **Command bar** in the thread header (site threads): **Radar**, **Recap**, **To-dos** buttons (alongside the existing **Members** for groups).
- **RadarDrawer** (sentinel signals) + **RecapDrawer** (recap totals).
- **ActionItemsDrawer** (open-first list, toggle done, add, assign) + **"Make a to-do"** action on a message/card.
- **Disputes per capture-card**: a gated **Dispute** (raise) / **Resolve** action on `CaptureCard` → **DisputeModal** (keep vs accept-correction / withdraw).

**Out (explicit):**
- **No site-wide disputes inbox** (the only variant needing a new backend list endpoint). Disputes are per-card, exactly like mobile → zero-backend.
- Any backend change. `@nivaan` / voice / camera (separate concerns).

## Decisions

- **Disputes are per-capture-card**, not a site-wide inbox — keeps Phase D
  zero-backend (backend has only per-event dispute list + raise + resolve +
  withdraw).
- **Radar = `GET /sentinel`** (the deterministic "what's slipping" signals), a
  distinct surface from the **brief** (`GET /chat/brief`, today's ranked risks).
  Both kept (mobile keeps both).
- **Drawers, not modals,** for radar/recap/action-items (lists; right slide-over
  keeps the thread visible). `DisputeModal` is a focused form → Modal.
- **Site resolution:** `ChatThread` gains a `siteId?: string` prop (set by
  `ChatPage` from `selectedConv.site_id`); the command bar + brief pin render
  only when it's present.

## API layer

**Extend `api/chat.ts`** (GET-only, site-scoped):
```ts
export interface ChatBriefRisk { kind: string; severity: string; message: string; evidence_event_ids: string[] }
export interface ChatBrief { site_id: string; risk_count: number; headline: string; risks: ChatBriefRisk[] }
export interface SentinelSignal { kind: string; severity: string; message: string; evidence_event_ids: string[] }
export interface SentinelResult { signals: SentinelSignal[] }
export interface Recap { site_id: string; days: number; event_counts: Record<string, number>; material_totals: Record<string, number>; worker_days: number | null; amount_total: number | null; open_disputes: number; summary: string }
chatApi.brief(siteId): GET /api/v1/chat/brief?site_id=
chatApi.sentinel(siteId, windowDays=1): GET /api/v1/sentinel?site_id=&window_days=
chatApi.recap(siteId, days=1): GET /api/v1/recap?site_id=&days=
```

**New `api/disputes.ts`:**
```ts
export type DisputeStatus = 'open' | 'resolved' | 'withdrawn'
export interface Dispute { id; event_id; site_id; raised_by; raised_by_role; reason; proposed_fields; status: DisputeStatus; resolved_by; resolution_note; resolved_fields; resolved_event_id; created_at; resolved_at }
disputesApi.list(eventId): GET /api/v1/events/{eventId}/disputes
disputesApi.raise(eventId, { reason, proposed_fields? }): POST /api/v1/events/{eventId}/disputes
disputesApi.resolve(disputeId, { resolution_note?, resolved_fields? }): POST /api/v1/disputes/{disputeId}/resolve  // owner/pm
disputesApi.withdraw(disputeId): POST /api/v1/disputes/{disputeId}/withdraw  // raiser
```

**New `api/actionItems.ts`:**
```ts
export type ActionItemStatus = 'open' | 'done' | 'cancelled'
export interface ActionItem { id; site_id; title; detail; status: ActionItemStatus; created_by; created_by_ai; assignee_id; due_on; source_message_id; created_at; updated_at; completed_at }
actionItemsApi.list(siteId, { status?, mine? }): GET /api/v1/action-items?site_id=&status=&mine=
actionItemsApi.create({ site_id, title, detail?, assignee_id?, due_on?, source_message_id? }): POST /api/v1/action-items
actionItemsApi.update(id, patch): PATCH /api/v1/action-items/{id}
actionItemsApi.remove(id): DELETE /api/v1/action-items/{id}  // soft → cancelled
```

## UI surfaces (reuse `Drawer`/`Modal`/`Toast`/`StatusPill`/`Button`)

- **`features/chat/insights/BriefPin.tsx`** — pinned card at the top of the message list on a site thread; headline + ranked risks (severity dots). Hidden when `risk_count===0` (calm).
- **`features/chat/insights/RadarDrawer.tsx`** — Drawer listing sentinel signals; "All clear" when empty.
- **`features/chat/insights/RecapDrawer.tsx`** — Drawer: summary line + event counts + material totals + worker-days + amount + open-disputes.
- **`features/chat/actionitems/ActionItemsDrawer.tsx`** — Drawer: open-first list, toggle done (PATCH status), add (create), assign; "Nivaan" badge on `created_by_ai`.
- **`features/chat/disputes/DisputeModal.tsx`** — raise (reason [+ optional proposed value]) and resolve (keep-as-recorded vs accept-correction) / withdraw.
- **Thread command bar** — a button row in the `ChatThread` header (site threads): Radar · Recap · To-dos (+ Members for groups). Owns the drawer open-state.
- **`CaptureCard.tsx`** (extend) — a gated action: **Dispute** (raise; any crew) / **Resolve** (when `contested`; owner/pm) → `DisputeModal`; and **Make a to-do** (→ `actionItemsApi.create` with `source_message_id`).

## RBAC / site-scoping (UI mirrors backend, the real gate)
- Brief / radar / recap / action-items / **raise** dispute: all crew in the chat (owner+supervisor+architect), **site threads only**.
- **Resolve dispute: owner/pm only** (backend 403-gates regardless).
- Command bar + brief pin hidden when the thread has no `site_id` (company-wide group).

## Data flow
- Brief/radar/recap: site-keyed TanStack queries (`['chat','brief',siteId]` etc.), fetched on drawer open (radar/recap `enabled: open`) / on thread mount (brief).
- Disputes: `DisputeModal` reads `disputesApi.list(eventId)`; raise/resolve/withdraw → on success invalidate the thread (`['chat','thread',addrKey]`) so the card's `contested` flag refreshes + toast.
- Action-items: `['chat','actionItems',siteId]`; mutations invalidate it.

## Error handling
- All mutations: errors → `useToast({status:'risk'})`; dispute resolve `403` → toast (shouldn't happen via gating).
- Empty states: brief hidden when calm; radar "All clear"; recap "Nothing logged in this window"; action-items "No to-dos yet".

## Testing & verification
Unit + RTL per surface (mock the api clients): client verb/path/body; brief-pin shows/hides on risk_count; radar/recap render + empty; action-items list/toggle/add; dispute raise vs resolve branches + owner/pm gating; command-bar appears only with a siteId. Neev tokens (light + dark). Gate (from `constructo/web`): `tsc -b && vitest run --retry=2 && build && budget`.

## Acceptance criteria
1. On a site thread, a brief pin shows when there are risks; Radar/Recap/To-dos buttons open their drawers with live data; empty states are calm.
2. A capture card offers Dispute (any crew) and, when contested, Resolve (owner/pm only); resolving keeps or supersedes the value; the card's contested flag updates.
3. "Make a to-do" on a message creates a linked action item; the To-dos drawer lists/toggles/adds/assigns.
4. Company-wide groups show no command bar / brief pin.
5. All new UI is Neev-skinned (light + dark); tests + build + budget green; zero backend changes.

## Decomposition (one plan, ~13 tasks)
D1 chat insight clients (brief/sentinel/recap) → D2 disputes client → D3 action-items client → D4 BriefPin → D5 RadarDrawer → D6 RecapDrawer → D7 command bar + ChatThread/ChatPage siteId wiring → D8 ActionItemsDrawer + make-to-do → D9 DisputeModal + CaptureCard actions → D10 full verification. Built inline, TDD, per-task commits; final whole-branch review.
