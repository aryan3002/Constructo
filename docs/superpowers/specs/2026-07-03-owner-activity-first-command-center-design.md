# Owner Command Center — Activity-First, Honest Rebuild

**Date:** 2026-07-03
**Status:** Design (awaiting review)
**Surface:** `constructo/web` (Owner web app) + `constructo/backend` (dashboard/activity, approvals cleanup)
**Route:** `/owner` (`app.neev.convoaiservices.com/owner`)

---

## 1. Context & problem

The product pivoted from **WhatsApp-exported AI-native** to **in-app-chat AI-native**. The
Owner "Command Center" (`/owner`) was built for the old model: a WhatsApp bridge extracted
structured events (attendance, deliveries, invoices, payment requests, progress) into
`SiteEventModel`, which the dashboard aggregated into risk exceptions + a Cash/Labor/Material/
Progress pulse + a payments-ledger "This Week."

With the WhatsApp firehose gone, **nothing populates those surfaces anymore**, so the owner sees
a Potemkin dashboard:

- **Portfolio → 2×2 pulse** reads `SiteEventModel` counts → `0`, `—`, "No evidence yet",
  "Set stages". (`backend/app/dashboard/aggregate.py`)
- **This Week → Cash In/Out** reads the payments ledger → `₹0 / ₹0`.
  (`web/src/features/owner/ThisWeek.tsx`)
- **Needs You / Approval Inbox / Decision Log** are polluted: **every** homeowner request —
  even "what colour is my son's room?" — is turned into a formal owner `Decision` with a
  junk auto-extracted title ("Wall", "Boy", "Argue", "Stair").
  (`backend/app/homeowner/nudge.py` → `_request_decision`)

Net: the page promises a financial/labor command center the product no longer produces, and the
only real data on it (homeowner requests) arrives as noise.

### What is genuinely real now (verified in code)

Every one of these is a real table with a `site_id` + a timestamp:

| Source | Table | Key fields |
| --- | --- | --- |
| Photo shared to homeowner | `published_photos` | `caption`, `room_tag`, `published_at` |
| Update (progress/milestone/delay/change/quiet) | `updates` | `type`, `title`, `body`, `published_at` |
| Milestone reached | `milestones` | `name`, `status`, `completed_on` |
| Weekly summary | `weekly_summaries` | `text`, `week_start`, `published_at` |
| Scope change | `changes` | `description`, `cost_delta`, `created_at` |
| Homeowner request | `homeowner_requests` | `title`, `detail`, `status`, `created_at`, `sla_due_at` |
| Owner decision / action | `decisions` | `kind`, `title`, `state`, `created_at` |
| Site-Health finding | `site_findings` | `finding_type`, `severity`, `status`, `headline`, `detected_on` |
| Projects + team | `sites`, `homeowner_members` / `users` | name, status, roster |

Endpoints that already exist and can be reused: `POST /api/v1/sites` (create project),
`GET/POST /api/v1/homeowner/requests`, the approvals/decisions list, the Site-Health list.

---

## 2. Goals & non-goals

### Goals
1. **Honesty:** no region ever shows a fabricated `0`/`₹0`/"No evidence" for a pipeline that
   cannot fill. Empty → an actionable invite, never a fake metric.
2. **Activity-first:** the front page leads with "what's the latest across your projects,"
   a real, typed, paginated stream where **every item maps to a real row and links to a real
   destination**.
3. **Add a project:** expose a `+ New project` affordance (the missing "add a listing"),
   wired to the existing `POST /sites`.
4. **De-pollute approvals:** homeowner requests stop masquerading as owner Approve/Reject
   decisions; the Approval Inbox shows only genuine owner decisions.
5. **Everything clickable:** each activity item, project card, stat, and nav entry lands on a
   live screen.

### Non-goals (explicitly deferred)
- Reviving Cash/Labor/Material/Progress metrics by extracting them from in-app chat. That is a
  separate, larger project ("rebuild-from-chat"). This spec **removes** the dead tiles.
