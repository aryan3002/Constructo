# Web — State of the Ground (Contractor / Owner Console)

**Date:** 2026-06-20
**Scope:** The web surface only — `constructo/web` (React + Vite + TS), the FastAPI backend that feeds it, the `Neev Desktop` UI/UX prototype, and the vault web plans (`11-Contractor-Web-Experience`).
**How this was produced:** I ran the actual web build/test/typecheck, read the backend routers + migrations, read the prototype source, and cross-checked the vault. Where the vault and the code disagree, **the code wins** and I say so.

---

## 0. TL;DR — read this first

Your instinct ("nothing is production-ready on the web") is **directionally correct, but not because the web is empty.** The opposite is true: the web app is **substantially built and genuinely wired to the real backend** — it builds clean, type-checks clean, and passes **406 tests**. What makes it *not* production-ready is a specific, nameable set of gaps. There are **two independent axes** to understand:

**Axis 1 — Engineering / functional readiness: HIGH (~70–80%).**
The contractor web console is real software, not mocks. ~25 routes, 7 roles, ~50 backend endpoints consumed, optimistic mutations, OTP step-up gating, virtualized reconcile cockpit, PDF reports, drawings register — all merged into `main` and passing tests.

**Axis 2 — Design / experience readiness vs your new prototype: LOW (~10–15%).**
The shipped app wears the **old "Blueprint" skin** (Anek sans, cool semantic tokens, light+dark, SaaS density). Your **`Neev Desktop` prototype** defines a *different, warmer* target — "Calm Cockpit" (Eczar serif, sand/sage/terracotta, editorial owner-command-center voice: *"3 decisions need your call."*). **None of that prototype language is in the live web app.**

**So "where we stand" =** a functional contractor console on the wrong skin, plus a short list of true production blockers. The single biggest blocker is **authentication is a dev no-op** (OTP is hardcoded `000000`, no SMS provider wired) — until that's fixed, the web cannot be exposed publicly regardless of how good it looks.

**The honest one-line answer:** *We have a working contractor web app that nobody can safely deploy yet (auth + config), and it doesn't look like the Neev experience you designed.* Both are fixable, and the functional foundation means we're closing a gap, not starting from zero.

---

## 1. The contradiction I had to resolve (so you trust the rest)

The vault's web HANDOFF and phase plan (`11-Contractor-Web-Experience/`) are dated **June 5** and say W5 (Reports, Drawings, Documents) is "NOT STARTED" and the Designer surface is "BLOCKED on backend enums."

**That is stale by two weeks.** Between June 14–19 that work was actually built and merged:
- `00cd1bd` — **PR #191** merged `feat/web-w5-w6` (Reports + Drawings).
- `5eabc84` — Drawings register elevation (detail drawer, version timeline, supersede).
- Designer workspace + `architect` role — merged (the "blocking enums" landed).
- `b8b4ea2` / `ce8bdab` — Reports PDF + Company Documents routers on the backend.

I confirmed this by **running the current code**, not by reading the plan. So: **ignore the vault's "remaining work" list — it describes a June-5 world.** This document is the corrected, June-20 ground truth. (The vault is still valuable as the *design spec / north star* — just not as a status tracker.)

---

## 2. The live web app — what's actually there (ground truth)

**Stack:** React 18 + TypeScript + **Vite** (not Next), TanStack Query v5, Zustand, react-hook-form + zod, TanStack Table + virtual, Tailwind on a semantic-token theme, Vitest + Testing Library. Routing is `react-router` v6 (~25 routes, heavy surfaces code-split).

**Roles served (7):** `owner`, `pm`, `architect`, `supervisor`, `accountant`, `procurement`, `labor_contractor`. The homeowner is deliberately **not** a web role (they live in the mobile app). RBAC is a **client-side capability map** that shapes UI only — the backend is asserted to be the real authority (this needs verification; see §4).

**Build / test / typecheck — all run, all green:**

| Command | Result |
|---|---|
| `tsc -b --noEmit` (typecheck) | ✅ PASS — 0 errors |
| `vitest run` (tests) | ✅ PASS — **406 tests / 69 files, 0 failures** |
| `vite build` (prod build) | ✅ PASS — entry **~139 KB gz** (well under the 250 KB budget) |
| `npm run budget` (bundle gate) | ✅ PASS |

**Backend wiring verdict:** **Real, not mocks.** MSW is not used anywhere; the only "mock" path is a `VITE_USE_MOCKS` flag that is **off**. With the flag off, every `src/api/*` module fetches the real FastAPI. ~50 distinct `/api/v1/*` endpoints are consumed.

**Surface readiness (the important table):**

