# Site Engineer "Calm Cockpit" — Inventory & Gap Analysis (Phase 1)

Date: 2026-06-13 · Follows the Owner Calm-Cockpit rebuild (PR #187, merged).

Goal: convert the **Site Engineer** mobile surface (role `UserRole.supervisor`,
seeded as "Lokesh Verma (Site Engineer)") to match the Neev prototype at
`~/Downloads/Neev-SiteEngineer/eng-src/*.jsx`, on the warm **daylight "Calm
Cockpit"** theme — the same approach used for the owner app: wrap the subtree in
its own `<ThemeProvider initial="daylight">`, reuse the shared `src/ui/*` kit +
daylight tokens, wire to real endpoints, fabricate nothing.

---

## 1. Prototype surface (what we're matching)

`eng-src/` is a 7-surface field app for Lokesh. Tab set (`EngNav`):
**Home · Tasks · Capture (center FAB) · Chat · More.**

| Prototype screen | What it shows | Source jsx |
|---|---|---|
| **Home** | greeting, 3 stat tiles (To-do / Asks / Visits), "Today's work" to-do (toggle done), "Asks for you" (reply), "Site appointments" timeline | `eng-home.jsx` |
| **Capture** (door) | 4 kind buttons (photo/note/challan/voice) → confirm AI-read fields → file; "Filed today" list | `eng-capture.jsx` |
| **Tasks** | "Asks for you" — clarifications from owners/designer; filter Open/Answered/All; reply (options / number / photo) | `eng-tasks.jsx` |
| **Chat** | thread list (owners / designer / site groups) → thread | `eng-chat.jsx` |
| **More** | Audit + Drawings feature cards; Account group (profile / assigned sites / asks) | `eng-more.jsx` |
| **Audit** (pushed) | "Audits to run" (requested by owners) + "Submitted"; the **run** screen marks each check pass/observe/fail and submits a score | `eng-audit.jsx` |
| **Drawings** (pushed) | latest released revisions per site + trade filter; superseded warning ("don't build from this") | `eng-drawings.jsx` |
| **Profile** (pushed) | identity, sync/offline toggle, assigned sites, settings | `eng-more.jsx` |

Mental model: the engineer **records** from site (capture), **answers** asks,
**conducts** the audits owners request, and **pulls the latest drawing**.

---

## 2. Backend inventory ↔ prototype (the headline: wire, don't build)

Unlike the owner pass (which needed net-new `app/audit` + `app/survey`), every
backend the Site-Engineer prototype touches **already exists**. Verified by
reading routers/schemas/models.

| Prototype need | Endpoint(s) | Labs? | Verdict |
|---|---|---|---|
| **Audit — run/conduct** | `POST /api/v1/audits` · `GET /audits?status=requested` · `GET /audits/{id}` · `POST /audits/{id}/sections` (deterministic section score) · `POST /audits/{id}/score` (finalize, mean of section scores) · `POST /audits/{id}/findings` · `PATCH /audits/{id}` | yes | ✅ exists — **the conduct endpoints aren't in the mobile client yet** (gap below) |
| **Tasks / Asks for you** | `GET /api/v1/approvals?for=me` (decisions assigned to caller) · `POST /approvals/{id}/respond` | no | ✅ exists, already wired in `supervisor/tasks-asks.tsx` |
| **Home — today's work** | `GET /api/v1/action-items?site_id&mine=true` · `PATCH /action-items/{id}` (toggle done) | no | ✅ exists, wired in `actionItems.ts` |
| **Capture** | `POST /api/v1/capture` (multipart) + transcript-back via events | no | ✅ exists, fully wired in `supervisor/capture.tsx` (outbox + voice + CA1) |
| **Drawings** | `GET /api/v1/publish/drawings?site_id` (`DrawingOut`: version, kind, `supersedes_id`, summaries) | no | ✅ exists — **no mobile client yet** (gap below) |
| **Chat** | `GET/POST /api/v1/chat/messages`, media, brief/recap/sentinel | no | ✅ exists, wired in `supervisor/chat.tsx` |
| **Assigned-sites scope** | `effective_visible_site_ids` joins `SiteAssignment`; supervisor sees only assigned sites | — | ✅ enforced server-side |

### Scoping & determinism (confirmed)
- `UserRole.supervisor` == Site Engineer; `UserRole.architect` == Designer.
- Audit/Survey routers are **Labs-gated** (`settings.enable_labs`) — the dev/demo
  backend runs with Labs on.
- Determinism doctrine honoured by the backend already: section score =
  `round(100·(pass + 0.5·obs)/total)`, audit score = mean of section scores, all
  in Python; the LLM only drafts finding-note prose (best-effort).

### Honest gaps (no fabrication)
1. **Site appointments** (home "Site appointments" timeline of supplier/vendor/
   contractor visits) — **no scheduling backend exists.** Per the Determinism
   Doctrine we **omit** this card (exactly like the owner pass omitted per-site
   progress %). Flagged as a future `app/appointments`.
2. **Capture kinds** — prototype shows photo/note/**challan**/voice as distinct
   AI-field templates. The real `POST /capture` classifies by `type ∈
   {attendance, delivery, progress, issue}` + free media/text. We keep the real,
   working capture semantics (photo + hold-to-talk voice + type chips) restyled
   to daylight, rather than fabricate a challan-OCR pipeline that isn't there.
3. **Per-site progress %** — still no timeline-progress field on `Site` (same as
   owner pass). Profile's "assigned sites" shows stage/name, not a fabricated %.

**Net: zero new backend tables/endpoints. The gaps are two thin mobile API
clients + the demo seed.**

---

## 3. Frontend conversion plan

### Re-theme mechanism (proven by the owner pass)
Every supervisor screen already reads colors/fonts from `useTheme()` +
theme-aware Typography. Wrapping the supervisor subtree in
`<ThemeProvider initial="daylight">` (in `supervisor/_layout.tsx`, exactly like
`owner/_layout.tsx`) **instantly re-skins the whole subtree to daylight**, leaving
PM / accountant / mukadam / architect on neev. Net-new screens are then built
fresh against the daylight kit.

### Route structure (`app/(contractor)/supervisor/`)
Tabs (custom tab bar w/ center Capture FAB), `initialRouteName="home"`:
- `home.tsx` **(new)** — greeting + stat tiles + Today's work (action-items) + Asks (approvals?for=me). *Appointments omitted (gap #1).*
- `tasks.tsx` **(rebuild of tasks-asks)** — Asks for you, filter tabs, → reply.
- `capture.tsx` **(re-theme, keep wiring)** — daylight chrome over the working outbox/voice capture.
- `chat.tsx` **(re-theme via wrapper)** — keep the rich working chat; daylight-toned.
- `more.tsx` **(new)** — Audit + Drawings cards + Account group.

Pushed (off-tab, `href:null`):
- `task/[id].tsx` **(new)** — reply flow → `approvals/{id}/respond`.
- `audit.tsx` **(new)** — hub: "Audits to run" (requested) + Submitted.
- `audit/[id].tsx` **(new)** — run: pass/observe/fail checklist → `sections` + `score`.
- `drawings.tsx` / `drawing/[id].tsx` **(new)** — released revisions + superseded warning.
- `profile.tsx` **(new)** — identity + assigned sites + sign out.
- `action-items.tsx` **(keep)** — pushed from chat, daylight via wrapper.
- `my-sites.tsx` — dropped from the tab bar (`href:null`); prototype has no Sites tab.

### API-client additions (the only "new code" the prototype forces)
1. **Audit conduct** — extend `src/api/ownerAudit.ts` `audit` with `patch`,
   `upsertSection`, `score`, `addFinding`, `analyzeSurvey` (reads already exist).
2. **Drawings** — new `src/api/drawings.ts`: `list(siteId)` → `GET
   /publish/drawings`, `DrawingOut` type.

### Shared daylight components (engineer-local, `supervisor/_eng.components.tsx`)
`StatTile`, `KindButton`, a daylight `EngNav` custom tab bar (center FAB), site
sheet, proposed-field editor — built on the kit + reusing the owner
`_audit.components` (`ScoreDial`, `SubHeader`, `scoreStatus`, `SEVERITY_META`,
`ITEM_META`).

### Routing fix (cold-start)
`app/index.tsx:44` and `app/(auth)/login.tsx:39` send supervisor →
`/(contractor)/supervisor/capture`. Repoint both to
`/(contractor)/supervisor/home` so the engineer lands on the cockpit.

### Demo seed
`backend/scripts/seed_engineer_calm.py` (model on `seed_owner_calm.py`):
self-contained company "CivilArch (Field Demo)", **Lokesh supervisor login
+919810000010 / OTP 000000**, assigned (`SiteAssignment`) to its sites, with
**requested audits** to run, **published drawings** (incl. a superseded rev),
**action-items** assigned to Lokesh (today's work), and **decisions assigned to
Lokesh** (asks for you, incl. an overdue). `Base.metadata.create_all(checkfirst)`
to sidestep the diverged dev-DB Alembic head; idempotent uuid5 ids.

---

## 4. Verify
- Mobile: `npm run typecheck` + `npm run test` (add a client test mirroring
  `design.test.ts` for the new audit-conduct + drawings clients).
- Backend: `uv run pytest` + `uv run ruff check .` (no new endpoints → existing
  21 audit/survey tests still green; seed is exercised manually).
- Simulator: backend :8000 + Metro :8081, log in as the engineer
  (+919810000010 / 000000), deep-link each screen, screenshot.
