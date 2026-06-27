# Proactive AI Intelligence — Design Spec

**Date:** 2026-06-25
**Status:** Approved design, pending implementation plan
**Author:** Brainstormed with Claude (Opus 4.8)

---

## 1. Context & Goal

Today the product's AI is **reactive**: it answers when asked (`@ask`, homeowner `ask`, semantic search) under a strong *deterministic-first, grounded, abstain-over-invent* doctrine. It never proactively tells anyone something is wrong.

The goal: make the AI **proactive and the smartest thing in the product** — it should watch every site, catch inconsistencies and work that is "not up to the mark," compare actual progress against how an Indian residential build *normally* goes, and surface what humans miss. For the homeowner specifically, it should be a **quiet advocate** that watches the build stay true to their approved design and keeps them honest about decisions they're sitting on.

This is built on top of, not in place of, the existing doctrine. Detection is deterministic wherever possible; the LLM is a last resort.

### What the research established (Indian residential construction)

- **~90% of contractors plan in their head + WhatsApp + Excel.** No Gantt chart. Planning breaks down at 3+ active sites.
- **Material mismanagement causes ~50% of timeline overruns**; labor (migrant workers leaving for festivals/harvest, monsoon) is the #1 delay cause.
- **Standard phase sequence & durations are well-known and stable** — and already encoded in this codebase (`milestone_reference.py`).
- **Competitor Powerplay** (₹, $10M ARR, 85K+ projects) connects a WBS/Gantt to daily site updates and auto-tracks progress. Our differentiation is the *grounded, honest, WhatsApp-native* path — no Gantt data-entry burden.

---

## 2. Decisions (locked)

| Decision | Choice |
|----------|--------|
| **Where findings surface** | Daily **morning brief** (push) **+** **Site Health dashboard** (pull). **No real-time in-chat alerts.** |
| **What it detects** | Work consistency, schedule drift, quality/compliance, operational, and **design/theme consistency**. **Cost anomalies deferred.** |
| **Who sees findings** | Contractor (owner + PM) sees raw findings; **homeowner sees a filtered, warm subset** through the trust membrane. |
| **Homeowner role** | Not passive — a **two-way feedback loop**: homeowner can resolve AI-detected design deviations *and* proactively flag "something looks off." Every response sharpens the taste model. |
| **Dashboard location** | Full page on **web** + summary **card on mobile** (contractor). |
| **Approach** | **C — Learned Plan**: industry baseline runs day one, learns from contractor history over time, explicit plan layers on later. |

### Open question (deferred by user)

- **Plan input method** — how a contractor supplies an *explicit* plan (template / chat-driven / wizard / BOQ import). User is confirming with a domain expert. The system is designed to work **without** this from day one (industry baseline), so it is not a blocker. The explicit plan becomes an *override* layer when defined.

---

## 3. Approach C — "Learned Plan"

The AI never forces the contractor to fill out a plan. It compares actual site progress against a **baseline shadow timeline**:

