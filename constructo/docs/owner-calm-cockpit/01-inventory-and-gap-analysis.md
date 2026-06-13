# Owner "Calm Cockpit" — Inventory & Gap Analysis (Phase 1)

Date: 2026-06-13 · Branch: `feat/owner-calm-cockpit`

Goal: rebuild the owner/builder mobile surface to match the `Neev-2_owner` prototype
(warm "Calm Cockpit" look), wired to real data, completing any backend the prototype
needs but the backend lacks.

---

## 1. Owner backend feature inventory

Routers are mounted in `app/main.py`. Owner/builder is the `owner` (and `pm`)
`UserRole`; visibility is "owner/pm see all company sites, field roles see assigned
sites only" (`effective_visible_site_ids`). Every load is company-scoped; errors via
`AppError(status, code, message)`; new/experimental features sit behind
`settings.enable_labs`.

| Package | Prefix | Owner-relevant endpoints | Backing models |
|---|---|---|---|
| sites | `/api/v1` | sites CRUD, `/sites/{id}/assign`, baseline GET/PUT, `/sites/{id}/events`, users CRUD, whatsapp-groups | `Site`, `SiteBaseline`, `SiteEventModel`, `User`, `Company`, `SiteAssignment`, `WhatsappGroup` |
| dashboard | `/api/v1/dashboard` | `GET /home` (headline counts, per-site cards, risks, pulse, cold-start), `POST /decisions` (inline chip→Decision) | reads `Site`/`SiteEvent`/`Decision` |
| brief | `/api/v1` | `POST /briefs/run`, `GET /briefs` (owner morning brief) | `OwnerBrief` |
| approvals | `/api/v1/approvals` | inbox `GET /`, raise, get, acknowledge, approve, reject, respond, assign, batch, sla/sweep | `Decision` |
| specs | `/api/v1/specs` | list, create, `GET /rollup`, `POST /extract` (OCR→AI draft), `GET /desk`, get, patch, `POST /{id}/approve` | `Spec` |
| materials | `/api/v1/materials` | list/create/patch catalog | `Material` |
| vendors | `/api/v1/vendors` | resolve, list, create, patch | `Vendor` |
| payments | `/api/v1/payments` | CRUD, approve/undo, ledger, settlement, `financials/{site}` | `Payment`, `SiteFinancials` |
| reconcile | `/api/v1/reconcile` | overview, per-site, GRN, hold-payment, tally export | reads payments/events |
| permits | `/api/v1/permits` | CRUD + `/checklist` ("are we legal to build?") | `Permit` |
| dpr | `/api/v1/dpr` | draft, get, patch, `POST /{id}/send` (manual commit) | `Dpr` |
| attendance | `/api/v1` | `POST/GET /sites/{id}/attendance`, summary, wage-trail | `SiteEventModel` (attendance), `Payment` |
| forecast | `/api/v1` | `GET /forecast` (reorder + cashflow, deterministic) | reads events |
| portfolio | `/api/v1` | `GET /portfolio/summary` (exact-math Q&A) | reads events |
| action_items | `/api/v1/action-items` | CRUD + audit log | `ActionItem`, `ActionItemEvent` |
| disputes | `/api/v1` | raise/list/resolve/withdraw (contested-truth) | `EventDispute` |
| chat | `/api/v1/chat` | messages, media, conversations, ws, read/delivered, corrections | `ChatMessage`, `Conversation`, `ConversationMember`, `RawMessageModel` |
| publish | `/api/v1/publish` | photos/updates/weekly, property/spaces/components/milestones/drawings | `Property`, `Space`, `Component`, feed models |
| notifications | `/api/v1/notifications` | unread-count, read, settings | `CompanyNotificationSettings` |
| search | `/api/v1` | `/search`, `/search/messages` | reads chat/events |
| dispute_pack | `/api/v1` (Labs) | tamper-evident pack + ask | wraps disputes |
| vendor_confirm | `/api/v1/vendor-confirm` (Labs) | vendor confirm-loop (token) | `VendorConfirmation` |

