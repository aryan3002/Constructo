# Designer Workspace + Register Elevation — Design Spec ("best work")

**Date:** 2026-06-14 · **Branch:** `feat/web-w5-w6` · **Authored by:** Opus 4.8 (1M)

**Goal (user directive):** Build the best web work yet — (1) a flagship **Designer / Construction-Engineer `/designer` workspace** centered on **selection decisions (designer proposes → owner commits)**, and (2) **elevate the Drawings & Documents register** to flagship quality. The `designer` role is the existing **`architect`** role. After building, self-critique against "is this the best work?" and raise it.

---

## 1. The core insight (grounded in backend recon)

The **"designer proposes → owner commits" spine already exists** — it's the Spec lifecycle, and it's web-dark:

- A `Spec` line (material selection for an element, grouped by room) has `approval_status` (pending/approved/rejected) + `sent_at` (routed) + `released_at` + `client_final_code` (the owner's committed SKU). Its derived `routing_status` is **draft → out_for_approval → approved → released**, or **returned**.
- **Designer proposes:** `POST /api/v1/specs/{id}/route` (stamps `sent_at`, status→pending). Gated to `_EDIT_ROLES` (owner/pm/architect/supervisor).
- **Owner commits:** `POST /api/v1/specs/{id}/approve` `{status:"approved"|"rejected", client_final_code?}`. Gated to `_APPROVE_ROLES` (owner/pm/architect).
- **Designer releases:** `POST /api/v1/specs/{id}/release` (only when approved).
- Deterministic rollup (`costing.py`): per-room + grand totals, honest about unpriced lines.
- **Today the web `specsApi` only has `desk()` and `SpecDesk` is 100% read-only.** All seven action endpoints are backend-complete but unused.

So the flagship work is to turn this latent spine into a **real, beautiful, role-shaped selections cockpit** — the heart of the designer workspace — and surround it with the designer's other two jobs (site-condition changes, design intake).

---

## 2. The Designer Workspace — IA

A new route **`/designer`** (the `architect` role lands here; `/spec-desk` redirects to `/designer`). A cockpit with three tabs (the vault's "Intake · Selections · Site-Condition Changes"), **defaulting to Selections** (the daily work):

```
/designer
  ├─ Selections   (default)  — the material-spec cockpit; propose → commit lifecycle
  ├─ Site changes            — field→designer condition changes; link to a drawing revision; resolve
  └─ Intake                  — the design brief (Labs-aware: profiler brief if enabled, honest state if not)
```

Shell: `AppShell role="architect"` + `SiteSwitcher` header. Owner/PM can also reach `/designer` (they participate in the commit side). Capability: a new `manage_selections` is folded into the existing `manage_specs`; the owner additionally gets the **commit** affordance.

---

## 3. Shared UI primitives (elevate the design system first)

The console lacks three primitives every flagship surface needs. Build them as reusable, accessible `ui/` components (they serve the workspace AND the register):

- **`Drawer`** — right-side slide-over panel. Focus-trapped, `Esc`/overlay-click close, `aria-modal`, returns focus to opener, `animate-reveal` in, respects reduced-motion. Used for spec detail, drawing detail, site-change detail.
- **`Modal` / `ConfirmDialog`** — centered dialog, focus-trapped, a11y, for confirms (supersede protection, route-to-owner confirm, resolve confirm).
- **`ToastProvider` + `useToast()`** — replace the per-screen ad-hoc toast state with one accessible (`role="status"`, `aria-live`) provider mounted at the app root. Auto-dismiss, stacking, status variants.
- (Optional) **`Tabs`** — extract a reusable tablist (DocumentsPage + Designer both need it; today DocumentsPage inlines it).

All on Blueprint Light+Dark semantic tokens, 48px min-tap, `font-mono` tabular numerals, WCAG 2.2 AA focus rings.

---

## 4. Surface 1 — Selections cockpit (the flagship)

**Layout:** master-detail. Header (site selector + summary chips) → room-grouped spec schedule (master) → **spec Detail Drawer** on row click.

**Header summary chips** (deterministic, mono): `Grand total ₹X,XX,XXX` · `N awaiting owner` (out_for_approval) · `N ready to release` (approved, not released) · `N unpriced` (honest). No fake %.

**Master list** — room-grouped (Space.name). Each line: Element/label · Material (brand · colour / sku · finish) · Qty·Unit · Rate (mono) · Line total (mono) · **Status pill** (the 5-state `routing_status`: draft / out_for_approval / approved / released / returned, each a distinct StatusPill tone). Keyboard cockpit (↑/↓ move, Enter open drawer) reusing the reconcile pattern.

**Spec Detail Drawer** — full line: element + room, the material card (brand/sku/colour/finish/size, catalog link), qty/unit/rate/wastage → line total, notes, the lifecycle timeline (drafted → routed → approved/returned → released, with timestamps), and **role-shaped actions**:

- **Designer (architect/pm):**
  - *Edit* — material (pick from Materials catalog), qty, unit, rate, wastage, notes (`PATCH /specs/{id}`).
  - *Route to owner →* — when `draft`/`returned`: `POST /route` (propose). Confirm dialog. The single primary action; mirrors the approvals "Propose to owner" UX.
  - *Release to site* — when `approved`: `POST /release`. Confirm.
- **Owner (commits):**
  - When `out_for_approval`: **Approve** (`POST /approve {approved, client_final_code}` — owner stamps the committed SKU/code) · **Return** (`{rejected}` with a reason note). This is the *commit*. Never auto-commits.
- Both roles always see the full state; authority shapes the buttons (server-enforced; surfaced as identity — never show-and-disable).

**Capture affordances:** *Add from photo* (`POST /extract` — vision proposes a material + spec line; the designer confirms) and *Add line* (manual create). The extract result is a **proposal the human confirms** (AI proposes, human commits — never auto-applied).

**Web API to build (`specsApi`):** add `list(siteId)`, `update(id, patch)`, `route(id)`, `approve(id, {status, client_final_code})`, `release(id)`, `extract(siteId, file)`, and extend `desk()`'s `DeskLine` type to carry `routing_status`, `sent_at`, `released_at`, `notes`, `material_id`. **Backend gap:** `DeskLine` (the `/desk` response) is missing `routing_status` — add it server-side (tiny addition to the desk serializer) so the cockpit shows the lifecycle without a second call.

---

## 5. Surface 2 — Site changes (field → designer)

Net-new web (backend exists, zero web today). The designer's reality-reconciliation surface, and it **ties into the register**.

- **Feed:** site-condition changes filtered by status (new / linked / resolved) + site, newest first. Each card: room · title · the field note · photo (if any) · reported_by · status pill. "N new" needs-you count.
- **Detail Drawer:** the full note + photo (lightbox), and the designer's actions:
  - *Write impact* — the human design-impact note (`PATCH {impact}`; no LLM).
  - *Link to a drawing revision* — a **drawing picker** (lists the site's drawings from the register I built; pick one → `PATCH {linked_drawing_id}`; status auto-promotes new→linked). This closes the field→designer→drawing loop.
  - *Resolve* — `PATCH {status: resolved}` (confirm).
- **Web API to build (`siteChangesApi`):** `list({siteId?, status?})`, `get(id)`, `update(id, patch)`. Backend complete.

---

## 6. Surface 3 — Intake (design brief, Labs-aware)

The profiler/design engine is rich but **Labs-gated** (`enable_labs`) — it may be off in the pilot. So Intake is **availability-aware**:

- **Probe availability** (e.g. `GET /api/v1/design/profiles?site_id=` → if 404/disabled, render an honest state).
- **If available:** surface the latest **architect-audience brief** for the site — the brief headline + narrative + the deterministic taste/themes summary + version, the architect's **theme decisions** (approve/adjust/reject), and **"Materialize to specs"** (`POST /briefs/{id}/materialize` — proposes Spec rows; feeds the Selections cockpit). Read-focused; the full moodboard-ranking pipeline stays mobile/out-of-scope.
- **If not available:** an honest empty state — "Design intake (moodboard profiler) isn't enabled here. Selections and Site changes are your active surfaces." with a link to Selections. (No dead UI; honest abstain.)
- **Web API to build (`designApi`, availability-aware):** `profilesBySite(siteId)`, `brief(profileId, audience='architect')`, `themeDecision(themeId, decision)`, `materialize(briefId)` — all degrade gracefully.

---

## 7. Surface 4 — Elevate the Drawings & Documents register

Apply the highest-value elevations, reusing the new primitives:

1. **Drawing Detail Drawer** — replace inline expand with a Drawer: a **preview** (image `<img>` / PDF first page via `<embed>`; file-type badge for CAD), the **version-history timeline** (`TimelineItem` rail, newest→oldest, each version's date + change_note + open link), and any **linked site-changes** (the reverse link from Surface 2).
2. **Kind filter + badge** — a pill filter bar (plan/elevation/section/structural/electrical/plumbing/other) + a kind badge per drawing (the field exists, is unshown today).
3. **Supersede-protection confirm** — uploading a revision opens a `ConfirmDialog` ("This supersedes v2 — the old version stays reachable, never deleted. Continue?") before publishing. Reinforces the append-only invariant visibly.
4. **Expiry dashboard** — a summary strip on Documents: "N expired · N expiring ≤30d" (StatusPill risk/warn), click-to-scroll. Computed client-side with `useMemo`.
5. **Drag-drop upload** — a dashed drop zone (`border-primary` on dragover) wrapping the existing presign→PUT flow.
6. **Empty-state CTAs** — both tabs get `action={<Button>Upload your first drawing / Add a document</Button>}`.
7. **Site filter** — wire the SiteSwitcher's selected site to `listRegister(siteId)` / `listDocuments({siteId})` (API already supports it; page ignores it today).
8. **Keyboard nav + sort** — ↑/↓/Enter/`u`; sort by published-date / title / site.

---

## 8. Invariants (the product spine — non-negotiable)

1. **Designer proposes, owner commits.** The spec `route → approve` loop is role-shaped; never auto-commit; the owner stamps `client_final_code`. AI `extract` proposes; a human confirms.
2. **Deterministic numbers.** Rollups from `costing.py`; honest unpriced count; never an LLM number; no fake %.
3. **Append-only / evidence-anchored.** Drawing supersede chain; site-change audit; spec lifecycle timestamps. Nothing overwritten or hard-deleted.
4. **Authority server-side, surfaced as identity.** Role gates enforced on the backend; the UI shapes to the role (architect sees Route/Release, owner sees Approve) — never show-and-disable.
5. **Tracking-only** — no money moves. **Honest abstain** — Intake degrades honestly when Labs is off.
6. **Vernacular-first** (en+hi parity), **light/dark**, **four-state** contracts, **WCAG 2.2 AA**, keyboard-first, lazy-loaded chunks (budget held).

---

## 9. Build order (slices; each: subagent-driven, spec+quality review, verify)

- **D0 — Shared primitives:** `Drawer`, `Modal`/`ConfirmDialog`, `ToastProvider`/`useToast`, (Tabs). Tests.
- **D1 — Selections backend+client:** `routing_status` on `DeskLine` (backend); `specsApi` full action set; types. Tests.
- **D2 — Selections cockpit (flagship):** master-detail, lifecycle pills, role-shaped Route/Release/Approve/Return, rollup chips, Add-from-photo, keyboard. The centerpiece.
- **D3 — Site changes:** `siteChangesApi` + the feed + detail drawer + drawing-link picker + resolve.
- **D4 — Designer workspace shell + nav + landing:** `/designer` with the 3 tabs; architect lands here; `/spec-desk`→redirect; nav.
- **D5 — Intake (Labs-aware):** `designApi` + the brief view + materialize + honest-unavailable state.
- **D6 — Register elevation:** the 8 elevations on the existing register, reusing D0 primitives.
- **D7 — Verify + self-critique + elevate:** full gates, browser-confirm, then the "is this the best work?" pass — find weaknesses, raise the bar.

Determinism, role-shaping, and a11y are verified in every slice. en+hi parity compile-enforced. Backend changes additive + migration-free where possible (only `DeskLine` serializer touch + optional `manage_selections` cap).
