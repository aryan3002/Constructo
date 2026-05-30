# H0 — Homeowner Backend (handoff for H1/H2)

The "published slice" the homeowner mobile app consumes. Built on the existing
FastAPI backend. **Branch:** `mobileH0-backend`. **One migration:**
`f127c51fd73c` (all 13 new tables + the `homeowner` user role). No later wave
adds a migration.

## Two invariants every endpoint enforces

1. **Contractor is publisher.** Homeowner reads return ONLY curated/published
   rows — never raw `site_events`, headcounts, vendor names, RA bills, or
   unpublished media. Data reaches the homeowner only through `/api/v1/publish/*`.
2. **Scope to the member's site.** Every homeowner read resolves a single site
   via membership (`homeowner_members`). A homeowner can **never** see another
   property — passing another site's `site_id` is `403`; an unknown one is `404`.

**Honest-AI:** captions, the weekly summary, the design profile, and the
consistency check are **AI-drafted, then human-confirmed/edited** — never
auto-published, never invented. The LLM uses the existing provider-agnostic
`app.extraction.llm` abstraction (`FakeLLMClient` in tests, no network).

## Auth / roles

- New role `UserRole.homeowner`. JWT is the same bearer scheme as the rest of the
  API (`Authorization: Bearer <token>`). Landing for homeowner = `"home"`.
- Homeowners are real `users` rows, created on join. They get site visibility via
  `homeowner_members` (NOT the contractor `visible_site_ids`).
- Dev OTP is still `000000`.

## New tables (migration `f127c51fd73c`)

| Table | Key fields |
|-------|-----------|
| `properties` | id, company_id→companies, site_id→sites, display_name, type, status, started_on, expected_handover_on, created_at |
| `spaces` | id, site_id→sites, parent_id→spaces (nullable), name, kind `floor\|room\|zone`, `order` |
| `components` | id, space_id→spaces, name, kind, status `not_started\|in_progress\|done` |
| `design_profiles` | id, site_id→sites, profile (jsonb), created_at, updated_at |
| `design_references` | id, site_id→sites, image_url, room_tag, source `upload\|pinterest`, created_at |
| `design_selections` | id, site_id→sites, space_id→spaces (nullable), item, choice, status (str), created_at |
| `published_photos` | id, site_id→sites, source_event_id→site_events (nullable), image_url, caption, room_tag, milestone_id→milestones (nullable), is_starred, published_by→users, published_at |
| `updates` | id, site_id→sites, type `progress\|milestone\|decision_needed\|delay\|change\|quiet`, title, body, published_by→users, published_at |
| `weekly_summaries` | id, site_id→sites, week_start, text, published_by→users, published_at |
| `milestones` | id, site_id→sites, name, status `upcoming\|now\|done`, started_on, expected_on, completed_on, `order` |
| `changes` | id, site_id→sites, description, cost_delta (numeric ₹), schedule_delta_days, reason, requested_by (bare uuid), approved_by (bare uuid), created_at |
| `homeowner_members` | id, site_id→sites, user_id→users (nullable until joined), sub_role `primary_owner\|co_owner\|family\|advisor`, notif_prefs (jsonb), phone, join_code (unique), status `invited\|active`, created_at |
| `homeowner_requests` | id, site_id→sites, raised_by (bare uuid), title, detail, status `sent\|seen\|in_progress\|done`, sla_due_at, nudged_at, created_at, updated_at |

Homeowner approvals/questions **reuse the existing `decisions` table** (kind
`homeowner_question`); no separate table.

ORM imports: `from app.models import Property, Space, Component, DesignProfile,
DesignReference, DesignSelection, PublishedPhoto, Update, WeeklySummary,
Milestone, Change, HomeownerMember, HomeownerRequest` (+ the enums:
`SpaceKind, ComponentStatus, ReferenceSource, UpdateType, MilestoneStatus,
HomeownerSubRole, MemberStatus, HomeownerRequestStatus`).

