# Design Profiler — Engine & Integration Contract — Design Spec

> **Status:** approved direction (founder gave open mandate 2026-06-12). Sub-project **A** of the Design Profiler program.
> **Sources:** `vault/02-Product/Homeowner App - Engineering Spec.md`, `vault/02-Product/Homeowner App - AI Rendering Spec.md`, the `~/Downloads/Neev` prototype, the existing codebase, and the locked decisions below.
> **Companion memory:** `[[design-profiler-program]]`.

---

## 0. The one-paragraph version

The new "Neev Homeowner" userflow is ~70% the homeowner app we already have wired (~90%) plus one large new engine: the **Design Profiler** — it turns moodboard inputs (uploads / camera / Pinterest / designer presets) into a **deterministic AI taste model** and a **versioned, audience-rendered structured brief** (homeowner-readable, architect-ready, contractor-ready). Its contractor-ready output is the *input to the Spec engine* (our #1 Phase-2 build). We build it **cross-role and production-grade**, as a **role-agnostic engine + API contract** so that the *new contractor userflow the founder is building next* plugs into the same endpoints with zero backend change. AI **proposes**; a named human **commits**; money/counts/confidence are computed by deterministic reducers, never the LLM.

---

## 1. Program framing & full-surface coverage map

This is a **program, not a single spec.** It decomposes into sub-projects, each with its own spec → plan → build → Production-Bar gate. This document specs **A** in full and maps every surface from the two authoritative specs so nothing is amputated ("converge, don't amputate").

### Decomposition

| # | Sub-project | Depends on | This doc? |
|---|---|---|---|
| **A** | **Profile Engine + Integration Contract** (role-agnostic backend) | Phase-0 security to *ship* | **✅ full detail** |
| B | Homeowner intake (mobile; extends `(homeowner)/design.tsx`) | A | later spec |
| C | Brief outputs + **Spec-engine bridge** | A | later spec |
| D | Contractor "Build Design Profile" trigger + architect review (thin clients of A) | A | later spec |
| E | Homeowner convergence polish + net-new systems (media ranking engine, storage, spend, requests/nudges, reconcile) | none (client-side) | later spec(s) |

### Coverage map — every homeowner-spec surface → status → owner

| Surface (spec §) | Exists today? | Owner |
|---|---|---|
| Home dashboard: status, milestones, needs-attention, my-requests, recent-activity (§4) | ✅ `home.tsx` | E (reconcile) |
| Home: **Spend summary** (contractor-controlled) (§4.6) | ❌ homeowner-facing | E (membrane decision) |
| Media feed: Instagram-style **ranking engine**, dedup (pHash), best-pick, 4 sub-views, decision/comparison/progress/issue/AI-highlight/quiet/batch cards, **annotations**, **AI collections**, uploads (§5) | 🟡 `photos.tsx` (feed exists; ranking/annotation/collections/storage **not** built) | E (large — likely its own spec) |
| Media: **Storage management** (on-device/cloud, retention) (§5) | ❌ | E |
| Project Updates: timeline, milestones, changes, **weekly summary**, quiet periods, **property overview** (§6) | ✅ `updates.tsx` | E (reconcile) |
| **Property Skeleton**: rooms→components, templates, floor-plan import (§10) | 🟡 `properties`/`spaces`/`components` tables exist; intake UI + templates + import not built | D/E (foundational; contractor-side intake) |
| Design: profile card, plans, **references**, **selections**, **consistency checks** (§5, §7) | 🟡 `design.tsx` + `design_*` tables | **A/B/C (Profiler subsumes this)** |
| **Design Intake + AI design profile** (§8) | 🟡 thin `design_fingerprint.py` | **A (engine) + B (intake UI)** |
| **Pinterest** import (§9) | ❌ | **A (pluggable source) + fast-follow OAuth** |
| Multi-member roles & permissions (§3) | ✅ `homeowner_members`, capabilities | extend in **A** (contributors) + E (UI) |
| My Requests + **nudge system** (§4.4) | 🟡 `homeowner_requests` (nudges?) | E |
| Notifications (§11) | 🟡 `notification_settings`, feed | E |

**Read this map as the anti-amputation guarantee:** the full vision is preserved and assigned; we are *sequencing*, not cutting.

---

## 2. Sub-project A — scope

**In scope (this doc):** the role-agnostic Design Profiler backend — data model, lifecycle/state machine, the deterministic AI taste pipeline, the API contract (the forward-compat seam), the membrane/permission layer, and the Spec-engine bridge interface. Plus v1 Pinterest tiers 1 & 1.5.

**Out of scope (later sub-projects):** all UI (B/D), the brief→material-spec materialization (C), the media ranking engine / storage / spend / nudges (E), Pinterest OAuth board-sync (fast-follow).

---

## 3. Locked decisions (2026-06-12)

- **Designer = the existing `architect` role.** No new persona. The "designer review / finalize" step is an architect surface. (Homeowner-side `advisor` members may *contribute*; the architect *reviews & signs off*.)
- **Multi-owner + conflict resolution in v1.** Per-contributor rankings + a consensus/aggregation layer + AI conflict detection & compromise from day one (the pilot is a co-owner family home).
- **Pinterest = tiered.** v1: screenshot/upload-through-vision (zero Pinterest dependency) + oEmbed "paste a public pin/board link" (no OAuth). Fast-follow: official OAuth board-sync (`boards:read`/`pins:read`) — apply for Standard access early (reviewed app + demo-video of the full OAuth flow is the long pole). The `source_type` enum is pluggable, so OAuth drops in with no schema change.
- **Determinism.** Vision-LLM *extracts* per-image attributes → **deterministic reducer** computes taste vector + confidence + conflicts → LLM only *narrates* a **proposed** brief; a **named human commits**. Money/counts/confidence never originate from the LLM (mirrors `app/homeowner/numeric_guard.py` + the Determinism Doctrine).
- **Additive only.** New tables; extends existing ones; never alters `published_*` rows or the membrane contract.

---

## 4. Data model (A.1)

Four clusters. **NEW** = new table; **EXTENDS** = builds on existing. All FK into existing `companies`/`sites`/`homeowner_members`/`spaces`/`components`/`users`.

### ① Scope & contributors
- **`design_profile`** (NEW) — `id, company_id, site_id, scope_type{whole_house|rooms|elements}, status{state-machine enum}, current_brief_version_id?, created_by, created_at, updated_at`. One active per site (v1); soft-archive others. Spawned by the contractor "Build Design Profile" task.
- **`design_profile_area`** (NEW) — the per-area unit: `id, profile_id, area_kind{house_build|interior|element}, area_key(slug), space_id? (FK spaces), component_id? (FK components), recommended_count, status{not_started|in_progress|ready}, confidence(0–1, computed), has_conflict(bool, computed), taste_model_json(jsonb, computed), updated_at`. **This is what the intake hub shows progress over.**
- **`design_contributor`** (NEW) — `id, profile_id, member_id? (FK homeowner_members), user_id? (FK users, for architect), role{owner|co_owner|family|advisor|architect}, is_decision_owner(bool), invited_at, joined_at`. Exactly one of member_id/user_id set. Reuses existing membership + roles; no new role.

### ② Inputs & signal — human and machine kept deliberately separate
- **`design_reference`** (EXTENDS `app/models/homeowner_design.py`) — `id, profile_id, area_id, contributor_id, source_type{upload|camera|pinterest_link|pinterest_oauth|preset}, image_r2_key, source_url?, preset_id?, consistency_status?{consistent|tension|conflict}, consistency_note?, created_at`. `source_type` is the pluggable seam.
- **`design_ranking`** (NEW) — per **(reference × contributor)**: `id, reference_id, contributor_id, stars(1–5), tags_json{positive[],negative[]}, note?, created_at, updated_at`. UNIQUE(reference_id, contributor_id). **Per-contributor → multi-owner is native** (two co-owners rank the same image differently).
- **`reference_attributes`** (NEW) — the **vision-extracted** machine signal: `id, reference_id, attributes_json{style, materials[], colors[], lighting, decorative_density, openness, maintenance, …}, model, confidence, extracted_at`. Stored apart from human rankings so provenance is always provable.

### ③ AI outputs — all *proposed*, never auto-committed
- **`design_theme`** (NEW) — `id, profile_id, area_id?(null=whole-house), name, confidence, palette_json, materials_json, rationale, evidence_reference_ids(jsonb[]), status{suggested|approved|adjusted|rejected}, decided_by?, decided_at, created_at`.
- **`design_conflict`** (NEW) — `id, profile_id, area_id, contributor_a_id, contributor_b_id, dimension, description, ai_compromise, resolution_status{open|resolved|deferred_to_architect}, resolved_by?, decision_note?, created_at, resolved_at`. The multi-owner core.
- **`design_clarification`** (NEW) — the grounded AI design-interview, persisted: `id, profile_id, area_id?, contributor_id?, question, answer?, source_attribution(jsonb), asked_at, answered_at`. Chat that becomes structured signal feeding the brief.

### ④ Brief & approval — versioned, audience-rendered
- **`design_brief`** (NEW) — `id, profile_id, version(int), state{state-machine}, summary_json, created_by, created_at`. The thing approved + locked.
- **`design_brief_rendering`** (NEW) — per **(brief × audience{homeowner|architect|contractor} × scope{whole_house|area})**: `id, brief_id, audience, scope, area_id?, content_json, created_at`. Snapshotted per version for audit. **The contractor rendering is the Spec-engine input.**
- **`design_brief_approval`** (NEW) — the approval timeline: `id, brief_id, actor_member_id?, actor_user_id?, actor_role, action{approve|request_changes|send_to_architect|architect_sign_off|contractor_received}, note?, created_at`.

**Load-bearing choices:** (1) `taste_model_json`, `confidence`, `has_conflict` are computed by a **deterministic reducer, not the LLM**. (2) Human rankings ≠ machine attributes (separate tables) → provenance, satisfying the Determinism Doctrine. (3) `consistency_status` on a reference is a computed read of (attributes vs area taste_model) — advisory, never blocking (§8).

---

## 5. Lifecycle / state machine (A.2)

`design_profile.status` and `design_brief.state`:

```
NotStarted → IntakeStarted → CollectingInputs → Ranking → AIInterpreting
AIInterpreting ⇄ NeedsClarification          (low confidence OR conflict)
AIInterpreting → ThemeSuggested → HomeownerReview
HomeownerReview → RevisionRequested → AIInterpreting
HomeownerReview → ArchitectReview → ContractorBriefReady → Approved → Locked
Locked → RevisionRequested                    (change request reopens a new version)
```

Multi-owner **conflict** is a parallel concern resolved within AIInterpreting/HomeownerReview (via `design_conflict`), not a linear state. Transitions that commit (theme approve, brief approve, architect sign-off) require a **named decision-owner** actor and are written to `design_brief_approval`.

---

## 6. The deterministic AI taste pipeline (A.3)

Reuses `app/extraction/llm.py` (`complete_vision`) and the async worker pattern; **FakeLLMClient in CI** (no Azure spend), per `docs/superpowers/plans/2026-06-10-spec-vision-extraction.md`.

1. **Extract (LLM, async).** On reference add → `complete_vision` extracts attributes → `reference_attributes`. Prompt: "extract only what's clearly visible; null if unsure; never guess."
2. **Aggregate (pure Python reducer — NO LLM).** Over an area's rankings (human, weighted by stars; negative tags subtract specific dimensions) + `reference_attributes` (machine) → compute `taste_model_json`, `confidence` (f(ranked/recommended, inter-contributor agreement)), and per-dimension `conflicts` (divergence between contributors above threshold). **This is the trust core — confidence and conflict are math.**
3. **Themes (LLM proposes, math grounds).** LLM narrates theme directions from the taste model; `confidence` is echoed from the reducer (not invented); `evidence_reference_ids` are the deterministically top-ranked refs; LLM writes only `rationale`/`name`.
4. **Clarify (LLM, grounded).** When confidence low or conflict present → targeted questions grounded in the taste model + specific refs (`design_clarification`). Answers re-feed the reducer.
5. **Brief (LLM narrates structured data).** Renderings are phrased by the LLM from structured taste_model + themes + selections; all material lists/numbers come from structured data. Homeowner approves → architect signs off → contractor rendering released. **Never auto-approved.**
6. **Consistency check (§8).** On new reference, compare attributes vs area taste_model → consistent/tension/conflict + explanation (LLM phrases; threshold is math). Advisory: "seek feedback, don't gatekeep."

---

## 7. The API contract (A.4) — the forward-compat seam

**Role-agnostic.** The SAME endpoints serve homeowner mobile (B), architect review (D), the contractor trigger (D), and **the new contractor userflow coming next.** Role determines the *audience rendering* and *permitted actions* (§8 membrane), **never a different endpoint.** Base: `/api/v1/design`.

```
POST   /profiles                              create (contractor task: site_id, scope_type, areas[], contributors[], deadline?, preset_pack?)
GET    /profiles/{id}                         full profile (areas, progress, contributors) — role-filtered
GET    /profiles/by-site/{site_id}            resolve active profile
POST   /profiles/{id}/contributors            add / invite contributor

GET    /profiles/{id}/areas/{areaId}/references         list
POST   /profiles/{id}/areas/{areaId}/references         add (multipart upload | camera | preset_id)
POST   /profiles/{id}/areas/{areaId}/references/from-link   Pinterest tier-1.5 (oEmbed; re-host to R2)
POST   /references/{refId}/rankings           rank (stars, tags, note) — per contributor

GET    /profiles/{id}/areas/{areaId}/taste    computed taste model + confidence + conflicts (deterministic)
GET    /references/{refId}/consistency        consistent | tension | conflict + explanation

POST   /profiles/{id}/areas/{areaId}/themes:generate   async; GET themes
POST   /themes/{themeId}/decision             approve | adjust | reject (named actor)

GET    /profiles/{id}/clarifications          open questions ; POST answers
GET    /profiles/{id}/conflicts ; POST /conflicts/{id}/resolve

POST   /profiles/{id}/brief:generate          async → new version
GET    /profiles/{id}/brief?audience=homeowner|architect|contractor    membrane-filtered rendering
POST   /briefs/{briefId}/approval             approve | request_changes | send_to_architect | architect_sign_off
```

---

## 8. Membrane & permissions (A.5)

Reuses `app/homeowner/authority.py` (capabilities) + `app/publish/membrane.py`. Per §3 matrix and §12:

- **Decision authority** (approve themes/brief): **primary_owner & co_owner only.** Family = view/comment. Advisor = design comment only. Architect = review/adjust/sign-off.
- **Architect** sees the profile **after the homeowner submits/shares** (§8) — references + AI interpretation; not private draft notes unless shared.
- **Contractor** sees **only the contractor-ready rendering of an approved/shared brief** — never private homeowner notes, never raw rankings (§12: homeowner controls what the contractor sees).
- Every action is **attributed** (name + role) on the brief approval timeline (§3: "contractor must know if a decision came from an owner vs a family member").
- All new endpoints sit behind `enable_labs` until they meet the Phase-2 honest-bar; a **cross-role visibility test matrix** is part of the Production Bar.

---

## 9. The Spec-engine bridge (forward link to C)

The **contractor-ready brief rendering** (finish expectations, material families, per-room execution notes, procurement dependencies, cost-impact flags) is structured so each element maps to a **proposed `Material` + `Spec`** (`approval_status=pending`) in the Spec engine — confirmed by architect/contractor, never auto-committed. This is the *same propose→confirm pattern* as the spec-vision-extraction plan, and it is where the Profiler fuses with the #1 Phase-2 build. (Materialization itself is sub-project C.)

---

## 10. Testing & Production Bar

6-point bar (real data · honest empty/loading/error states · ≥1 e2e test in CI · membrane-safe · secure · deterministic-or-Labs):

- **Deterministic reducer** (taste math, confidence, conflict, consistency) — pure functions, exhaustively unit-tested (TDD, no LLM).
- **Vision extract + worker** — `FakeLLMClient(canned=…)` via dependency override; **no Azure spend in CI**.
- **e2e (CI):** create profile → add refs → rank (two contributors) → taste computed → theme proposed → owner approves → brief generated → architect sign-off → contractor rendering visible; assert a family member *cannot* approve and the contractor *cannot* see private notes (membrane).
- Ruff clean + `npm run typecheck` (when B lands).

---

## 11. Build sequence for A (writing-plans will expand each)

1. Alembic migration + SQLAlchemy models (the tables in §4).
2. **Deterministic reducer** (taste model, confidence, conflict, consistency) — pure, TDD first. *Highest value, no LLM.*
3. Vision-extract helper + async worker (reuse `complete_vision`; FakeLLM in CI).
4. CRUD endpoints: profiles, areas, references (incl. `from-link` oEmbed), rankings, contributors.
5. Themes + clarifications (LLM narrates, math grounds).
6. Brief generation + renderings + approval + state machine.
7. Membrane/permission gates + capability checks.
8. e2e test + membrane matrix + ruff/typecheck green.

---

## 12. Sequencing & the Phase-0 caveat

**Building A on a branch with tests does not touch prod** — so implementation is unblocked. **Shipping/exposing A still waits behind Phase 0** (real Tripathi/CivilArch family PII in prod Neon+R2; OTP `000000` hole). We build now, behind `enable_labs`; we deploy after Phase 0. One WIP front.

---

## 13. Explicitly deferred

Pinterest OAuth board-sync (fast-follow; apply for Standard access now) · brief→PDF export · floor-plan AI import for the skeleton · media ranking engine, storage, spend, nudges (sub-project E) · the homeowner intake UI (B) and brief-output UI (C).
