# Design Loop E2E — Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. This is the **program roadmap**: Phases 0–1 have fully-detailed TDD plans (linked below) and are execution-ready. Phases 2–6 are specified here at task level (files, interfaces, acceptance) and each gets its line-exact TDD expansion **just-in-time** before execution — the same pattern as the 2026-06-12 profiler program (Plans 1→5) — because their exact diffs depend on the previous phase's merged state.

**Goal:** Make the Design tab a working end-to-end loop: homeowner intake → AI proposals → decisions → brief → designer sign-off → approval → materialized specs the homeowner can see — with every hand-off signalled, Pinterest effortless, and presets real.

**Spec:** `docs/superpowers/specs/2026-07-05-design-loop-e2e-design.md` (approved 2026-07-05).
**Spec deltas added by founder request (2026-07-05):** (a) Pinterest must "flow easily for everyone" → Workstream P below; (b) real presets strategy → Workstream Q below.

**Architecture:** The engine + `/api/v1/design/*` contract stays the spine; all UIs remain thin clients. New behavior = deterministic server-side *proposal* triggers + an event/notification layer on existing infra (`app/push/sender.py`, `Update` rows, `SiteEventModel`) + completing both cockpits. Humans still commit every decision (Determinism Doctrine).

**Tech stack:** FastAPI + SQLAlchemy async + Alembic (backend), Expo/RN + TanStack Query (mobile, Calm Cockpit for homeowner / Neev for contractor), React+Vite web (Blueprint), Expo push via `send_expo_push`.

## Global constraints

