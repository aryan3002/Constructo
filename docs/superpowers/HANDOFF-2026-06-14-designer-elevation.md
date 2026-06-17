# HANDOFF — Designer Workspace + Register: finish the "B+ → A" elevation

**Date:** 2026-06-14 · **For:** a fresh agent continuing in a new chat session.
**Goal (verbatim user intent):** provide the *best work opus 4.8 max can do* for (1) the **Drawings & Documents register** and (2) the **Designer / Construction-Engineer `/designer` workspace** — intake + **selection decisions (designer proposes, owner commits)** — expand it on web to be the best work yet, then **self-critique and, if it isn't the best, make it the A.** The `designer` role **is the existing `architect` role** (same thing).

---

## 1. Current state (all SHIPPED work is on `main`)

- **Everything built so far is merged to `main`** — merge commit **`00cd1bd`** (PR #191), 2026-06-14. Backend **1143** tests + web **387** green; ruff/lint/build/budget clean; single linear alembic head.
- A branch **`feat/designer-elevation`** exists off `main` (currently empty) for the remaining elevation — or just branch fresh off `main`.
- **Self-critique was already run** (rigorous opus critic). Verdict: **"a strong B+ that the spec promised as an A."** The **two P0** gaps it found are already fixed + on main. The **B+ → A elevation backlog (§3) is what REMAINS** — building it is the unfinished part of the goal.

### What's on `main` (done + reviewed)
- **W5 Reports + PDF** — `/reports`, WeasyPrint pipeline, branded DPR-pack + Site-progress PDFs (deterministic), OTP Tally CSV, append-only `report_exports` audit.
- **Drawings & Documents register** — `/settings/documents`: append-only versioned drawings (`PublishedDrawing` supersede chain) + documents-with-expiry (`CompanyDocument`), then **elevated** (D6): drawing **detail Drawer** (preview + `TimelineItem` version history + linked site-changes + supersede-confirm), kind filter/badge, **expiry dashboard**, drag-drop, keyboard, sort, empty-state CTAs.
- **W6a consistency hardening** — `/auth/me` consolidated onto one `useMe()`/`qk.me()`; i18n'd SpecDesk + Settings; removed `More.tsx` emoji icons; removed dead Payments/Permits CRUD; vitest `asyncUtilTimeout=5s`.
- **Designer `/designer` workspace (D0–D6):**
  - **D0** flagship a11y primitives `src/ui/`: `Drawer`, `Modal`/`ConfirmDialog`, `ToastProvider`/`useToast` (`useDialog` = focus-trap/Esc/scroll-lock/return-focus + stacked-dialog stack guard + persistent toast live-region), `TabBar` (roving tabindex).
  - **D2 ★ Selections cockpit** (`features/designer/Selections.tsx`) — the propose→commit material-spec lifecycle. Spec lifecycle = `POST /api/v1/specs/{id}/route` (designer proposes) → `/approve {client_final_code}` (owner commits) → `/release`; derived `routing_status` draft→out_for_approval→approved→released/returned. Role-shaped: architect Routes/Releases, owner Approves/Returns (WC4: non-owner never approves).
  - **D3** Site-changes (`features/designer/SiteChanges.tsx`) — field→designer: impact note, link-to-drawing picker (auto new→linked), resolve.
  - **D4** `DesignerWorkspace.tsx` — `/designer` (3 tabs), architect lands here, `/spec-desk`→redirect, `TabBar`.
  - **D5** `Intake.tsx` — Labs-aware design brief (`designApi`, 404→null graceful degrade; brief/themes/decisions/materialize→Selections).
- **Elev-A (the 2 P0 fixes) — DONE + merged:**
  - Routing a spec now creates an owner **`Decision(kind=approval, spec_id)`** so it lands in `/approvals` + bell (migration `b5667a6814f3`; idempotent key `spec:{id}:route`; approve→resolve / reject→reject the linked Decision via the state machine). Helper: `app/specs/service.py`.
  - `SiteChangeOut.reported_by_name` resolves the UUID → name (batched, no N+1); web shows the name + "Site team" fallback (never a UUID).

---

## 2. The design spec & references
- **Design spec:** `docs/superpowers/specs/2026-06-14-designer-workspace-register-elevation.md` (also in the Obsidian vault `11-Contractor-Web-Experience/`).
- **Memory:** the `w5-w6-web-build` memory (auto-loaded) has the same backlog + gotchas.
- Earlier slice specs/plans: `docs/superpowers/specs/2026-06-14-w5-w6-web-design.md` + `docs/superpowers/plans/2026-06-14-*`.

---

## 3. ★ REMAINING — the B+ → A elevation backlog (THIS is the unfinished goal)

Do these on a fresh branch off `main`. All are frontend except where noted. Method: subagent-driven (implementer → spec-compliance review → code-quality review → fix), **commit after each item** (a big combined dispatch 500'd at 128 tool-calls — keep each dispatch focused).

### Elev-B — Selections cockpit (`features/designer/Selections.tsx`, `SpecRow.tsx`, `SelectionDrawer.tsx`, `RollupChips.tsx`)
1. **Optimistic, stay-open drawer (highest-value).** Today every action does `invalidate()` then `onClose()` — the drawer slams shut and is fed a STALE `line` prop. Fix: the drawer should **read the live line by id** from the current desk query data, and on an action **keep the drawer open** (invalidate + toast, no `onClose`) so the lifecycle pill + timeline visibly advance (routed → approved-with-committed-code → released). This is the moment of delight the surface is built around.
2. **Distinct 5th lifecycle tone.** `SpecRow.tsx` maps BOTH `approved` and `released` → StatusPill `ok` (same green). Add a 5th tone to `StatusPill` (`src/ui/StatusPill.tsx` + a token in `theme.css`, both modes) — e.g. a slate/ink "done/locked" tone for `released`; keep `approved` green.
3. **Real keyboard cockpit.** `useCockpitKeys` tracks `selectedId` but never `.focus()`/`scrollIntoView`, and every `SpecRow` is `tabIndex=0`. Match the working pattern in `features/documents/DocumentsPage.tsx` (roving `tabIndex={isSelected?0:-1}` + `rowRefs.current[next]?.focus()` + `scrollIntoView({block:'nearest'})`).
4. **Edit can change the material.** `SelectionDrawer.tsx` EditForm edits qty/unit/rate/wastage/notes but NOT the material — the actual selection. `specsApi.update` accepts `material_id`; `DeskLine` carries it. Add a material picker (reuse `GET /api/v1/materials` — see `features/admin/Materials.tsx`).
5. **Add-selection (originate).** `specsApi.create` + `specsApi.extract` (photo→AI-proposes) exist with full mocks but have ZERO UI callers — a designer can currently only act on pre-existing rows, not START a selection. Add "Add line" + "Add from photo". ⚠️ Both backend endpoints need a `component_id` (a Spec belongs to a Component→Space); **first check** how to list/choose components for a site (the desk groups by component, but unspecced components may need a components endpoint) — scope to what's achievable.

### Elev-C — cohesion + cross-links + polish
6. **Layout cohesion.** `SiteChanges` wraps in `max-w-2xl mx-auto` while `Selections`/`Intake` are full-bleed → the workspace visibly jumps width on tab switch. Make one consistent content width. Also `SiteChanges` still renders its own `<H1>` + site `<select>` even though D4 lifted the `SiteSwitcher` — remove the duplicate chrome.
7. **Bidirectional cross-links.** The drawing detail drawer shows linked site-changes, but the reverse (from a site-change / the picker, the linked drawing title is inert text) should be a **clickable chip → opens the register drawer**. And Intake's **materialize** success toast should offer **"View in Selections"** (`?tab=selections`) instead of stranding the user.
8. **Localize a leaked enum.** `DrawingDetailDrawer` renders `label={sc.status}` (raw `new`/`linked`/`resolved`) — use the localized `sitechanges.badge.*` keys (breaks en+hi parity in the cross-link surface).
9. **Drawer/Modal enter transition.** `Drawer.tsx`/`Modal.tsx` advertise a slide ("`animate-reveal` in") but mount with no `from` state, so they just appear. Add a real reduced-motion-safe enter/leave transition.
10. **Register responsive at tablet.** `DrawingRow`/`DocumentRow` lay all metadata + Open button in one `flex-wrap` row; at ~700–820px they crowd. Add an sm/md breakpoint (stack metadata under the title, pin the action right).

---

## 4. Deferred (original W5/W6 — separate from the elevation, lower priority)
- Payroll CSV + **email delivery** + **OCR full-text search** (need external services / providers).
- A broad **WCAG 2.2 AA sweep** across the whole console; a **perf/four-state** sweep; uneven **mock coverage** (Permits/Search/Attendance/Mukadam have no `USE_MOCKS` branch — README overstates "whole UI on mocks").
- **Playwright E2E** of the win-conditions + RBAC journeys.

---

## 5. How to work here (method + the gotchas that cost cycles)
- **Branch:** fresh off `main` (`git fetch origin && git checkout -b <name> origin/main`). PR + merge when green.
- **Gates** (run before claiming done / merging):
  - Backend (from `constructo/backend`): `uv run ruff check` && `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest -q`
  - Web (from `constructo/web`): `npm run build` && `npm test` && `npm run lint` && `npm run budget`
- **Gotchas:**
  - WeasyPrint (used by `/reports`) needs native libs: `brew install pango gdk-pixbuf libffi`; **local pytest must be prefixed `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib`** or the import fails.
  - Web has **no `npm run typecheck`** — the type gate is **`npm run lint`** (`tsc --noEmit`). Bundle budget ≤250KB gz entry.
  - Run backend commands **from `constructo/backend`** (a bare `uv run` at repo root errors `No module named 'rq'`).
  - DB env var is `DATABASE_URL`. Migrations must **round-trip up/down/up on a throwaway `pgvector/pgvector:pg16` Docker** (plain postgres fails — needs `CREATE EXTENSION vector`). Always `uv run alembic heads` (one head).
  - **i18n parity is compile-enforced** (`Record<TranslationKey,string>` in `hi.ts`) — every new `en.ts` key needs a `hi.ts` Hindi value.
  - The web mock: `web/.env.local` `VITE_USE_MOCKS=true` **leaks into vitest** — delete/rename it before `npm test`. To browser-preview the designer workspace in mock mode: set it, `preview_start "web"`, then in the page `localStorage['constructo.token']='dev'` + `localStorage['cstk.mock.role']='architect'`, navigate `/designer`, then remove `.env.local`.
  - **Commit incrementally**; keep subagent dispatches focused (a big combined task 500'd at 128 calls).
- **Invariants to preserve:** designer proposes / owner commits (role-shaped, never auto-commit); deterministic numbers (no LLM numbers, no fake %); append-only (supersede chains, audit rows); authority server-side surfaced as identity; tracking-only (no money moves); en+hi parity; light/dark; four-state contracts; WCAG.

---

## 6. Key file map
- Designer: `constructo/web/src/features/designer/{DesignerWorkspace,Selections,SpecRow,SelectionDrawer,RollupChips,SiteChanges,SiteChangeCard,SiteChangeDrawer,DrawingLinkPicker,Intake}.tsx`
- Register: `constructo/web/src/features/documents/{DocumentsPage,DrawingDetailDrawer,DrawingPreview,KindFilter,DocumentsTab,AddDocument,ExpiryDashboard}.tsx`
- Primitives: `constructo/web/src/ui/{Drawer,Modal,Toast,TabBar,StatusPill,TimelineItem}.tsx`, `useDialog.ts`
- APIs: `constructo/web/src/api/{specs,siteChanges,design,drawings,documents}.ts`
- Backend: `constructo/backend/app/{specs,site_changes,publish,documents,reports}/`, `app/specs/service.py`, `app/models/{spec,decision,site_change,company_document,report_export}.py`
