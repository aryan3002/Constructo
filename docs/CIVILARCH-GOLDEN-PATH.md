# CivilArch Operating Model → Constructo's Contractor Golden Path

> **Author:** Written with Claude (grounded in a field-level read of the live backend), 2026-06-09
> **For:** Aryan (founder)
> **Status:** Design/mapping doc → feeds the roadmap ([STATE-AND-ROADMAP.md](STATE-AND-ROADMAP.md)) and a Phase-2 implementation plan.
> **Companion to:** the memory note `civilarch-operating-model` and the four real CivilArch spreadsheets.

---

## 0. The reframe, in one line

> **The contractor "golden path" for the Tripathi pilot is: digitize CivilArch's real operating system — the Material Spec Schedule + Site Audit + Decision Log — as ONE living, deterministic, AI-assisted record, with a client approval gate and Pratibha's room-by-room homeowner slice.**

Your product spine already supports this. The captured *events* were tuned for a labor/logistics builder; CivilArch is an interior fit-out firm whose universe is **materials, decisions, and room-by-room execution.** This doc says exactly **what already maps, what's missing, and what to build** — grounded in the real schema (file paths cited).

---

## 1. CivilArch's operating model (condensed)

Five structured artifacts, all in spreadsheets today:

1. **Decision Log** (Meeting Notes) — dated per-room rulings from client meetings with Anil Sir + drawing links. *The record of what was decided.*
2. **Material Spec Schedule** — the master: floor → room → wall → finish-element → category → brand → SKU → colour → finish → size → thickness → qty → wastage → rate → total → approval-status → catalog-link. *Exists in ~3 drifting copies.*
3. **Site Audit** — live execution: room → wall → task → design-decision-status → exec-status → **% (0 / 0.5 / 1.0)** → **assignee.**
4. **Selections** — Color, Ceiling Appliances (fan/chandelier counts), Wallpaper, per room (under Pratibha's name).
5. **Status trackers** — Indoor Spaces (room × work-type × tentative date), Pending Actions, Furniture Sizes, Outdoor, Utilities.

**People (inferred — confirm):** Anil/Ashok Sir = client/deciders · Pratibha = homeowner · Saurabh Sir = civil/site/electrical · Vikas Sir = carpentry/interiors/wardrobes · Anamika = wallpaper/art.

---

## 2. The data-model mapping (the heart)

Grounded in the live models. `✅ exists · 🟡 partial · ❌ missing`

| CivilArch concept | Constructo model · field | Status |
|---|---|---|
| Floor / Room / Zone | `Space.name` + `Space.kind {floor·room·zone}` (`homeowner_property.py:55`) | ✅ |
| Wall / location (e.g. "Bed Head Wall") | `Component.name` (string) (`homeowner_property.py:73`) | 🟡 room-level only; wall is just a string, not queryable |
| Finish-element (Paneling / Louvers / Wardrobe) | `Component.name` / `Component.kind` | ✅ |
| Material category (Laminate/Paint/Tile/Louver) | `Material.category` (`material.py:11`) | ✅ |
| Brand (WELMICA / ASIAN ROYALE) | `Material.name` (combined) | 🟡 no separate brand field |
| Product code / SKU (`OS-9006-02 Pg23`) | — | ❌ |
| Colour / shade · texture / finish | — | ❌ |
| Size · thickness | — | ❌ |
| Catalog link (the 360°/vendor URL) | — | ❌ |
| Qty · wastage % | `SiteEvent.fields{quantity,unit}` JSONB (`site_event.py:12`) | 🟡 unstructured, only when a delivery event is captured |
| Unit rate · total cost | `SiteEvent.fields{}` JSONB | 🟡 buried in JSON; never published (correctly, per membrane) |
| Approval status (Pending Approval) | `DesignSelection.status {proposed·selected·approved}` (`homeowner_design.py:74`) | 🟡 soft string; no evidence/SLA |
| "Final Material Code by Client" | — | ❌ no finalization field |
| Assignee (Saurabh / Vikas) | `ActionItem.assignee_id` exists, but **not on `Component`** | 🟡 wrong object |
| % completion per room/wall | `Component.status {not_started·in_progress·done}` | 🟡 ternary, not continuous; no rollup |
| Decision Log entries | `SiteEvent` (append-only ledger) + `Update{type:change/decision_needed}` | ✅ the ledger is exactly this |
| Client sign-off that blocks ordering | `Decision {kind:approval, state-machine, SLA, evidence}` (`decision.py:40`) | ✅ exists (used for money today) |
| Homeowner's room view | published `Space`/`Component`/`Update`/`Milestone` slice (`homeowner/router.py`) | ✅ exists; needs % + "awaiting your selection" surfaced |
| Trust membrane (hide rate/vendor from homeowner) | `publish/membrane.py` | ✅ already strips rates/vendor/attendance |
| Role-based "who can approve" | `homeowner/authority.py` (`APPROVERS = {primary_owner, co_owner}`) | ✅ this IS the authority gate |

**Read this table as the headline:** the *structure* is almost entirely there. The gap is a **finite set of fields** plus **one missing object** (below).

---

## 3. The one real schema decision

The scout surfaced the crux cleanly: a CivilArch **spec row is neither a `Material` nor a `DesignSelection`.**

- `Material` = company catalog reference (name · unit · category).
- `DesignSelection` = a homeowner *choice* (item · choice · status).
- A **spec row** = a *material instance bound to a specific wall/component*, carrying SKU, colour, finish, qty, wastage, rate, approval, assignee, and % done.

**Recommendation (deterministic, minimal, matches their mental model): introduce one new first-class object — `Spec` (a component-material line item).** It binds `Component × Material` and carries the per-instance fields. Clean separation:

- **Catalog-level attributes → extend `Material`:** `brand`, `sku`, `colour`, `finish`, `size`, `thickness`, `catalog_url`. (Properties of the material itself; reusable across rooms — type a Welmica code once, reuse everywhere.)
- **Instance-level attributes → new `Spec` model:** `component_id`, `material_id`, `qty`, `wastage_pct`, `unit_rate`, `approval_status`, `client_final_code`, `assignee_id`, `progress_pct`, `catalog_link_override`, `notes`.
- **Component gets two cheap additions:** `location`/`wall` (optional string) and — only if they query by wall a lot — nothing more (avoid a whole `Location` table; **YAGNI** until the pilot proves the need).

This is the single most important build decision in this doc. Everything else is fields and wiring.

---

## 4. The golden path, step by step (REAL vs NEW)

The loop, each step mapped to a concrete endpoint/model. `[REAL]` = exists today · `[NEW]` = the build.

1. **Capture, the way they already work.** Vikas photographs a laminate sample-book page, or Anil sends a voice note *"daughter's wardrobe — Welmica purple mirror gloss."* → `POST /api/v1/capture` `[REAL]` creates a raw message → extraction pipeline `[REAL]`.
2. **AI proposes a structured spec line.** Extraction reads brand / SKU / colour / finish from the photo/voice. → **`[NEW]` a "spec-line" extraction target** alongside the existing event types. *Deterministic: it transcribes codes, never invents them; low confidence → `needs_clarification`, surfaced for a human, never a silent guess.*
3. **A named human commits.** Vikas/PM taps confirm (room · wall · material · qty). → **`[NEW]` confirm endpoint**, gated by `authority.py` `[REAL gate]`. *AI proposes, human commits — your membrane, exactly.*
4. **One source of truth + deterministic propagation.** The confirmed `Spec` line updates the schedule, and its `progress_pct` rolls into the Site Audit view and the homeowner slice. **No triple entry, no three drifting copies.** → **`[NEW]` propagation** (plain code, not AI).
5. **Client approval gate.** A material needing sign-off raises `Decision{kind:approval}` `[REAL]` with the spec line + reference photo as evidence; Anil/Pratibha approve in-app; `client_final_code` + timestamp recorded. *The "Pending Approval / Final Code by Client" loop becomes real and auditable.*
6. **Deterministic costing rollup.** `qty × unit_rate` summed per room + grand total over confirmed `Spec` lines. → **`[NEW]` rollup** (pure math; the LLM never produces a number). *Contractor-only — membrane keeps rates away from the homeowner.* Turns their `GRAND TOTAL ₹0` into a live number.
7. **Pratibha's calm slice.** *"Corner bedroom — wardrobe in progress (60%), wallpaper awaiting your selection, paint done."* → published `Component` status + `Update` cards + pending `DesignSelection` `[REAL slice]`, with **`[NEW]` % + "awaiting your selection"** surfaced. Membrane-safe: she sees material name/finish, never rate/vendor.

---

## 5. What to build (prioritized, sized)

`S` ≈ hours · `M` ≈ 1–2 days · `L` ≈ 3–5 days. Each must pass the six-point **Production Bar** in [STATE-AND-ROADMAP.md](STATE-AND-ROADMAP.md).

| # | Build | Effort | Notes |
|---|---|---|---|
| A | **`Spec` model** (Component×Material line item: qty, wastage, rate, approval, assignee, progress, client_final_code) | **M** | The central new object. One migration. |
| B | **Extend `Material`**: brand, sku, colour, finish, size, thickness, catalog_url | **S** | Catalog attrs; reused across rooms. |
| C | **Extend `Component`**: `location`/`wall` (str), `assignee_id`, `progress_pct` (0–100) | **S** | Site-Audit granularity. |
| D | **Spec-line extraction** (sample-book photo / voice → structured spec, confidence-gated) | **L** | Deterministic; reuses extraction pipeline + the frozen vision path (finish it here, or Labs-flag). |
| E | **Confirm + approval wiring**: confirm endpoint (authority-gated) + reuse `Decision{approval}` for client sign-off | **M** | AI-proposes/human-commits + client gate. |
| F | **Costing rollup**: per-room + grand total over confirmed Specs (contractor-only) | **S** | Pure math. Membrane-shielded. |
| G | **Homeowner slice surfacing**: per-room % + "awaiting your selection" + approved-material view | **M** | Extends existing published slice; membrane-safe. |
| H | **Spec importer** (one-off): ingest their real `.xlsx` → seed `Material`/`Component`/`Spec` | **M** | Bootstraps the pilot from real data; also the "proof" you can demo. |

**Suggested order:** A → B → C (schema) → H (seed from real data → instant credibility) → E → G (the loop end-to-end) → F → D (extraction last; it's the hardest and the rest works without it via manual/import entry).

---

## 6. Determinism guarantees (your North Star, here)

- **AI only proposes** spec lines; a named human (Vikas/PM/Anil) commits via the existing `authority.py` gate.
- **Codes are extracted, never invented.** Low confidence → `needs_clarification`, surfaced — never a silent guess.
- **Costing is pure math** over confirmed lines. The LLM never produces a number (your existing reducer doctrine).
- **Propagation (spec → audit → slice) is deterministic code**, not AI.
- **Client approval is an explicit, timestamped, evidence-linked commit** (`Decision` state machine).
- **Anything fuzzy** (e.g. "AI, suggest a coordinating laminate") ships behind a **`Labs` flag**, labeled experimental — or not at all.

This is precisely the *"everything, more deterministic"* you asked for, made concrete on a real customer.

---

## 7. How this slots into the roadmap

- **Phase 1 (Convergence):** adopt this as the **contractor golden-path definition**; add builds A–H to the Feature Ledger; lock the `Spec` schema decision (§3).
- **Phase 2 (Harden the spine):** build A–H to the Production Bar with an end-to-end test (capture → propose → commit → propagate → approve → slice → rollup). Quarantine the fuzzy parts of D behind `Labs`.
- **Phase 3 (Prove on real people):** run the loop on the **one Tripathi Dream Home** — CivilArch (Vikas/Saurabh/Anamika) maintain the spec + audit; Anil/Pratibha approve materials and watch the slice. The complete two-sided loop, on real, reachable humans.

---

## 8. Open questions to confirm with CivilArch (so we build the right thing)

1. **Wall granularity:** is room + element enough, or do they truly need to query "all materials on the north wall"? (Decides whether `Component.location` string suffices or we need more.)
2. **Approval blocking:** does client sign-off *block ordering* (hard gate) or is it advisory? (Decides `Decision` vs soft `Spec.approval_status`.)
3. **Primary contractor user:** who maintains the spec day-to-day — Vikas? a designer? — i.e. who is the app's main contractor-side user?
4. **Costing scope:** do they want the live BOQ rollup in v1, or is pricing sensitive/out-of-scope at first?
5. **Catalog pre-load:** would a pre-loaded brand catalog (Welmica / Asian Royale / Delta / Oliviya SKUs — scraped from those catalog links) save the most typing? (Likely the single biggest friction-killer.)
6. **Capture preference:** is "photograph the sample-book page" the natural input, or do they prefer typing/selecting codes?

---

## Appendix — the bones you already have (quick reference)

**Models** (`app/models/`): `Property`→`Space`(floor/room/zone)→`Component`(work item) · `Material`(catalog) · `Vendor` · `DesignProfile`/`DesignReference`/`DesignSelection` · `Milestone`/`PublishedPhoto`/`Update`/`WeeklySummary`/`Change` · `SiteEvent`(append-only ledger, JSONB fields) · `Decision`(approval state machine + SLA + evidence) · `EventDispute`(contested-truth correction) · `HomeownerMember`/`HomeownerRequest` · `ActionItem`(has `assignee_id`).

**The gate:** `app/homeowner/authority.py` — `APPROVERS = {primary_owner, co_owner}`; design writes gated at `homeowner/router.py` `_gate_design_write`.

**The membrane:** `app/publish/membrane.py` — homeowner sees `{qty, unit, material, room, progress, drawing}`; never rates/vendor/attendance.

**Key endpoints (all REAL):** `POST /capture` · `POST /ingest` · `homeowner/*` (home, property, photos, updates, milestones, design/selections, decisions, ask) · `publish/*` (spaces, components, milestones, updates, changes, drawings) · `materials` (list/create/update) · `approvals/*` (create/resolve/reject/escalate + SLA sweep).

---

*Next step: this design can become a Phase-2 implementation plan (the A–H builds, in order, each to the Production Bar). Say the word and I'll write it.*