## Homeowner API — `/api/v1/homeowner` (role: homeowner unless noted)

Onboarding / membership
- `POST /join` `{join_code, phone, otp}` → `{token, site_id, sub_role}` (public)
- `POST /members` `{site_id, sub_role?, phone?, notif_prefs?}` → member + `join_code` + `invite_link` (**contractor:** owner/PM)
- `GET /members` → caller's own memberships
- `PATCH /members/{member_id}` `{notif_prefs}` → updated membership

Feed reads (all accept optional `?site_id=`; default = your sole property)
- `GET /home` → `{property, milestone_now, milestone_next, needs_attention[], recent_activity[], spend_summary?}` (status card is a **time-bar**: started_on→expected_handover_on; conditional sections empty when bare)
- `GET /photos?view=all|room|milestone` → `Page<PhotoOut>`
- `GET /updates` → `Page<UpdateOut>`
- `GET /weekly-summary` → `[WeeklySummaryOut]` (newest week first)
- `GET /changes` → `{items[], total_cost_delta, total_schedule_delta_days}`
- `GET /milestones` → `[MilestoneOut]` (by `order`)
- `GET /property` → `PropertyOut` with `spaces[]` (each has `components[]` + `progress` 0..1)

Design
- `GET /design/profile` → `{id?, site_id, profile, created_at?, updated_at?}`
- `PUT /design/profile` `{site_id?, profile?}` → if `profile` omitted, **AI-drafts** from selections+references; else saves the confirmed profile verbatim
- `POST /design/references` `{image_url, room_tag?, source?}`
- `GET /design/selections` · `POST /design/selections` `{item, choice, space_id?, status?}`
- `POST /design/consistency-check` `{item, choice}` → `{fits, feedback}` (advisory; `fits` defaults true — **never gates**)

Requests & decisions
- `POST /requests` `{title, detail?}` → request (auto SLA, status `sent`)
- `GET /requests` → `[RequestOut]`
- `PATCH /requests/{id}` `{status}` → move `sent→seen→in_progress→done` (homeowner or contractor)
- `GET /decisions` → pending decisions on your property
- `POST /decisions/{id}/respond` `{action: approve|comment|request_change, note?}` (approve→resolved, comment→acknowledged, request_change→rejected)

## Publisher API — `/api/v1/publish` (contractor: site must be in scope)

- `POST /photo` `{site_id, image_url, source_event_id?, caption?, room_tag?, milestone_id?, is_starred?, event_summary?}` — caption AI-drafted from the event/summary when omitted
- `POST /update` `{site_id, type, title, body?}`
- `POST /weekly-summary` `{site_id, week_start, text?}` — text AI-drafted from the week's updates when omitted
- `POST /property` · `PATCH /property/{id}`
- `POST /spaces` · `PATCH /spaces/{id}` · `DELETE /spaces/{id}`
- `POST /components` · `PATCH /components/{id}` · `DELETE /components/{id}`
- `POST /milestones` · `PATCH /milestones/{id}` · `DELETE /milestones/{id}`
- `POST /changes` `{site_id, description, cost_delta?, schedule_delta_days?, reason?}`
- `GET /members?site_id=` — list members invited to a site

## Scheduler callables (exposed, NOT wired — H3 wires them)

- `app.homeowner.nudge.run_request_nudge_sweep(session, *, now=None)` — one-nudge
  SLA for overdue homeowner requests; raises a tagged contractor `Decision` and
  stamps `nudged_at` so it never double-nudges. Returns nudged request ids.
- Reuse existing `app.approvals.sla.run_sla_sweep` for decision SLA escalation.

## Tests

`backend/tests/homeowner/` — models round-trip, join→token, publisher→feed,
cross-site isolation, AI design profile + consistency check, request nudge sweep,
decision respond. All FakeLLM, no network. Run: `cd backend && uv run pytest
tests/homeowner -q`. Fresh-DB migration verified up + down.