1. **Industry baseline (day one):** the existing curated typical-duration table per phase.
2. **Learned baseline (over time):** once a contractor completes ≥3 sites, shift the baseline toward *their* actual historical durations (the existing table's docstring already anticipates this).
3. **Explicit plan (optional, later):** when the plan-input method is defined, a contractor-supplied plan overrides the baseline.

Graceful degradation: even with zero plan input, every site gets useful intelligence from the industry baseline.

---

## 4. Architecture

### 4.1 When it runs

Detection runs **nightly, on the existing APScheduler cron** that already generates the morning brief.

- Scheduler: `app/scheduler.py` — `AsyncIOScheduler` + `CronTrigger(hour=settings.brief_hour …)`, default **07:00 Asia/Kolkata**, gated by `ENABLE_SCHEDULER` env.
- Nightly job: `_run_nightly_job()` → today loops companies and calls brief delivery. We insert a detection step **before** brief generation so the brief reads fresh findings.

```
[ nightly cron — app/scheduler.py ]
  └─ for each active site:
       ├─ intelligence.engine.run(site_id)        # NEW
       │    ├─ gather: recent events, milestones, specs, themes, baseline
       │    ├─ run detectors  (15 deterministic · 2 vision adapters)
       │    ├─ dedupe vs existing OPEN findings
       │    ├─ persist SiteFinding rows
       │    └─ compute health score
       ├─ build_brief(company_id, date)           # EXISTING — now reads SiteFinding
       └─ homeowner surface filter                # NEW — homeowner-safe findings
```

### 4.2 New backend module — `app/intelligence/`

```
app/intelligence/
  sequence.py          # EXTENDS milestone_reference.py: adds depends_on / can_overlap
                       #   + phase → expected-work/materials map. Durations reused.
  findings.py          # SiteFinding model + CRUD + dedupe logic
  engine.py            # orchestrator: run detectors → dedupe → persist → score
  score.py             # transparent weighted health score (0-100)
  detectors/
    consistency.py     # material-work mismatch, work-without-material, photo-progress
    schedule.py        # stale milestone, sequence violation, idle gap, attendance erosion
    quality.py         # missing approval, curing violation, repeat issue, spec deviation
    operational.py     # vendor concentration, photo quality, weather conflict
    design.py          # material-theme clash (deterministic), photo-vs-theme (vision),
                       #   cross-room coherence — all reuse profiler taste.check_consistency()
  surface/
    brief.py           # renders findings into the contractor brief (extends brief/generate.py)
    homeowner.py       # filter + warm-reframe for the trust membrane
```

### 4.3 Reuse points (verified — do NOT rebuild)

| Existing asset | File | How we reuse it |
|----------------|------|-----------------|
| **Industry baseline** | `app/homeowner/milestone_reference.py` | `typical_duration_days(name)` already maps milestone names → `(min,max)` days for Indian residential phases. `sequence.py` imports it; adds only ordering/dependencies + a phase→work/material map. |
| **Design consistency core** | `app/profiler/taste.py` → `check_consistency(attrs, taste_model)` | Design detectors extract attributes from a spec/photo, then call this **existing** deterministic function. No new aesthetic-judgment logic. |
| **Taste model** | `profiler_areas.taste_model` (JSONB) | The per-area dimension scores to compare against. |
| **Vision attribute extraction** | `app/profiler/extraction.py` → `extract_reference_attributes` | Reused by the photo-vs-theme detector (the one true vision call). |
| **Existing risks** | `app/brief/risk.py` (4 detectors) | Migrated into the `SiteFinding` framework (converge, don't fork). Brief keeps working. |
| **Variance classifier** | `app/attendance/service.py` → `classify_variance`, `planned_vs_actual` | Reused by the attendance-erosion detector. |
| **Homeowner handoff** | `POST /api/v1/homeowner/requests` (`HomeownerRequest`) | The "Ask your builder" / "this isn't what I wanted" handoff target. |
| **Trust membrane** | `app/publish/membrane.py` → `draft_homeowner_update` | Pattern for what crosses to the homeowner; our homeowner filter mirrors its CROSSING/NON-CROSSING rules. |
| **Homeowner home** | `GET /api/v1/homeowner/home` (`HomeOut`) | Where heads-up cards render (alongside `needs_attention`, `recent_activity`). |

---

## 5. Data models

### 5.1 `SiteFinding` (net-new — risks are currently ephemeral)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `site_id` | UUID FK → sites | |
| `finding_type` | str | e.g. `material_work_mismatch`, `schedule_drift`, `curing_violation`, `design_theme_clash` |
| `severity` | enum | `low` · `medium` · `high` · `critical` (extends risk.py's low/medium/high with `critical` for curing/structural) |
| `headline` | str | short, human-readable |
| `detail` | text | longer explanation |
| `evidence_event_ids` | UUID[] | proof trail (mirrors risk.py shape) |
| `phase` | str \| null | canonical baseline phase this relates to |
| `status` | enum | `open` · `acknowledged` · `resolved` |
| `detected_on` | date | |
| `resolved_on` | date \| null | |
| `dedupe_key` | str | `finding_type:site_id:phase` — used to update-not-duplicate |

> **Dedupe rule:** same `dedupe_key` with an existing `open`/`acknowledged` row → update it (refresh evidence + detail), don't create a duplicate.

### 5.2 `FindingResolution` (audit trail of responses)

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `finding_id` | UUID FK → site_findings | |
| `actor_user_id` | UUID \| null | who responded |
| `actor_role` | str | contractor/owner/pm/homeowner |
| `action` | enum | `acknowledged` · `approved_change` · `disputed` · `resolved` · `requested_more` |
| `note` | text \| null | |
| `created_at` | datetime | |

### 5.3 `DesignDecision` (homeowner approves a deviation → new taste version)

Logged when a homeowner taps "I approved this change." Feeds a new `profiler_briefs` version (the profiler already versions briefs). Keeps the approved design a *living* document.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `site_id` | UUID FK | |
| `finding_id` | UUID FK → site_findings \| null | the deviation that prompted it |
| `area_id` | UUID FK → profiler_areas \| null | which design area |
| `decided_by` | UUID FK → users | the homeowner |
| `summary` | text | what changed |
| `created_at` | datetime | |

### 5.4 Additive schema change (Phase 4 only)

- `published_photos.category` — enum `progress · design_option · drawing · document · other`. Currently absent; the vision classification exists at extraction time but isn't persisted on the published photo. Needed by photo-vs-theme. Additive, nullable, backfillable.

---

## 6. The baseline / sequence layer (`sequence.py`)

Extends `milestone_reference.py` (durations) with the two things it lacks:

**(a) Explicit sequence & overlap** — canonical phases in order, with dependencies:

```
excavation → foundation → plinth → structure/slabs → (curing) → brickwork
  → [electrical_rough ∥ plumbing_rough] → plastering → waterproofing
  → [flooring ∥ painting] → doors/joinery → fixtures/finishing → handover
```

**(b) Phase → expected work + materials map** — so consistency detectors can reason: e.g. `brickwork` expects `material_delivery{brick, cement, sand}` + `progress_update` mentioning masonry; `flooring` expects `tile/marble/granite` deliveries. Keyword-based, mirroring the existing reference's matching style.

Both are **static curated data** first (industry-typical), with the learned-history override as the documented next phase.

---

## 7. Detector library (17)

Severity in brackets. **D** = deterministic (no model), **V** = vision adapter (reuses existing extractor), **migrated** = from risk.py.

### Work consistency
1. **material_work_mismatch** [med→high] **D** — delivery logged, no matching phase-work progress within N days.
2. **work_without_material** [med] **D** — progress for a phase with no matching delivery in preceding window.
3. **photo_progress_mismatch** [low] **D** — photo's milestone/room vs current phase disagree.

### Schedule & progress
4. **stale_milestone** [med→high] **D** — milestone `now` longer than `typical_duration_days[1] × 1.5`.
5. **phase_sequence_violation** [high] **D** — progress on phase N while phase N-1 milestone not `done`.
6. **idle_gap** [med] **D** — zero events for 5+ working days (excl. weekends/known holidays).
7. **attendance_erosion** [med] **D** — headcount declining 5+ consecutive days (reuses `classify_variance`). *(absorbs risk.py `labor_shortfall`)*

### Quality & compliance
8. **missing_approval** [high] **D** — work on an approval-gated phase (slab, waterproofing) with no prior `approval` event. *(absorbs risk.py `pending_approval`)*
9. **curing_violation** [**critical**] **D** — slab/foundation pour, then no curing activity for 3+ days (min 21-day water curing).
10. **repeat_issue_pattern** [high] **D** — same `issue` keywords flagged 3+ times in 30 days.
11. **spec_deviation** [med] **D** — delivered material doesn't match any active/approved `spec` for the site. *(absorbs risk.py `data_quality` + `unverified_invoice` reconciliation)*

### Operational
12. **vendor_concentration** [low] **D** — >80% of deliveries from one vendor over 30 days.
13. **photo_quality** [low] **V** — blurry/irrelevant/unclassifiable (reuses vision classifier).
14. **weather_work_conflict** [med] **D** — rain-sensitive work (concrete, paint, waterproofing) scheduled in the site city's monsoon month.

### Design & aesthetic consistency
15. **material_theme_clash** [med] **D** — map a spec/material's `colour`/`finish`/`brand` → taste dimensions, run `check_consistency()` against the area's `taste_model`. Join: `spec.component_id → profiler_areas.component_id/space_id → area`.
16. **photo_vs_theme** [high] **V** — extract attributes from an installed/published photo (existing extractor), run `check_consistency()` against the area's approved theme. The homeowner's standout signal.
17. **cross_room_coherence** [low] **D** — compare approved `taste_model`s across 3+ areas for clashing direction.

> **Model footprint:** 15 deterministic, 2 vision (both reusing the existing profiler extractor / vision classifier), **0 net-new aesthetic-judgment LLM calls.** The doctrine holds.

---

## 8. Health score (`score.py`)

Single 0-100 score per site, **transparent** (tap → see contributing findings):

- Start 100; subtract weighted penalties: `critical −25 · high −15 · medium −7 · low −3`; floor 0.
- Bands: **85+ Healthy** 🟢 · **60-84 Watch** 🟡 · **<60 At Risk** 🔴.
- Trend vs last week stored for the dashboard arrow.

---

## 9. Surfacing

### 9.1 Contractor morning brief (extends `brief/generate.py`)

Findings slot into the existing exceptions-first brief, grouped by severity, each line = headline + evidence link. A deterministic **"On track"** line prevents pure-doom briefs. Only `open`/unacknowledged findings appear. Acknowledged findings are hidden from the brief but remain on the dashboard.

### 9.2 Site Health dashboard

- **Web (full page):** header (score + trend) · **timeline strip** (baseline phases with actual progress overlaid; red marker at drift) · filterable findings list (severity/type/phase) · acknowledge/resolve inline.
- **Mobile (contractor card):** score ring + band + top-3 findings on the site detail screen; tap → full list.

### 9.3 Homeowner filtered view (trust membrane)

Only **homeowner-safe** finding types, reframed warm. Mirrors `draft_homeowner_update`'s CROSSING/NON-CROSSING discipline.

| Finding | Homeowner sees? | Framing |
|---|---|---|
| schedule drift / stale milestone | ✅ | "Plastering is taking a little longer than usual — your builder is on it" |
| **photo_vs_theme / material_theme_clash** | ✅ | "The tiles being installed look different from your approved design — worth confirming" |
| curing_violation | ✅ (gentle) | "The slab is curing — a normal ~3-week wait for strength" |
| material/work mismatch, attendance, vendor, missing approval, photo quality, repeat issue, weather | ❌ | contractor's operational domain |

Renders as soft "heads-up" cards on `GET /homeowner/home`, never alarming, always with the existing one-tap "Ask your builder" handoff.

---

## 10. Homeowner feedback loop

When the AI surfaces a design deviation, the card is **actionable**, not just informational:

```
[ ✓ I approved this change ]  → DesignDecision logged → new profiler_briefs version → AI stops flagging
[ ✗ This isn't what I wanted ] → POST /homeowner/requests (deviation pre-attached) → contractor high-priority finding
[ ? Show me more ]            → request a photo/explanation from site
```

Plus a **proactive flag**: a "something looks off" button on any published photo → creates a homeowner-initiated finding + builder handoff, and runs the photo-vs-theme check on that image for instant context.

**Every response sharpens the taste model** — "approved" evolves the design, "disputed" reinforces the original. The approved design becomes a living document, not a frozen snapshot.

### The fuller homeowner intelligence set ("best feedback")

| Category | Homeowner gets | Powered by |
|---|---|---|
| **Design fidelity** ⭐ | "matches / differs from what you approved" + resolve loop | profiler + specs + vision |
| **Schedule honesty** | "~1 week behind typical for this phase" | baseline vs milestones |
| **Decisions needed** | "2 choices are waiting on you — may hold up work soon" | pending `approval` events / `needs_attention` |
| **Reassurance** | "slab curing — normal wait, nothing stalled" | curing detector, reframed |
| **Milestone joy** | existing published photos/milestones | existing |

---

## 11. Model tiering

| Task | Model | Why |
|------|-------|-----|
| 15 deterministic detectors | **none** | SQL + Python. Zero cost, auditable. |
| photo_vs_theme / photo_quality | **reuse existing vision extractor (gpt-4o)** | already in profiler; low volume. |
| `check_consistency` judgment | **none** (deterministic) | math, not model — the trust core. |
| extraction, captions, brief narrative, finding headlines, homeowner reframe | **gpt-4o-mini** | high-volume, templated. |
| design profiler extraction | **gpt-4o** | unchanged. |
| embeddings | **text-embedding-3-small** | unchanged. |

**Provider:** stay single-provider (Azure OpenAI). If the vision design-judgment proves weak post-launch, swap just those calls to Claude as an upgrade path — don't add provider complexity pre-need.

**Cost:** ~$0.50/day per 10-site contractor (deterministic detectors are free; only the occasional vision call costs).

---

## 12. Build phasing

| Phase | Ships | Rationale |
|-------|-------|-----------|
| **1** | `intelligence/` module · `SiteFinding` + `FindingResolution` · `sequence.py` · the ~13 deterministic non-design detectors · migrate risk.py · brief integration | Cheap, reliable, immediate value, no model/data risk. |
| **2** | Site Health dashboard (web) · mobile contractor card · health score | Visualize Phase 1. |
| **3** | Homeowner heads-up cards · feedback loop · "something looks off" · `DesignDecision` | The homeowner-advocate experience (schedule/decisions/reassurance work regardless of profiler data). |
| **4** | 3 design detectors · `published_photos.category` · taste-version loop | Highest value; gated on profiler data being populated. |

---

## 13. Risks & caveats

- **Empty profiler data (verified):** on a fresh pilot site, `profiler_areas.taste_model` is `{}` and `check_consistency()` returns "consistent" for everything. Design-fidelity detection **switches on only as profiler data fills in.** Schedule/decisions/reassurance feedback works regardless. This is why design detectors are Phase 4.
- **Cold-start learned baseline:** needs ≥3 completed sites. Until then, the industry baseline carries it (by design).
- **Photo category gap (verified):** `published_photos` has no `category`; added additively in Phase 4.
- **Spec↔theme linkage (verified):** no direct FK; resolved via component→area join. If the join is ambiguous, the detector abstains (never guesses) — consistent with doctrine.
- **Two design systems exist:** the new `profiler_*` tables and a legacy `design_*` set. Build only on `profiler_*`; ignore legacy.
- **Brief noise:** dedupe + acknowledge + the "On track" line are the guardrails against alert fatigue.

---

## 14. API surface (new)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/sites/{id}/health` | dashboard + mobile card (score + findings) |
| `POST /api/v1/findings/{id}/acknowledge` | contractor "I know about this" |
| `POST /api/v1/findings/{id}/resolve` | contractor resolve |
| `GET /api/v1/homeowner/heads-up` | homeowner-safe findings |
| `POST /api/v1/homeowner/heads-up/{id}/respond` | approved / disputed / show-more |
| `POST /api/v1/homeowner/flag` | proactive "something looks off" on a photo |

All scoped via the existing never-widen visibility discipline.

---

## 15. Testing strategy

- **Detectors:** pure-function unit tests with synthetic event fixtures (each detector deterministic → fully testable offline, no LLM). Mirror the existing `risk.py` / `taste.py` test style.
- **Engine:** dedupe + persistence + scoring integration tests.
- **Surfacing:** brief snapshot tests; homeowner-filter tests asserting NON-CROSSING types never leak.
- **Vision adapters:** use the existing `FakeLLM`/fake-extractor path (deterministic, network-free) — consistent with current test infra.
- **Membrane safety:** explicit test that operational findings (attendance, vendor, money-adjacent) never reach the homeowner surface.

---

## Appendix — verified ground truth (file references)

- Scheduler: `app/scheduler.py` (CronTrigger, `ENABLE_SCHEDULER`)
- Brief: `app/brief/generate.py` `build_brief()`, persists `owner_briefs.payload`
- Risks (ephemeral): `app/brief/risk.py` — `_labor_shortfall`, `_unverified_invoices`, `_pending_approvals`, `_data_quality`; dict `{site_id, kind, severity, message, evidence_event_ids}`
- Baseline: `app/homeowner/milestone_reference.py` `typical_duration_days()`
- Taste core: `app/profiler/taste.py` `check_consistency()`, `build_taste_model()`
- Profiler tables: `profiler_profiles/areas/references/rankings/themes/conflicts/briefs/...` (`app/models/profiler.py`); `profiler_areas.taste_model` JSONB; `profiler_themes.status` ∈ suggested/approved/adjusted/rejected, per-area
- Specs/materials: `specs` (`label,qty,unit,approval_status,component_id,material_id`), `materials` (`brand,sku,colour,finish,size,thickness`)
- Models: `Milestone` (status upcoming/now/done; **no** `typical_duration_days` column), `SiteEventModel`, `SiteBaseline`, `Component` (`progress_pct,status,assignee_id`), `SiteFinancials`
- Homeowner: `POST /homeowner/requests` (`HomeownerRequest`, status sent/seen/in_progress/done), `GET /homeowner/home` (`HomeOut`), `POST /homeowner/ask`, membrane `draft_homeowner_update`
- Photos: `PublishedPhoto` (`caption,room_tag,milestone_id,is_starred`; **no** `category`)