- Redesigning the homeowner (mobile) app.
- Chat-message "highlights" in the activity stream (fuzzy to define). Deferred to a fast-follow;
  the stream's item-type set is designed to accept it later without a schema change.

---

## 3. Decisions locked (from brainstorming)

- **Scope:** owner app front page + IA **+ backend cleanup**.
- **Dead metrics:** honest chat-grounded reframe — **remove** the pulse/ledger tiles.
- **Front-page #1 job:** *what's the latest* (activity-first).
- **Homeowner requests:** appear in **Activity + a dedicated Requests view only** — NOT in
  "Needs you" (reserved for real approve/reject decisions).
- **Nav:** keep every item that lands on a real, working screen; relabel for clarity; don't hide
  working features.
- **Activity backbone:** **new dedicated `GET /api/v1/activity` union endpoint** (recommended
  below over broadening the bell-feed).
- **De-pollution mechanism (resolved 2026-07-03, evidence-backed):** **option (a) — stop
  creating the shadow `Decision` row for homeowner requests entirely**, and rewire the overdue
  nudge to a push. Chosen over option (b) after an adversarial review proved the row leaks into
  **three** owner surfaces (web inbox/log, the WhatsApp brief, the notification bell), so (b)
  ("filter one query") is both incomplete and *more* work than not creating the row. See §4.2.
- **Hero counts (resolved):** bundle into the `/activity` response `summary` (one round trip);
  retire `GET /dashboard/home` for `/owner`. See §4.1.
- **Project types (resolved):** reuse the existing owner-onboarding set verbatim —
  `residential / commercial / villa / interior / infra` (lowercase values, i18n Title-Case
  labels, default `residential`). See §4.3.

---

## 4. Architecture

### 4.1 Backend — `GET /api/v1/activity` (new)

A read-only aggregator, structured like `dashboard/aggregate.py`: the router loads rows; a
pure, side-effect-free `build_activity()` unions + sorts them into JSON-able items. This keeps
it trivially unit-testable without a DB.

**Why a new endpoint, not the bell-feed:** `app/notifications/feed.py` is *decision-derived,
per-recipient, exceptions-only*. Broadening it to carry photos/milestones/findings would entangle
two different concerns (a per-user unread bell vs. a per-company activity log) and risk the
existing decision-routing. A dedicated aggregator is cleaner, isolated, and independently
testable. (The bell-feed stays as-is for the notification bell.)

**Request:** `GET /api/v1/activity?site_id={uuid?}&cursor={iso8601?}&limit={int=20}`
- Company-scoped from the auth token (owner sees all their sites).
- Optional `site_id` filter (drives the per-project view + the Projects strip taps).
- Keyset pagination by `(occurred_at DESC, id)` via an opaque `cursor`.

**Response:**
```jsonc
{
  "items": [
    {
      "id": "photo:<uuid>",          // "{kind}:{row_id}" — stable, de-dupes across pages
      "kind": "photo_shared",         // enum below
      "site_id": "<uuid>",
      "site_name": "Tripathi Dream Home",
      "title": "Living room progress",         // human-readable, source-derived
      "subtitle": "Photo shared with the homeowner",
      "occurred_at": "2026-07-03T09:12:00Z",
      "actor": "Site team",           // best-effort display name, nullable
      "link": { "type": "feed_photo", "id": "<uuid>" },  // typed target the web maps to a route
      "severity": "info"              // info|success|warning — drives the icon tint only
    }
  ],
  "next_cursor": "2026-07-01T00:00:00Z" | null
}
```

**`kind` enum (v1):** `photo_shared`, `update_posted`, `milestone_reached`,
`weekly_summary`, `scope_change`, `homeowner_request`, `decision_made`, `site_health_flag`.
(Forward-compatible: `chat_highlight` can be added later without breaking clients.)

**Union sources → item mapping (all real rows):**

