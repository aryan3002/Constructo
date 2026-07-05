# Phase 5 — One Inspiration Surface + The Visible Payoff

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill the two-reference-systems confusion (the profiler becomes THE inspiration surface; the legacy room board becomes read-only history) and make the loop's payoff visible: brief-born material selections show up in the homeowner's Design tab through the existing Decision inbox.

**Architecture (deliberate reuse):** No new approval path. Materialized Specs already flow: designer routes a spec (`POST /specs/{id}/route`, `app/specs/router.py:248-272`) → `sync_spec_routed_decision` creates a `Decision(kind=approval, spec_id=...)` → homeowner's existing `GET /homeowner/decisions` + `respond` (`app/homeowner/router.py:2367-2437`, owner-gated approve). Phase 5 only (a) exposes `spec_id` on the homeowner decision payload, (b) groups those under "From your design brief" in the Design tab, (c) unifies the add-inspiration UX. Full data migration of legacy `DesignReference` rows stays deferred (dual-read).

**Assumes:** Phases 1–4 merged.

**Branch:** `feat/design-loop-p5-unify`.

## Global Constraints

- Legacy homeowner reference ENDPOINTS keep working (older app builds in the field); only the UI stops writing to them.
- Room↔area mapping must handle Hindi/`pooja`/underscore/space variants — same normalization family as `_norm_area_key` (`app/profiler/router.py:111`).
- Membrane: the new spec read surfaces only rows for sites the homeowner belongs to; cross-company 404.
- Gates: backend ruff+pytest; mobile typecheck+jest; sim smoke rides Phase 6.

---

### Task 1: `design_area_map.util.ts` — room↔area bridge

**Files:** Create `mobile/src/homeowner/design_area_map.util.ts` + test.

**Interfaces:** `areaForRoom(roomSlugOrName: string, areas: ProfilerArea[]) -> ProfilerArea | null` (normalize both sides: lowercase, trim, `-`/`_`→space, collapse spaces; exact match then startsWith) and `roomLabelForArea(area) -> string`.

- [ ] **Step 1: Failing test** — `areaForRoom('master-bedroom', [{area_key: 'master bedroom'}…])` matches; `'Pooja'`→`'pooja'` matches; no match → null; `areaForRoom('all', …)` → null (caller shows the hub).
- [ ] **Step 2-3:** implement → green → commit `feat(homeowner): room↔area mapping util`

### Task 2: `references/[room].tsx` re-pointed at the profiler

**Files:** Modify `mobile/app/(homeowner)/design/references/[room].tsx`.

- [ ] **Step 1:** Resolve `pid` via `design.profileBySite(siteId)` and the area via `areaForRoom(roomSlug, profile.areas)`.
  - Area found → the grid reads `design.references(pid, area.id)`; "Add reference photo" runs the PROFILER upload path (presign/multipart → `design.addReference`) — identical UX to `[area].tsx` Inspiration tab; a "Rank these" Button routes to `/design/profiler/[area]?tab=ranking`.
  - No area (custom room, or no profile yet) → keep the legacy behavior + a quiet hint "Start your style profile to get AI suggestions from these photos" → self-serve start (Phase 1).
  - Legacy `homeowner.designReferences()` rows for the room render in a collapsed "Earlier saves" section, read-only.
  - Delete the local-only "Shared with builder" toggle (stub honesty is over — the profiler board IS shared with the design team by construction; say that in a Small caption instead).
- [ ] **Step 2:** typecheck/jest (extend the existing `references` tests if present; else the mapping util test carries the logic). **Step 3: Commit** `feat(homeowner): one inspiration surface — room board reads the profiler`

### Task 3: Selections tab chips + duplicate entry removal

**Files:** Modify `mobile/app/(homeowner)/design.tsx`.

- [ ] **Step 1:** The per-room "References" chip navigates as before (the screen now profiler-backed via Task 2 — no change needed to the chip target); REMOVE any remaining second add-inspiration entry that writes legacy rows. Verify with `grep -n "homeowner.references(" mobile/app` → only `references/[room].tsx`'s legacy-fallback branch remains.
- [ ] **Step 2:** typecheck; commit `chore(homeowner): no path creates orphan un-ranked references`

### Task 4: The payoff — brief-born selections in the Design tab

**Files:**
- Modify: `backend/app/homeowner/router.py` `my_decisions` (:2367-2395) + `HomeownerDecisionOut` in `app/homeowner/schemas.py` — add `spec_id: UUID | None` and `spec_label: str | None` (join `Spec.label` when `Decision.spec_id` set)
- Modify: `mobile/src/api/client.ts` (HomeownerDecision type + fields), `mobile/app/(homeowner)/design.tsx` (Selections tab)
- Test: `backend/tests/homeowner/test_decisions.py` (extend), mobile jest for the grouping util

- [ ] **Step 1: Backend failing test** — route a spec (existing specs factory + `POST /specs/{id}/route` as company owner) for a site the homeowner belongs to → `GET /homeowner/decisions` row now carries `spec_id` + `spec_label`; a decision without spec keeps nulls.
- [ ] **Step 2:** implement (one `selectinload`/join; no new endpoint).
- [ ] **Step 3: Mobile** — Selections tab gains a top group when any decision has `spec_id`: header "From your design brief" + count line "Your brief became material choices — {pending} waiting on you"; rows: `spec_label` + StatusPill(state) → existing decision detail route (`/(homeowner)/decisions/[id]`) where approve/comment already work owner-gated. Grouping logic = 10-line util + test (`briefBornDecisions(decisions)` filter).
- [ ] **Step 4:** green both sides. **Step 5: Commit** `feat(design): the brief's payoff is visible — materialized selections reach the homeowner`

### Task 5: Style-profile prose fed by profiler taste (D-5.5)

**Files:** Modify `backend/app/homeowner/ai.py` (`generate_design_profile_v2` input assembly); Test: extend `tests/homeowner/test_design.py`.

- [ ] **Step 1: Failing test** — site with a profiler profile whose kitchen area has `taste_model {"materials": {"light oak": 0.9}}` → `PUT /design/profile` draft mentions the profiler-derived signal in its deterministic fingerprint inputs (assert the fingerprint/summary passed to the LLM — FakeLLM echoes inputs — contains "light oak"); site with no profiler profile → unchanged legacy path.
- [ ] **Step 2:** implement: fetch latest non-archived `ProfilerProfile` for the site; fold top-3 taste dimensions per area into the fingerprint text block (deterministic ordering: weight desc, then alpha). No schema change.
- [ ] **Step 3-4:** green → commit `feat(homeowner): style-profile prose draws on ranked taste`

### Task 6: Phase gate

- [ ] Backend full suite + ruff; mobile typecheck + jest; grep-check Task 3's invariant; PR `feat(design): Phase 5 — one surface in, visible payoff out`, review, merge.

## Self-review notes
- Decision-inbox reuse means zero new approval machinery and the money-safety gate (`can_approve`) comes free.
- Legacy rows: readable forever, writable never (from current UI) — migration deferred deliberately.