- Determinism Doctrine: LLM narrates proposals only; confidence/counts/money always from reducer math; a named human commits every decision.
- Membrane: every homeowner-reachable endpoint uses `_load_accessible_profile` + (for commits) `member_sub_role`/`can_approve` — mirror `act_on_brief` (`app/profiler/router.py:1133-1153`). Cross-company always 404, never 403-leak.
- Mobile test files live under `mobile/src/`, NEVER `mobile/app/` (Expo Router evaluates app/ modules at startup).
- Verify web with `npm run build` (tsc -b), not `npm run lint`.
- Backend gates before push: `ruff check` + `pytest`; mobile: `npm run typecheck` + jest. New screens get an iOS-sim smoke (jest can't catch missing providers/endpoints).
- Copy checkpoints: English lead, Hindi secondary. Calm language (never scary reds for advisory states).
- All profiler routes stay Labs-mounted (`main.py:153`); `enable_labs` is on in prod — everything ships live once merged.

## Phase sequence & status

| Phase | What | Detailed plan | Depends on |
|---|---|---|---|
| 0 | Land the in-flight fix pass (incl. the Pinterest parse fix = "Pinterest doesn't work" root cause) | ✅ **DONE — merged as PR #243 (`4936256`) 2026-07-05**; plan doc kept for the record | — |
| 1 | Backend ignition + authority + hygiene | ✅ **MERGED** (PR #244) | 0 |
| 2 | Design events → push + bell inbox + activity + badges | ✅ **MERGED** (PR #248, né #245) | 1 |
| 3 | Designer cockpit completion (mobile architect + web) | ✅ **MERGED** (PR #246; incl. the request_changes membrane fix) | 1 (2 for badges) |
| 4 | Homeowner loop completion (incl. P2/P3/P4 Pinterest, Q1/Q3/Q5 presets) | ✅ **MERGED** (PR #247) | 1 (2 for banners) |
| 5 | One inspiration surface + visible payoff | ✅ **MERGED** (PR #249; incl. Decision→Spec sync + site_id fixes) | 4 |
| 6 | Full-loop seeds, sim smoke, verify, deploy | ✅ seed + 15/15 API loop-walk PASS; deploy in flight (this PR) | all |

Phases 3 and 4 parallelize (different apps, same contracts). Workstream Q1–Q2 (preset catalog pipeline) has no dependencies and can run any time after Phase 0.

---

## Phase 2 — Design events: push + bell inbox + activity + badges

**Detailed plan:** `2026-07-05-design-loop-phase2-events.md`. **New module:** `backend/app/profiler/events.py` with a single `notify_design_event(session, profile, kind, *, note, area_label, version)`.

Behavior (all failure-isolated — an event error never 500s the triggering request):
1. Homeowner direction: `notify_site_homeowners(...)` (`app/push/sender.py:170`) — it already persists the bell-inbox `HomeownerNotification` row AND sends cadence-gated push in one call (`category="design"`, never spike).
2. Designer direction: `push_tokens_for_user(...)` over the company's architect users → `send_expo_push` with deep-link `data`.
3. **Deliberately NO `Update` rows and NO `SiteEventModel` rows** — both are consumed by unrelated surfaces (WhatsApp brief, site register); writing shadow rows there is exactly the pollution bug PR #240 had to clean up. Owner-web activity instead reads profiler tables directly (`ProfilerBriefApproval` + `ProfilerBrief`) as a 10th source with kind `design_update`.

**Event catalog** (kind → audience → deep-link):

| kind | audience | link |
|---|---|---|
| `profile_started` | homeowner | `/design/profiler` |
| `themes_ready` | homeowner + designer | `/design/profiler/[area]` / architect `dp/[id]` |
| `clarifications_asked` | homeowner | `/design/profiler/[area]?tab=notes` |
| `clarification_answered` | designer | architect `dp/[id]` |
| `conflict_detected` / `conflict_resolved` | both | area / dp |
| `brief_ready` (vN) | homeowner + designer | `/design/brief` |
| `brief_sent_to_designer` | designer | architect `dp/[id]` |
| `changes_requested` (note) | homeowner | `/design/brief` |
| `designer_signed_off` | homeowner | `/design/brief` |
| `brief_approved` | designer + contractor | web `/designer?tab=intake` |
| `brief_locked`, `specs_materialized` | homeowner + designer | selections surfaces |

**Emit points:** inside Phase-1's `engine.py` proposal hook (themes_ready/clarifications_asked/conflict_detected), `act_on_brief` (all transitions), `generate_brief` (brief_ready), `materialize_brief` (specs_materialized), self-serve/contractor profile create (profile_started).

**Tasks:**
1. `events.py` + unit tests (kind catalog, copy, token targeting — asserted via the push sender's `dry_run_log()`).
2. Wire emit points after each domain commit (one test per trigger; illegal transitions emit nothing).
3. Owner-web activity: 10th source read from `ProfilerBriefApproval`/`ProfilerBrief` → kind `design_update`, link `design_brief` + web render row.
4. Mobile push-tap routing for `data.type === "design"` in `app/_layout.tsx`.
5. Designer badges endpoint: `GET /api/v1/design/inbox-summary` → `{briefs_awaiting_signoff, answered_clarifications, deferred_conflicts}`. **Decision recorded: v1 = state-based counts, no read-tracking (YAGNI).**

**Acceptance:** every state transition in a full loop run produces exactly the catalog's events; homeowner sees Update cards + gets pushes; architect Brief hub badge shows counts; zero events on illegal transitions; backend suite green.

---

## Phase 3 — Designer cockpit completion

Mobile (`mobile/app/(contractor)/architect/`) + web (`web/src/features/designer/`).

| # | Task | Files | Acceptance |
|---|---|---|---|
| 3.1 | Brief action bar: **Sign off** + **Request changes (required note)** wired to `design.actOnBrief` | mobile `dp/[id].tsx`; web `Intake.tsx` | architect_review brief → both actions work, state chip updates, timeline row appears; note required for request_changes (client + 422 server tolerance) |
| 3.2 | **Generate / Regenerate brief** button (uses Phase-1 opened gate) + version chip | same files + `client.ts` `design.generateBrief(profileId)` wrapper; web `designApi.generateBrief` | from `revision_requested`, tapping Regenerate creates vN+1 in homeowner_review (the dead-end exit); disabled state while running |
| 3.3 | Clarifications panel: questions + answers, "regenerate brief" nudge when new answers exist | mobile `dp/[id].tsx` section; web `Intake.tsx` panel; uses existing `design.clarifications(pid)` | seeded Q&A renders; unanswered vs answered grouped; empty state honest |
| 3.4 | Web conflict parity: list + resolve (incl. `deferred_to_architect` queue = "Homeowner asked you to decide") | web `Intake.tsx` (or new `Conflicts.tsx` panel) calling `POST /conflicts/{id}/resolve` | resolve updates list; deferred queue badge; membrane errors surfaced |
| 3.5 | Mobile materialize (parity with web) + result sheet ("8 specs created — view in Selections") | mobile `dp/[id].tsx` + `client.ts` `design.materialize(briefId)` | only enabled in contractor_brief_ready/approved/locked; 409 `brief_not_ready` handled; links to selections.tsx |
| 3.6 | Web profile list (not just by-site): reuse `GET /profiles` | web `Intake.tsx` header select | architect with 2+ sites can switch briefs without leaving page |
| 3.7 | Badges from Phase-2 summary on mobile Brief hub + web Intake tab label | `brief.tsx`, `DesignerWorkspace.tsx` | counts render; zero-state clean |

**Acceptance (phase):** a designer can run their entire half of the loop from either surface: see new brief → read answers/conflicts → request changes or sign off → materialize. Sim smoke on mobile; `npm run build` green on web.

---

## Phase 4 — Homeowner loop completion

All screens Calm Cockpit (`constructo-homeowner-design` skill), EN lead + HI strings.

| # | Task | Files | Acceptance |
|---|---|---|---|
| 4.1 | **"Questions for you" card** (Design tab + area AI-notes tab): list open clarifications, tap → answer sheet → `design.answerClarification` | `design.tsx` (DPHub), `design/profiler/[area].tsx`, new `src/homeowner/clarifications.util.ts` + test | unanswered count on card; answering removes from list, fires toast; empty → card hidden |
| 4.2 | **Conflict sheet** replaces the toast stub: shows both contributors' pulls (dimension/value), actions = *Go with A / Go with B / Write our decision / Ask our designer* (→ `defer_to_architect`) via Phase-1-opened `resolveConflict` | `[area].tsx` conflict card + new sheet component | owner/co-owner resolves; family sees read-only + "only an owner can settle this"; resolved conflicts show decision + who |
| 4.3 | **Theme review card** (area Brief tab + DPHub "From the AI"): Approve / Adjust (note) / Not this one via Phase-1-opened `decideTheme` | `[area].tsx`, `design.tsx` | suggested themes actionable for owner/co-owner; decisions attributed ("Approved by Pratibha"); family read-only |
| 4.4 | **State-aware Design banner + post-action next-step**: DPHub banner renders brief state ("With your designer since Tue" / "Designer asked for changes — read note" / "Signed off — your approval unlocks pricing" / "Being priced"); every approval action lands on a confirmation state naming the next actor | `design.tsx`, `design/brief.tsx`, util + test for state→copy map | all 7 BriefStates map to honest copy incl. next actor; request-changes note visible |
| 4.5 | **"Get my brief"** homeowner CTA (Phase-1 gate): appears when ≥1 area ready + no brief yet; regenerate offered after changes_requested | `design.tsx`, `brief.tsx` | generates v1/vN+1; while-running state; family sees explainer instead |
| 4.6 | **Brief version history**: version chip + prior-version list + deterministic "what changed" (payload diff of areas/material_families — pure util + test) | `brief.tsx`, `src/homeowner/brief_diff.util.ts` | v2 vs v1 shows added/removed materials per area; no LLM |
| 4.7 | **Design chat unstubbed**: the 3 stub buttons deep-link into the crew conversation via `useOpenHomeownerChannel` (PR #241 contract) with prefilled draft ("About our kitchen design brief v2: …") | `design.tsx`, `design/profiler.tsx`, `[area].tsx` | lands in chat with context prefilled; stub toasts deleted |
| 4.8 | **P2 — "Paste from Pinterest" one-tap**: add `expo-clipboard`; button in the pin sheet reads clipboard on tap (no auto-read → no iOS paste banner surprise), validates `is_pinterest_url`, submits | `[area].tsx` pin sheet; `package.json` | copied pin link → one tap adds it; non-pinterest clipboard → helpful message |
| 4.9 | **P3 — multi-link paste**: pin sheet textarea accepts multiple URLs (split on whitespace/newlines), sequential `referenceFromLink` with per-item result list (added / failed+reason) | `[area].tsx` + `src/homeowner/pin_paste.util.ts` (URL extraction util + test) | 3 pasted links → 3 tiles (or per-link errors); partial failure doesn't lose successes |
| 4.10 | **Q3 — Preset quick-start deck**: area with 0 refs shows "Rate 10 designer picks" → full-screen one-at-a-time deck (image + 1–5 stars) that `referenceFromPreset` + `rankReference` per card; skip allowed | new `design/profiler/quickstart.tsx` (route `href:null`) + util test in `src/` | 10 ratings → area jumps to ranked state, taste/themes fire (Phase 1); exit mid-way keeps progress |

**Acceptance (phase):** a homeowner with nothing but the app can: start → quick-start rate → answer questions → settle a disagreement → approve a theme → get the brief → send it → see "with your designer" → read the response → approve — without ever hitting a dead end or a "coming soon". Sim smoke mandatory (new routes registered `href:null` in `_layout.tsx`).

---

## Phase 5 — One inspiration surface + visible payoff

| # | Task | Files | Acceptance |
|---|---|---|---|
| 5.1 | Room↔area mapping util (`room_tag`/space name → profiler `area_key`, both directions, HI-safe slugs) | `src/homeowner/design_area_map.util.ts` + test; backend none | pure function, tested on seed names incl. "pooja"/underscore variants |
| 5.2 | `references/[room].tsx` re-pointed at the profiler: reads that area's references, add-flow = the same Upload/Pinterest/Preset trio; legacy homeowner refs shown in a collapsed "Earlier saves" section (read-only dual-read) | `references/[room].tsx` | one add-flow everywhere; legacy rows still visible; no writes to the legacy endpoint from UI |
| 5.3 | Selections-tab "References" chips → profiler area screen; delete the duplicate board entry-point | `design.tsx` | no path creates un-ranked orphan references anymore |
| 5.4 | Payoff surface: routed brief-born Specs already become homeowner `Decision(kind=approval, spec_id=…)` rows (`sync_spec_routed_decision`); expose `spec_id`+`spec_label` on `HomeownerDecisionOut` and group them in the Selections tab as "From your design brief" — NO new approval path | backend `my_decisions` + schema + tests; `design.tsx` | "Your brief became material choices — 3 waiting on you" renders from real Decision rows; approve stays owner-gated in the existing decisions flow |
| 5.5 | Style-profile prose: keep, but source its draft from profiler taste when a profile exists (fallback to legacy fingerprint) — decision D-5.5 recorded: keep-and-feed, not retire | `app/homeowner/ai.py` touchpoint + test | draft mentions ranked-taste materials when profiler data exists |

---

## Phase 6 — Prove it, then ship

1. `scripts/seed_design_loop_demo.py`: one command seeds BOTH personas mid-loop (homeowner ranked 2 areas, 1 conflict open, clarifications asked, brief v1 sent; architect side has 1 deferred conflict + unanswered brief) — the demo = walking the loop closed from both phones.
2. iOS sim smoke checklist (every new/changed screen, both personas) — runtime-context bugs don't show in jest.
3. Gates: backend `ruff check` + full pytest; mobile `npm run typecheck` + jest; web `npm run build`. Zero regressions tolerated.
4. Deploy: backend rev to Azure (`az containerapp update`, Azure-for-Students sub), Vercel auto for web; post-deploy `/healthz` + one live loop transition against prod with the pilot allowlist.

---

## Workstream P — Pinterest "flows easily for everyone"

| # | What | Where | Status/phase |
|---|---|---|---|
| P0 | **Root fix (parse + stale-link)**: real pin pages emit `content` before `property` — the old regex failed on EVERY real pin; per-tag parser + `pinterest_unresolved` 422 for dead pin.it links. Already written in the in-flight pass | `app/profiler/pinterest.py` | **Phase 0 lands it** |
| P2 | One-tap "Paste from Pinterest" (clipboard on explicit tap) | mobile pin sheet | Phase 4.8 |
| P3 | Multi-link paste with per-item results | mobile pin sheet | Phase 4.9 |
| P4 | **Board links without OAuth** (experimental, server-flagged `PINTEREST_BOARD_IMPORT=false` default): detect `pinterest.com/{user}/{board}/` URLs → fetch page (same no-redirect + host-guard discipline) → extract embedded `__PWS_DATA__` JSON script tag → collect up to 10 pin image URLs → re-host each through the EXISTING per-image path (`assert_safe_media_url` on every URL); graceful 422 with "paste individual pins" guidance when the embed shape changes. Fixture-HTML tests only (no live scrape in CI) | `pinterest.py` (`parse_board_pins(html) -> list[str]`), `router.py` from-link branch, `config.py` flag | Phase 4-adjacent backend task; expand JIT with 4 |
| P5 | Official OAuth board-sync (`boards:read`/`pins:read`) — **founder action now**: create the Pinterest dev app + apply for Standard access (reviewed app + demo video = the long pole). `source_type` already pluggable; build lands post-approval as its own plan | — | fast-follow |

Design intent: the homeowner path is *copy a pin (or board) in the Pinterest app → open Neev → one tap*. Every failure names the fix in homeowner language.

## Workstream Q — Presets that are real

Today `scripts/seed_profiler_presets.py` generates Pillow gradients — placeholders by design. Making presets real:

| # | What | Detail |
|---|---|---|
| Q1 | **Manifest-driven catalog pipeline**: `backend/assets/presets/manifest.json` (`[{pack, title, area_kind, area_key\|null, file, tags?}]`) + images in `backend/assets/presets/<pack-slug>/`; extend the seed script with `--from-dir assets/presets` mode reusing the exact upsert (uuid5 of R2 key, idempotent, overwrite bytes). Gradient mode stays as fallback for empty dev envs | small script change + tests for manifest validation (missing file / bad area_kind → named error, no partial writes) |
| Q2 | **Catalog content (founder-in-the-loop)**: target ≈6 packs × ~8 images covering Indian-home reality — *Warm Minimal, Modern Indian, Earthy Traditional, Soft Neutrals, Bold Contemporary, Classic Heritage* × kitchen / living / master bedroom / bath / pooja / facade / balcony. Sources: CivilArch project photography (best: real, owned, on-brand) + explicitly-licensed stock where gaps remain. **Licensing note:** verify each source's terms for in-app redistribution; CivilArch-owned photos are the safe core. Every preset carries pack+title attribution in-row |
| Q3 | **Quick-start rating deck** (the zero-friction intake for users with no Pinterest and no photos) — Phase 4.10 |
| Q4 | Pack browsing in the preset sheet: pack chips → filtered grid, multi-add | mobile preset sheet, with Q1 data |
| Q5 | Idempotent add: adding the same preset twice to one area for the same contributor reuses the row (uuid5 or unique constraint check) instead of duplicating | backend `add_reference_from_preset` + test |

Q1/Q5 are backend-small and can land with Phase 1's PR if convenient; Q2 runs whenever the founder assembles images (script makes re-seeding safe); Q3/Q4 land with Phase 4.

---

## Decisions locked (from spec §7 + this plan)

D1 homeowner theme authority ✅ (Phase 1) · D2 chat = deep-link ✅ (4.7) · D3 UI-level unification ✅ (Phase 5) · D4 auto-propose/human-brief ✅ (Phase 1) · D5 self-serve start ✅ (Phase 1) · D-2.5 badges are state-computed, no read-tracking · D-5.5 style-profile prose kept, fed by profiler taste · P4 board import ships flag-off until fixture confidence · Q2 CivilArch photos are the primary preset source.

## Verification gate (every phase)

`cd constructo/backend && ruff check . && pytest` · `cd constructo/mobile && npm run typecheck && npx jest` · web-touching phases: `cd constructo/web && npm run build` · UI phases: iOS sim smoke of each new screen · every task = its own commit; every phase = its own branch + PR + review (subagent-driven, two-stage review, per repo convention).