| kind | table | title / subtitle | link.type | severity |
| --- | --- | --- | --- | --- |
| `photo_shared` | `published_photos` | `caption` / room_tag | `feed_photo` | info |
| `update_posted` | `updates` | `title` / body-preview | `update` | info (delay→warning) |
| `milestone_reached` | `milestones` (status=done) | `name` | `milestone` | success |
| `weekly_summary` | `weekly_summaries` | "Weekly summary" / preview | `update` | info |
| `scope_change` | `changes` | `description` / cost delta | `update` | info |
| `homeowner_request` | `homeowner_requests` | `title`* / `detail`-preview | `request` | warning if overdue else info |
| `decision_made` | `decisions` (kind in approval/hold_payment; resolved/rejected/pending) | `title`* / state | `decision` | success/warning |
| `site_health_flag` | `site_findings` (status=open) | `headline` | `finding` | severity→warning/info |

`title`* = cleaned display title (see §4.3 — strip internal tags, prefer real message text).

**`occurred_at` per source:** `published_at` / `completed_on` / `week_start` / `created_at` /
`detected_on` respectively (normalized to tz-aware UTC; dates → midnight UTC).

**Hero counts (resolved — one round trip).** Bundle the honest headline numbers into the
`/activity` response as a small `summary: { updates_today, needs_decision_count, sites_total }`,
so a single request drives both the hero and the stream — no fabricated numbers. Project cards
come from the existing `GET /sites`; genuine "Needs you" decisions from the existing
approvals/decisions list. Consequently the page does **not** need the old `GET /dashboard/home`:
it can be **retired for `/owner`** (verify during planning that no other surface still consumes
it before removing; otherwise leave it dormant).

### 4.2 Backend — approvals de-pollution (chosen: option (a), done completely)

**Problem:** `homeowner/nudge.py::_request_decision` creates a
`Decision(kind=generic, title="[homeowner-request-nudge][<uuid>] <req.title>")` for **every**
homeowner request (at creation via `surface_request_now`, and again when overdue via
`run_request_nudge_sweep`). That shadow row is what pollutes the owner surfaces.

**Decision:** a homeowner request must not exist as an owner `Decision` at all — its true home
is `homeowner_requests`, surfaced via the Requests view (§4.4) and the activity stream (§4.1).
We **stop creating the shadow row** and **rewire the overdue signal** so nothing is lost. This
is the honest end-state per your principle "treat each thing as what it is."

**Why not the lighter "re-type + filter" (option b) — proven by adversarial review:** the
request-nudge `Decision` leaks into **three** owner-approval surfaces, not one:
1. `app/approvals/router.py::list_decisions` — the web Approval Inbox **and** the owner Decision
   Log (both read this one endpoint; no kind/tag filter today).
2. `app/bot/brief_delivery.py::_open_decisions` → `app/bot/compose.py::compose_brief` — the
   owner's **WhatsApp morning brief**, which selects *all* open decisions with **no kind/tag
   filter** and renders each as a numbered approvable *faisle* printing the raw
   `[homeowner-request-nudge][uuid]` title (verified: `compose.py:214` uses `d.get("title")`
   with no `_strip_tag`).
3. `app/notifications/feed.py::build_feed` — the owner **notification bell** (`generic`→owner,
   severity `info`).
Filtering only `list_decisions` would leave the request showing as approvable in the brief and
the bell. Doing (b) *properly* = a new `DecisionKind` value + a non-transactional Postgres
`ALTER TYPE … ADD VALUE` migration + exclusions in all three readers + web `Decision['kind']`
union/`KIND_META` updates. That is **more** surface than simply not creating the row.

**Crucial invariant (verified):** the overdue *timing* does not live in the decision ledger. It
lives on `HomeownerRequest.sla_due_at` + `run_request_nudge_sweep` (which reads
`homeowner_requests`), and `run_sla_sweep` provably ignores these rows (they never set
`sla_due_at`). So deleting the row loses **no timing** — only the row's role as the in-app
work-item + push trigger, which we replace.

**Changes:**
1. **Stop creating the row.** Remove the `_request_decision` write from `surface_request_now`
   and from `run_request_nudge_sweep`. The at-creation site-team push already exists
   independently (`_alert_site_leads`, `router.py:2246`) and stays.