| Surface | Status | Note |
|---|---|---|
| Login (phone + OTP) | ✅ Wired | Real JWT; but OTP prefilled `000000` (see blockers) |
| Owner Home / Command Center (NeedsYou, Portfolio, ThisWeek, Decision Log) | ✅ Wired | `dashboard/home`; optimistic decide w/ rollback |
| PM "Today" | ✅ Wired | Propose-not-approve gating |
| Approvals inbox (+ batch, assign, SLA) | ✅ Wired | Now fed by spec routing |
| Auto-DPR review (draft → review → send) | ✅ Wired | Never auto-sends; confidence meter |
| Reconcile cockpit (3-way match, keyboard-first) | ✅ Wired | Virtualized; proofs side-by-side |
| Tally export | ✅ Wired | **OTP step-up gated** |
| Reports & PDF (DPR, progress) | ✅ Wired | Payroll report = "coming soon" |
| Payments / financial tracking | ✅ Wired | Tracking-only (no payment rail — by design) |
| Sites list / detail, events | ✅ Wired | |
| Supervisor capture / Mukadam attendance | ✅ Wired | Optimistic offline queue |
| Designer workspace (specs desk, route/approve/release, site-changes, publish drawings) | ✅ Wired | The "blocked" surface — now live |
| Documents + Drawings register (R2 presign/publish, version timeline) | ✅ Wired | |
| Notifications bell | ✅ Wired | 30s poll (no SSE) |
| Admin console | 🟡 Partial | **7 of 10 sections wired** (Company, Team/roles, Baselines, Vendors, Materials, Notifications, Billing); **Integrations / Audit-log / Security = "coming soon"** |
| Settings | 🟡 Partial | Profile/name/language wired; theme + notification prefs are **local-only stubs** |
| Designer Intake (design brief / profiler) | 🟡 Labs | Only works if backend `enable_labs` is on; else honest empty state |

**Nothing material is stranded on a branch.** Every named web branch (`feat/designer-elevation`, `feat/designer-a-close`, `feat/web-w5-w6`, `feat/phase0-otp-lockdown`) is **0 web-commits ahead of `main`** — `main` is the source of truth and is fully up to date. The many `feat/homeowner-*`, `feat/chat-*`, `feat/owner-calm-cockpit` branches are mobile/other-app, not contractor-web.

---

## 3. The production-readiness gap (the real blockers, prioritized)

These are what actually stand between "builds & passes tests" and "safe to put in front of a paying contractor."

**🔴 P0 — security / cannot deploy publicly until fixed**
1. **Auth is a dev no-op.** OTP is hardcoded `000000`, **no SMS provider is wired**, and `request-otp` always returns `sent=true`. The web login even **prefills `000000` and shows the code in a hint.** Effect: production login is currently *unauthenticated*. This is the #1 blocker, and it's a **backend** fix (wire an SMS/OTP provider + remove the dev bypass) plus a web cleanup (remove the prefill/hint). A `feat/phase0-otp-lockdown` branch exists — confirm it actually locks the backend, not just the UI.
2. **RBAC enforcement is asserted but unverified.** The web caps are UI-only by design; this is only safe if **every** FastAPI endpoint enforces role/tenant server-side. Needs an explicit backend audit before relying on it.
3. **CORS is broad in prod config** (permissive localhost/LAN regex with `allow_credentials=true`, `allow_methods=["*"]`). Fine for dev; tighten for a public web origin.
4. **JWT stored in `localStorage`** — XSS-exposable. Acceptable for a closed pilot; harden (httpOnly cookie) before wide release.