**Design-Profiler engine** (role-agnostic; owner Design/Brief/`dp` screens use it):
lives in **`app/homeowner/`** (NOT `app/profiler/`). Prefix `/api/v1/homeowner/design/*`
plus brief endpoints. Engine = `app/homeowner/ai.py` (`generate_design_profile_v2`) +
`design_fingerprint.py` (deterministic trust firewall) + `authority.py` (RBAC). Endpoints:
profile GET/PUT, references, selections, consistency-check, conflicts + resolve. Brief:
`POST /profiles/{id}/brief`, `GET /brief?audience=`, approval state machine, `materialize`.

---

## 2. Prototype ↔ backend gap analysis

Prototype: `/Users/aryantripathi/Downloads/Neev-2_owner/owner-src/*` — 5 tabs
(**Brief / Sites / Chat / Specs / Approvals**) + pushed routes (site, spec, log, thread,
more, profile, audit, auditsite, survey, team, search, design, designsite, dp).

| Prototype screen | Backend support | Verdict |
|---|---|---|
| **Brief** (command-center: decisions-need-you, site roll-up, spec summary, log preview, scope filter) | `dashboard /home` + `approvals` + `specs` + `brief` | ✅ supported (compose existing) |
| **Sites** (filter chips, site cards w/ status pills, progress, "N for you") | `sites` list + `dashboard /home` per-site cards | ✅ supported |
| **Site detail** (progress TimeBar, open confirmations, rooms/packages milestones, latest photos, specs) | `sites/{id}` + events + `approvals` + `specs` + publish milestones/photos | ✅ supported |
| **Specs / Spec detail** (schedule, status filters, linked decision, history) | `specs` (+ rollup, desk, approve) | ✅ supported |
| **Approvals / Log** (inbox filters, decision cards, append-only log) | `approvals` (+ states) | ✅ supported |
| **Chat / Thread** | `chat` | ✅ supported |
| **Design / DesignSite / dp** (brief summary, palette, room directions) | `homeowner/design/*` (role-agnostic) | ✅ supported |
| **More / Profile / Team / Search** | `sites` users + `search` + auth me | ✅ supported (compose) |
| **Audit Hub / Audit Site / New Audit** (quality score, work sections, findings, request inspection) | — none — | ❌ **GAP → build `app/audit/`** |
| **Survey** (SiteSync first-visit intake: risk score, plot, approvals, conditions, AI analysis, onboard) | — none — | ❌ **GAP → build `app/survey/`** |

### Confirmed gap (the net-new backend)
Grep across `app/` for `audit|survey|sitesync`: **no package, router, or model exists**
(only the phrase "audit trail/log" in comments). The prototype's full Audit Hub / Audit
Site / Survey flow therefore requires net-new backend — **in scope, built in Phase 2**:

- **`app/audit/`** — `Audit` (status, deterministic score), `AuditSection` (items +
  pass/obs/fail counts + section score), `AuditFinding` (severity, room/location, assign).
  Request → inspect → deterministic score → findings → assign. Labs-gated, company-scoped.
- **`app/survey/`** — `Survey` (intake: client/engineer/architect, plot, approvals,
  conditions, risks, requirement). Deterministic `risk_score` from risks; AI drafts only
  the `ai_analysis` prose. `analyze` + `onboard` (→ creates/links a `Site`).

Determinism doctrine honoured: all numeric scores are computed in Python; the LLM
(FakeLLM in tests) only drafts prose. AI proposes, a named human commits.

---

## 3. Frontend conversion plan

- Owner surface already exists at `app/(contractor)/owner/` (5 tabs) on the **dark `neev`**
  theme. Re-theme the owner subtree to the warm **`daylight`** Calm-Cockpit theme by
  wrapping it in its own `<ThemeProvider initial="daylight">` — leaves homeowner and other
  contractor roles untouched.
- Reuse the shared kit `src/ui/*` (Screen, Card, StatusPill, Chip, TimeBar, Avatar,
  PhotoTile, Typography, FadeInUp, `formatINR`) + tokens `src/theme/tokens.ts`.
- Build screen-by-screen to match the prototype composition; honest loading/empty/error
  states; verify each on the iOS simulator.
- Priority order: Brief (home) → Sites → Audit Hub/Site/Survey (new backend) → Site detail
  / Specs / Approvals polish.