2. **Rewire the overdue nudge (non-negotiable).** `run_request_nudge_sweep` must still emit its
   one-nudge signal when a request goes overdue — but as a **push/notification to site leads**
   (reuse the `_alert_site_leads` pattern) instead of a `Decision`. Preserve the existing
   contract: stamp `nudged_at` (one-nudge idempotency) and return the nudged request ids. The
   overdue request also surfaces as an activity item (`homeowner_request`, `warning` severity)
   and in the Requests view's overdue group.
3. **Nothing to exclude.** With no row created, `list_decisions`, the WhatsApp brief, and the
   bell are clean by construction — no kind filter, no enum migration, no web-union change. The
   existing homeowner-side `not_like(NUDGE_TAG)` filters (`router.py:873`, `:2359`) become
   harmless no-ops.
4. **Leave `quiet.py` alone.** Its quiet-site abstain nudge is a genuine owner-facing `generic`
   Decision (`[homeowner-quiet-nudge]`), not a homeowner request. Do not re-type or filter it.
5. **One-time cleanup** (`backend/scripts/`): resolve/remove existing junk request-nudge
   `Decision` rows (title `LIKE '[homeowner-request-nudge]%'`) in the pilot DB so every owner
   surface starts clean. Idempotent, dry-run by default, `--apply` to write; must **not** touch
   `[homeowner-quiet-nudge]` rows.

**Title hygiene (still applies):** requests currently get a junk single-word `req.title`
("Wall", "Boy"). The Requests view + activity `homeowner_request` items should title from the
homeowner's real message (`detail` first line, else `title`), trimmed. Fix at the source
(request-creation title extraction) and defensively at display.

### 4.3 Frontend — the new `OwnerHome`

Replaces the 3-column `CommandCenter` (NeedsYou / Portfolio / ThisWeek). New composition,
top-to-bottom priority (stacks cleanly on mobile):

1. **`<HonestHero>`** — eyebrow (`Owner · <date>`) + computed headline
   ("3 updates today · 1 needs you" / "All quiet — last update 2h ago"). Pure function of the
   hero counts; no fake numbers.
2. **`<NeedsYou>` (reused, cleaned)** — only genuine owner decisions (`approval`/`hold_payment`).
   Honest empty: "Nothing needs a decision right now." Keeps the existing inline
   Approve/Hold/Assign chips + `useDecide` optimistic path.
3. **`<ActivityStream>`** (new, primary) — infinite list from `GET /activity`
   (`useInfiniteQuery`). Each row: severity-tinted icon + title + `site · relative-time` +
   trailing action/chevron. Row → route via a `linkFor(item.link)` map:
   `feed_photo`→feed/photo, `update`/`milestone`→project timeline, `request`→chat/requests
   (with a **Reply** affordance), `decision`→decision detail, `finding`→Site Health.
   Optional per-project filter chip row (drives `?site_id=`).
4. **`<ProjectsStrip>`** (new) — real project cards (name, status dot, location, last-activity,
   people) + a **`+ New project`** tile → `<NewProjectModal>`.
5. **Removed:** `Portfolio` (pulse) and `ThisWeek` (ledger) are deleted from this page. Their
   files can remain in the tree only if referenced elsewhere; otherwise remove to avoid dead code.