**🟠 P1 — config / deployment**
5. **API base points at `localhost:8000`.** The prod (Azure Container Apps) URL is present but commented out in `.env`. Must be set per-environment before any real deploy.
6. **No web E2E / smoke in CI**, and **W6 polish never ran**: no WCAG 2.2 AA pass, no Lighthouse gate, no Playwright E2E (the plan's WC1–WC4 + RBAC suites). Unit tests are strong (406) but there's no end-to-end safety net.

**🟡 P2 — feature completeness (explicitly deferred)**
7. Admin **Integrations / Audit-log / Security** sections are "coming soon" (each needs a small backend + a form/grid).
8. Settings **notification preferences** don't persist server-side (local-only stub).
9. **Reports → payroll** export is a placeholder.
10. **Notifications use 30s polling**, not SSE (graceful, but not live).
11. **7 Hindi i18n keys** fall back to English (minor).

None of P2 blocks a pilot. P0 does. P1 is mechanical but mandatory.

---

## 4. The design gap — live "Blueprint" vs your "Neev / Calm Cockpit" prototype

This is the half of "not production-ready" that has nothing to do with bugs. **The app works; it doesn't yet feel like Neev.**

### What's live today (`constructo/web`) — "Blueprint"
- **Display font:** Anek Latin (sans). Body: Hind. Mono: Spline Sans Mono.
- **Palette:** cool, neutral **semantic tokens**; brand = amber; status spine ok/warn/risk/info.
- **Mode:** light **and** dark, "desk-density" SaaS layout.
- **Voice:** functional ("Approvals", "Reconcile", "Today").

### What your prototype defines (`Neev Desktop`) — "Calm Cockpit"
- **Display font:** **Eczar (serif)** — editorial headlines. Body: Hind. Mono: IBM Plex Mono.
- **Palette:** warm **sand canvas** (#FCFAF3) + **sage green** (primary/on-track) + **terracotta clay** (celebration) + **amber** (needs-you) + **red** (risk only). Rounded "pebbles, not boxes" (22px cards).
- **Mode:** light-only, warm radial sand wash, soft shadows, calm motion (`cubic-bezier(.22,.61,.36,1)`).
- **Voice:** owner-first and human — *"3 decisions need your call."* "Today for owners · Thursday, 12 June."

### What the prototype actually contains
The `Neev Desktop` prototype is a **dual-surface Owner Command Center**:
- **Desktop** (`desktop/*.jsx`): Brief (decisions + roll-ups), Sites (grid + detail w/ milestones & evidence), Specs (schedule + detail), Approvals (decision inbox), Decision Log (append-only timeline), Chat (two-pane), and modals (Proof, Decision flow, New Audit, Team).
- **Mobile** (`neev/`): the homeowner-style Calm-Cockpit phone app (Brief, Sites, Specs, Approvals, Chat, Audit hub/site/survey, Design profiler, Media, More).
- Sidebar + topbar shell with a **scope switcher** ("viewing as / lane / single site"), global search, proof-provenance modal, and a multi-action **Decision flow** (Approve → release · Hold → reason · Assign → person · Ask).

**Mapping to reality:** the prototype's desktop screens (Brief, Approvals, Decision Log, Specs, Sites, Chat) **already exist functionally** in the live web app — they're just rendered in Blueprint, not Calm Cockpit. So the design work is largely a **re-skin + editorial pass over an existing, wired information architecture**, not a from-scratch build. That's the good news: the hard part (data, state, mutations) is done.

### The strategic fork (the one real decision)
The prototype is **owner-centric**, but the live app is **multi-role contractor** (7 roles). So before building, we need your call on scope:
- **(A) Owner-first re-skin:** bring just the owner command-center surfaces onto Calm Cockpit (highest-impact, smallest blast radius, matches the prototype 1:1).
- **(B) Full contractor re-skin:** move all 7 roles' surfaces to the new language (bigger, but one coherent product).
- **(C) Hold the skin, ship Blueprint:** keep the current look for the pilot, do the re-skin later (fastest to a usable pilot, but it won't look like your prototype).

My recommendation is in §7.

---

## 5. New backend recently created (you asked specifically)

In the last ~4 weeks the backend grew a lot of new surface. Headline new domains (with web relevance):

| New backend domain | Endpoints | Web status |
|---|---|---|
| **Specs Engine + Designer Desk** | `/specs` CRUD, `/specs/rollup`, `/specs/extract` (AI), `/specs/desk`, `approve/route/release` | ✅ **Wired** in web (Designer workspace) |
| **Specs ↔ Approvals integration** | routing a selection creates an owner approval; `spec_id` on decisions | ✅ Wired (flows into Approvals inbox) |
| **Reports / DPR PDF** | `/reports/dpr.pdf`, `/reports/progress.pdf` (WeasyPrint, role-gated, export-audited) | ✅ Wired (ReportsPage) |
| **Company Documents** | `/documents` CRUD + R2 presign | ✅ Wired (DocumentsPage) |
| **Drawings register** | `/publish/drawings/register`, `/publish/drawings/presign` | ✅ Wired (Drawings tab) |
| **Site Changes** | `/site-changes` (field as-built → designer) | ✅ Wired (Designer) |
| **Design Profiler** | `/api/v1/design/*` (moodboard → taste → versioned brief → materialize) | 🟡 **Labs-gated; no prod web UI** (Designer Intake only if Labs on) |
| **Audits / Site-Audit** | `/audits/*` (AI quality scoring, sections/findings/score) | 🔴 **No web UI** (Labs; mobile/owner only) |
| **Survey / SiteSync** | `/surveys/*` (first-visit intake → onboard) | 🔴 **No web UI** (Labs) |
| **Extraction / Vision / Enrich pipeline** | `app/extraction/*` + `scripts/enrich_*` | infra (script-driven seed; not HTTP) |
| **`architect` role**, **chat reliability spine**, homeowner notifications/photo-comments/voice | various | role enum + mobile/chat |

**Recent migrations (newest-first):** `decision_spec_link` (spec_id on decisions) · `company_documents` · `report_exports` · homeowner notifications/photo-comments/voice · `site_changes_and_spec_routing` · `audit_and_survey` · profiler (brief/themes/conflicts/engine) · `chat_reliability_spine` · `add_architect_to_user_role_enum` · `spec_engine`.

**The takeaway for web:** the backend has shipped **three rich domains the web has no production home for yet — Audits, Survey/SiteSync, and the full Design Profiler.** If the web is meant to be the contractor *control plane*, these are real "left to do" (they're currently Labs-gated and mobile-leaning). Everything else new (Specs/Reports/Documents/Drawings/Site-changes) is already wired into web.

---

## 6. What's actually left (corrected backlog)

Grouped and prioritized. This **replaces** the vault's stale list.

**A. Production hardening (must, before any external user) — mostly backend**
- Wire a real OTP/SMS provider; remove the `000000` dev bypass (backend) + the prefill/hint (web). [P0]
- Audit + confirm server-side RBAC/tenant enforcement on every endpoint. [P0]
- Tighten CORS for the prod web origin; move JWT off `localStorage` (or accept for pilot). [P0/P1]
- Per-environment `VITE_API_BASE` (point web at the deployed backend). [P1]
- Add a minimal web E2E/smoke + Sentry; wire into CI. [P1]

**B. Design — bring web onto the Neev / Calm-Cockpit language** (scope per the §4 fork)
- Token swap (Blueprint → Calm Cockpit: Eczar/Hind/IBM Plex Mono, sand/sage/terracotta, pebble radii, warm shadows).
- Re-skin the shell (sidebar + topbar + scope switcher) and the owner command-center surfaces to match the prototype, then ripple outward to other roles if scope (B).
- Editorial copy pass (the "3 decisions need your call" voice).

**C. Feature completeness (web control plane)**
- Admin: build **Integrations**, **Audit-log**, **Security** sections (each = small backend + form/grid).
- Decide whether **Audits**, **Survey/SiteSync**, **Design Profiler** get a production web home (currently Labs/mobile). If yes → net-new web surfaces.
- Persist Settings notification prefs server-side; finish payroll report; (optional) SSE for live bell.

**D. W6 polish (the plan's final wave, never run)**
- WCAG 2.2 AA (both modes), keyboard operability, four-state (loading/empty/error/data) completeness, Lighthouse ≥90, Playwright E2E (WC1–WC4 + RBAC), entry ≤250 KB (already passing).

---

## 7. Recommended path to "production-ready web"

A pragmatic sequence that de-risks first and makes it *yours* second:

1. **Phase 0 — Unlock deploy (1 wave, backend-led).** Real OTP, kill the dev bypass, RBAC enforcement audit, CORS, env config, Sentry + a thin smoke test. *Outcome: the existing Blueprint app becomes safely deployable to a closed pilot.*
2. **Decide the design scope** (§4 fork). My recommendation: **(A) owner-first re-skin** — it matches your prototype exactly, is the smallest coherent slice, and proves the new language on the highest-value surface before committing to all 7 roles.
3. **Phase 1 — Calm-Cockpit token + shell swap** for the owner command center (Brief, Approvals, Decision Log, Specs, Sites). Re-skin over the *existing wired* screens — low risk, high visual payoff.
4. **Phase 2 — Control-plane completeness:** Admin Integrations/Audit/Security; decide + (if yes) build web homes for Audits / Survey / Profiler.
5. **Phase 3 — W6 polish & E2E:** a11y, Lighthouse, Playwright, ripple the skin to remaining roles.

The reason this order works: **Phase 0 is what your "not production-ready" instinct is really about** (you can't ship an app with no auth), and it's independent of the design. Doing it first means that even if the re-skin takes a few iterations, you always have a *deployable* app underneath.

---

## 8. Appendix — corrected status vs. the vault

| Item | Vault (June 5) says | Ground truth (June 20) |
|---|---|---|
| W5 Reports + PDF | NOT STARTED | ✅ Built & merged (PR #191) |
| W5 Drawings register | NOT STARTED | ✅ Built & merged (+ elevation) |
| W5 Documents (expiry) | NOT STARTED | ✅ Documents shipped (verify expiry-pills depth) |
| W4.5 Designer surface | BLOCKED on enums | ✅ `architect` role landed; Designer workspace wired |
| W4 Admin | "in progress" | 🟡 7/10 sections wired; 3 stubbed |
| Media-resolution endpoint | MISSING (blocker) | ✅ Drawings/photos presign from R2 in places (verify universal coverage) |
| SSE live bell | proposed | 🟡 Still 30s poll (works) |

**Bottom line:** the vault is an excellent *design north star* (especially `00`, `02`, `06`, and the prototype), but it is **not** a reliable status source — it's two weeks behind the code. This document is the current truth.

---

*Generated from a live audit: ran web typecheck/test/build, read backend routers + 48 migrations, read the `Neev Desktop` prototype source, cross-checked vault `11-Contractor-Web-Experience` and `docs/STATE-AND-ROADMAP.md`.*
