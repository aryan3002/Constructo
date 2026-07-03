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

**Hero counts (drives the honest headline):** the same router (or a lightweight
`GET /api/v1/dashboard/home` reshape) returns `updates_today`, `sites_total`, and
`needs_decision_count` (genuine pending owner decisions only). No fabricated numbers.

### 4.2 Backend — approvals de-pollution (cleanup)

Problem: `homeowner/nudge.py::_request_decision` creates a `Decision(kind=generic,
title="[homeowner-request-nudge][<uuid>] <req.title>")` for every homeowner request, which then
lands in the Approval Inbox and Decision Log.

**Changes:**
1. **Separate the lane.** Homeowner requests must not appear in the Approval Inbox. Options,
   decided at plan time (both satisfy the goal — pick the lower-risk one against current callers):
   - (a) **Stop creating `Decision` rows for requests entirely**; the activity endpoint reads
     `homeowner_requests` directly (preferred — removes the whole class of pollution), **or**
   - (b) tag them with a dedicated `DecisionKind` (e.g. `homeowner_request`) and **exclude that
     kind** from the Approval Inbox + Decision Log queries, surfacing them only via activity.
   The nudge's *purpose* (make sure a slipping request is seen) is preserved by the activity
   stream's `homeowner_request` item with a `warning` severity when overdue.
2. **Approval Inbox query** filters to genuine owner decisions
   (`kind in {approval, hold_payment}`), so the inbox is "the few decisions that need you," as its
   own subtitle promises.
3. **Title hygiene (display + source):** never render the internal
   `[homeowner-request-nudge][uuid]` tag. Title from the homeowner's real message
   (`detail` first line, else `title`), trimmed. Apply at the source (request creation title
   extraction) *and* defensively at display.
4. **One-time data cleanup:** a script (`backend/scripts/`) that resolves/removes the existing
   junk `generic` request-nudge decisions in the pilot DB so the inbox starts clean. Idempotent,
   dry-run by default, `--apply` to write. (Mirrors existing `scripts/` conventions.)

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

**`<NewProjectModal>`** — form: `name` (required), `type` (required; select:
residential/commercial/…), `location` (optional). Submits to `POST /sites`; on success invalidates
the sites + activity queries and (optionally) deep-links into the new project. Honest validation
copy per CDS content rules ("Enter a project name"). RBAC: only roles permitted by the backend see
the button; server remains the source of truth.

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
  → GET /api/v1/dashboard/home (reshaped): hero counts + genuine needs-you decisions + projects
  → GET /api/v1/activity?limit=20        : first page of the real stream
  → renders HonestHero, NeedsYou, ActivityStream, ProjectsStrip

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
- Approvals de-pollution: request-nudge no longer appears in the Approval Inbox / Decision Log
  query; genuine `approval`/`hold_payment` still do; overdue request still surfaces via activity.
- Title hygiene: internal tag never present in any serialized title.
- Cleanup script: dry-run reports N; `--apply` resolves exactly those rows; idempotent re-run
  finds 0.
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

1. Backend: `GET /activity` + approvals de-pollution + dashboard-home reshape (additive; old
   fields can remain until the web cuts over).
2. One-time cleanup script run against the pilot DB (dry-run → apply).
3. Frontend: new `OwnerHome` composition behind the same route; delete dead pulse/ledger.
4. Verify green CI, deploy web (Vercel) + backend (Azure Container Apps).

No destructive DB migration required (the cleanup script only resolves junk decision rows; it does
not drop tables). Adding a new `DecisionKind` enum value (if option 4.2-b chosen) is additive.

---

## 9. Risks & mitigations

- **Union performance / N sources:** bounded by `limit` + per-source `ORDER BY ... LIMIT` before
  the in-memory merge (fetch ≤`limit` newest from each source, merge, trim). Company has few
  sites in the pilot; revisit indexes if it grows.
- **Removing pulse/ledger may hide something a stakeholder liked:** mitigated by keeping the code
  paths recoverable and documenting that reviving them is the separate chat-extraction project.
- **De-pollution touching decision routing:** covered by tests asserting the bell-feed +
  genuine-decision paths are unchanged.
- **RBAC on create-project:** server stays the source of truth; the button is a convenience gate.

---

## 10. Open questions (resolve during planning)

1. De-pollution mechanism: 4.2-(a) stop creating request Decisions vs 4.2-(b) dedicated kind +
   query exclusion — pick by blast radius against current callers/tests.
2. Whether to also reshape `GET /dashboard/home` or add hero counts to `GET /activity` (one round
   trip vs two).
3. Exact `type` select options for `NewProjectModal` (mirror whatever `sites` already stores).