**`<NewProjectModal>`** — form: `name` (required), `type` (required), `location` (optional).
Submits to `POST /sites`; on success invalidates the sites + activity queries and (optionally)
deep-links into the new project. Honest validation copy per CDS content rules ("Enter a project
name"). RBAC: only roles permitted by the backend see the button; server remains the source of
truth.

**Type select — mirror the existing owner-onboarding set verbatim** (do not invent values). Reuse
`web/src/pages/auth/OwnerFirstRun.tsx` `SITE_TYPES` and its i18n keys so the modal matches how
sites are already created in-app:

| Label (from `auth.onboard.site.type.*`) | value (stored) |
| --- | --- |
| Residential | `residential` |
| Commercial | `commercial` |
| Villa / Bungalow | `villa` |
| Interior fit-out | `interior` |
| Infrastructure | `infra` |

Store the lowercase `value`, render the Title-Case label via the existing i18n keys (single-
sourced — no hardcoded strings), default `residential`. `Site.type` is free-text in the backend
(`str = Field(min_length=1)`), so these pass validation as-is; real stored data today is only
`residential` and `villa`, both in this set (no data mismatch).

**Cold-start / setup checklist** (`SetupChecklist`) — drop the dead **"Connect WhatsApp"** step.
New steps: **Add a project → Invite your team → Start a chat.** Cold-start = no sites, or sites but
zero activity.

### 4.4 Frontend — the Requests view

A dedicated **Requests** surface (list of `homeowner_requests` via `GET /homeowner/requests`),
grouped open/overdue/resolved, each with a **Reply** action that opens the relevant chat thread.
This is where homeowner questions live now — not the Approval Inbox. Reachable from the activity
`request` items and the sidebar.

### 4.5 Frontend — nav verification (keep-but-verify)

Audit each sidebar entry (Brief→"Latest", Approvals, Sites→"Projects", Chat, Drawings, Permits,
Reports, Search, Admin, Settings). For each: confirm it routes to a live, non-empty screen for the
owner; relabel for clarity (sentence case); fix any dead link. Add **Requests**. No working feature
is hidden. Deliverable: a short verified nav map in the plan.

---

## 5. Data flow

```
Owner opens /owner
  → GET /api/v1/activity?limit=20   : { summary: hero counts, items: first page of the stream }
  → GET /api/v1/sites               : project cards for the Projects strip
  → GET /api/v1/approvals?state=pending (existing) : genuine "Needs you" decisions
  → renders HonestHero (from summary), NeedsYou, ActivityStream, ProjectsStrip

Scroll ActivityStream → GET /api/v1/activity?cursor=… (keyset) → append
Filter by project      → GET /api/v1/activity?site_id=… (fresh)
Tap activity row       → linkFor(item.link) → real route
Tap "+ New project"    → NewProjectModal → POST /sites → invalidate sites+activity
Approve/Hold in NeedsYou → POST /dashboard/decisions (existing useDecide optimistic path)
```

---

## 6. Error & empty handling

- **Every region has four states:** loading skeleton, honest positive-empty, inline error+retry,
  populated. (Matches the existing kit conventions.)
- Activity error is **non-blocking** (the page still shows hero + needs-you + projects).
- Positive-empty copy is an invitation, not an apology (CDS): "No updates yet — shared photos,
  milestones, and requests will show here." / "No projects yet — add your first."
- `POST /sites` failures surface a friendly inline error; the modal stays open with input intact.

---

## 7. Testing

**Backend**
- `build_activity()` pure unit tests: correct union, ordering (newest first), per-kind title/link/
  severity mapping, `site_id` filter, keyset pagination boundaries, tz normalization.
- Approvals de-pollution (option a): a homeowner request creates **no** `Decision` row — assert
  absent from `list_decisions` (`GET /api/v1/approvals`), the WhatsApp brief `_open_decisions`,
  and `build_feed`; genuine `approval`/`hold_payment` decisions unaffected; `quiet.py` generic
  nudge unaffected.
- Overdue rewire: `run_request_nudge_sweep` fires its push exactly once, stamps `nudged_at`, and
  returns the nudged ids — **without** creating a Decision. (Flips
  `test_request_nudge_sweep_fires_once`, which today asserts a `Decision LIKE NUDGE_TAG%`.)
- Surface-immediately flip: `test_create_request_surfaces_to_contractor_immediately` today asserts
  the request appears in `/approvals`; rewrite to assert it appears in the Requests list / activity
  and is **absent** from `/approvals`.
- Cleanup script: dry-run reports N; `--apply` resolves exactly those `[homeowner-request-nudge]%`
  rows; idempotent re-run finds 0; never touches `[homeowner-quiet-nudge]%` rows.
- Regression: full backend suite stays green (target: 0 regressions).

**Frontend** (Vitest + RTL)
- `HonestHero` copy for 0 / 1 / many; never renders a fabricated metric.
- `ActivityStream`: renders typed rows, relative time, correct `linkFor` targets, infinite-scroll
  append, empty + error states.
- `NewProjectModal`: validation, success invalidates queries, error keeps input.
- `NeedsYou`: shows only genuine decisions; homeowner requests absent.
- Verify with `npm run build` (tsc -b, the CI/Vercel path) — NOT `npm run lint`.

**Manual (preview)**
- Pilot-like data: confirm no `₹0`/"No evidence" tiles remain; activity items click through;
  add-project round-trips; Approval Inbox is clean.

---

## 8. Rollout / migration

1. Backend: `GET /activity` (with `summary`) + de-pollution (stop creating request `Decision`
   rows + rewire the overdue nudge to a push) + updated homeowner tests.
2. One-time cleanup script run against the pilot DB (dry-run → apply).
3. Frontend: new `OwnerHome` composition behind the same route; delete dead pulse/ledger; add
   `NewProjectModal` + Requests view; verify nav.
4. Verify green CI (backend `pytest` + `ruff`; web `npm run build`), deploy web (Vercel) +
   backend (Azure Container Apps).

**No DB migration required** — option (a) creates no new enum value and the cleanup script only
resolves junk decision rows (no schema/table changes). This is a deliberate advantage of (a) over
(b), which would have needed a non-transactional `ALTER TYPE decision_kind ADD VALUE`.

---

## 9. Risks & mitigations

- **Union performance / N sources:** bounded by `limit` + per-source `ORDER BY ... LIMIT` before
  the in-memory merge (fetch ≤`limit` newest from each source, merge, trim). Company has few
  sites in the pilot; revisit indexes if it grows.
- **Removing pulse/ledger may hide something a stakeholder liked:** mitigated by keeping the code
  paths recoverable and documenting that reviving them is the separate chat-extraction project.
- **Overdue signal dropped in the rewire (the one real risk of option a):** if we delete the
  request `Decision` but forget to rewire `run_request_nudge_sweep`'s nudge into a push, a slipping
  request goes silent in-app. Mitigated by making the rewire a first-class, tested step (§7) — the
  sweep must fire its push exactly once — and by the Requests view + activity being the honest
  replacement work-item. Genuine `approval`/`hold_payment` and the `quiet.py` generic nudge are
  untouched (tested).
- **RBAC on create-project:** server stays the source of truth; the button is a convenience gate.

---

## 10. Resolved decisions (were open questions)

1. **De-pollution mechanism → option (a)** (stop creating the request `Decision` entirely + rewire
   the overdue nudge to a push). Resolved 2026-07-03 via an evidence workflow + adversarial verify:
   the shadow row leaks into three owner surfaces (web inbox/log, WhatsApp brief, bell), so (b)
   "filter one query" is incomplete, and doing (b) properly is *more* work (enum value +
   non-transactional migration + 3 reader exclusions + web union) than not creating the row. The
   overdue *timing* never lived in the ledger, so (a) loses nothing provided the sweep's nudge is
   rewired. See §4.2.
2. **Hero counts → bundle into `/activity` `summary` (one round trip); retire `/dashboard/home`
   for `/owner`.** See §4.1.
3. **`NewProjectModal` types → reuse `OwnerFirstRun.tsx` `SITE_TYPES` verbatim**
   (`residential / commercial / villa / interior / infra`, lowercase values, i18n Title-Case
   labels, default `residential`). `Site.type` is free-text, so no migration/backfill. See §4.3.

### Still to settle during planning (small)
- Exact shape of the rewired overdue nudge (in-app notification row vs. existing push transport) —
  pick whatever `_alert_site_leads` already uses, for consistency.
- Confirm no non-`/owner` surface still depends on `GET /dashboard/home` before deleting it.
