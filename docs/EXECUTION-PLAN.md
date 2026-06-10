# Master Execution Plan — Three Surfaces, One Engine

> **Author:** Written with Claude (grounded in a verified read of the live code + branches), 2026-06-09
> **For:** Aryan (founder)
> **Reads with:** [STATE-AND-ROADMAP.md](STATE-AND-ROADMAP.md) (the why + the phases) and [CIVILARCH-GOLDEN-PATH.md](CIVILARCH-GOLDEN-PATH.md) (the contractor spec engine).
> **This doc answers:** *exactly how we work on the homeowner app, the contractor app, and the web — when, and what.*

---

## The reframe: the design is done. This is a wiring + convergence march now.

Three days ago this felt scattered. Here's the verified truth today:

- **Homeowner app — Calm Cockpit: built.** Slices A–D done (chat, @ask, action items, photo capture), ~90% wired, core screens merged to `main`.
- **Contractor mobile — Neev "Site Register": built.** Phase 0 (fonts+tokens) + Phase 1 (signature kit) + Phase 2 (all 38 screens across owner/pm/accountant/supervisor/mukadam) committed on `feat/contractor-neev`, typecheck + 66 jest green, English-first. The "dead coming-soon" app is gone.
- **Contractor web — Blueprint: live.** ~43-page dashboard, ~95% wired, dark mode + ⌘K + dense grids.

**Both design systems are finalized AND implemented.** You are past the part that felt like quicksand. What remains is *finite and sequenced*: **converge → wire → build the one new capability → pilot.**

---

## Where each surface stands today (verified)

| Surface | Design system | Status | Lives on | Wired to backend? |
|---|---|---|---|---|
| **Homeowner mobile** | Calm Cockpit | Slices A–D done; core on `main` | `main` + `feat/homeowner-calm-cockpit` | ~90% |
| **Contractor mobile** | **Neev / Site Register** | Phase 0–2 done; 6 commits ahead | `feat/contractor-neev` | skinned + structured; **wiring to harden** |
| **Contractor web** | Blueprint | Live, ~43 pages | `main` (`constructo/web`) | ~95% |
| **Backend** | — | Strong spine; **spec engine missing** | `main` (`constructo/backend`) | n/a |

Language: **English-first** across all surfaces (hard rule; one language per screen; i18n plumbed).

---

## How the three surfaces work together (the mental model)

This is the key to *not* feeling scattered: each surface has **one job**, and one golden path flows across all of them.

- **Backend = the engine.** One append-only ledger, one **Spec engine** (the new piece), the trust membrane. Everything else is a window onto this.
- **Contractor WEB (Blueprint) = the DESK.** Dense, tabular, two-handed work: the **Material Spec Schedule**, the **costing rollup**, reconcile, admin. This is where the spec *lives and is maintained*.
- **Contractor MOBILE (Neev) = the SITE.** Glove-and-glare, one-handed, voice-first: on-site **capture** (a sample-book photo, a voice note), the owner's **7am brief**, **approvals on the go**, attendance. This is where the spec is *fed and acted on*.
- **Homeowner MOBILE (Calm Cockpit) = the GLASS.** Pratibha's calm, membrane-safe **room-by-room slice**, **material approvals**, chat. This is where the record becomes *reassurance*.

> One sentence to hold: **the web is the desk, the contractor phone is the site, the homeowner phone is the glass — and the spec engine is the spine through all three.**

This also resolves a real question cleanly: **the Material Spec Schedule is desk work → it belongs on WEB**; **capture is site work → it belongs on MOBILE.** We don't build a clumsy spec-editor on a phone.

---

## The plan — phases (WHEN) × surfaces (WHAT)

Five phases. Each has a **verifiable exit gate**. Times are honest guides; **gates** are what matter. WIP discipline: we finish a phase's gate before opening the next.

### Phase 0 — Secure the house · *Days 1–3* · **BLOCKER, first**
Cross-cutting (backend/infra). *Unchanged from the roadmap — still the only time-sensitive item.*
- Confirm/purge the real PII from prod; rotate every key into Azure secrets; close the OTP `000000` hole; decide prod posture (pilot + monitor, or take down).
- **Gate:** no real PII reachable by an outsider · no live key in plaintext · login can't be bypassed · you know what's deployed and what it costs.

### Phase 1 — Converge · *Weeks 1–2* · land the design work, make everything honest
The goal: **one coherent trunk** that holds both finished design systems, with nothing in any app that lies.
- **Contractor mobile:** quick QA pass on `feat/contractor-neev` → **merge to `main`.** (Confirm screens build, tests green, no obvious dead screens.)
- **Homeowner mobile:** merge remaining `feat/homeowner-calm-cockpit` slices → `main`.
- **All surfaces:** build the **Feature Ledger** — every screen/route tagged REAL/THIN/STUB/DEAD → FINISH/QUARANTINE(`Labs`)/CUT. One source of truth.
- **Decision, written down:** contractor web **stays Blueprint for the pilot**; the "Neev Desk" web re-skin is deferred to Phase 4 (don't re-skin a working surface mid-pilot).
- **Decision, written down:** the chat doctrine ("win the record, rent the transport — absorb workflows, not a chat war").
- **Repo hygiene:** prune merged branches, delete-on-merge, CI as a required check on `main`.
- **Gate:** `main` holds both finished design systems · every shipped screen is honest (no hollow routes; `Labs` clearly labeled) · Feature Ledger exists · branches pruned.

### Phase 2 — Wire & harden the spine + build the Spec engine · *Weeks 3–6* · the real work
Where "production-grade & coherent" is actually achieved. The **golden path** (capture → propose → commit → propagate → approve → slice → rollup) becomes real across surfaces. Built in this order:

**(a) Backend — the Spec engine** (the A–H builds from [CIVILARCH-GOLDEN-PATH.md](CIVILARCH-GOLDEN-PATH.md)):
- New `Spec` line-item model + `Material`/`Component` field extensions; deterministic costing rollup; client-approval wiring (reuse `Decision`); the **importer** that seeds from the real `.xlsx`.
- Close the homeowner masking leak; finish-or-cut the hollow routes (dispute-pack, vendor-confirm, dashboard stubs).

**(b) Contractor WEB (Blueprint) — the spec desk:**
- Build/lock the **Material Spec Schedule editor** + **costing rollup** on web (it's the dense desk surface, ~95% wired already). The accountant/PM maintain the spec here.

**(c) Contractor MOBILE (Neev) — wire the site loop:**
- Wire the skinned Neev screens to real data to the Production Bar: owner 7am brief (real ranked risks + Approve/Hold/Assign), supervisor capture (voice/photo → **spec-line + event proposal**), accountant reconcile, mukadam attendance. Hook capture into the new Spec engine.

**(d) Homeowner MOBILE (Calm Cockpit) — wire the glass:**
- Surface the **room-by-room slice** from the Spec engine (per-room %, "awaiting your selection"), finish the membrane-safe published view, finish the chat slices.

- **Gate:** the golden path runs end-to-end across surfaces (web spec editor + mobile capture → Spec engine → homeowner slice → costing rollup), one E2E test green in CI, zero PII leak across the membrane, nothing fuzzy shown as real.

### Phase 3 — Prove it on the Tripathi Dream Home · *Weeks 6–8* · the pilot
- Seed from the **real spreadsheet** (importer). Turn on the one real project.
- **CivilArch** (Vikas/Saurabh/Anamika) maintain the spec on **web** + capture on **mobile**; **Anil/Pratibha** approve materials + watch the slice on the **homeowner app**.
- Run daily; watch the kill-gate signals (supervisor opens unprompted · owner ≥2 decisions-from-evidence before 7:15am · read-back correction <15% · Pratibha earns an "all caught up" day); tight fix loop.
- **Gate:** the complete two-sided loop runs on the real home for 2 weeks without hand-holding; you have a list of *real* gaps.

### Phase 4 — Expand deliberately · *Week 8+* · behind the bar
- **Neev Desk** web re-skin (now that mobile pattern is proven and the pilot pulls for it).
- Spec engine depth: pre-loaded brand catalogs (Welmica/Asian/Delta/Oliviya), sample-book vision extraction.
- More roles, a second site, the second real customer.
- **Gate (standing):** each new thing meets the Production Bar; WIP stays at one front.

---

## The per-surface arc (read it your way)

**Homeowner app — Calm Cockpit (mostly wiring, little building):**
> Design done → merge slices to `main` (P1) → wire the room-by-room slice from the Spec engine + finish masking + chat (P2) → **Pratibha & Anil pilot it** (P3). It's the "glass." Your job here is to *connect*, not to *build*.

**Contractor mobile — Neev / Site Register (skinned → wired):**
> Re-skin done (Neev P0–2) → merge to `main` (P1) → wire screens to real data + hook capture into the Spec engine + harden to the Production Bar (P2) → **the CivilArch field team pilots it** (P3). It's the "site." Your job is to make the beautiful screens *actually run*.

**Contractor web — Blueprint now, Neev Desk later (the spec desk):**
> Stays live on Blueprint → becomes the **Material Spec Schedule + costing desk** (P2 wiring) → CivilArch maintains the spec here during the pilot (P3) → optional **Neev Desk** re-skin (P4). It's the "desk." Your job is to make it the home of the spec schedule, not to re-paint it yet.

**Backend — the engine under all three:**
> Phase 0 security → the **Spec engine** (A–H) + masking fix + finish-or-cut (P2) → importer + pilot support (P3). Everything else is a window onto this. Your job is the one new capability that makes the pilot real.

---

## Key decisions baked in (confirm, or override)

1. **Converge before build.** Merge both design branches to `main` first (P1), then build. (Matches your "production-grade & coherent first" + WIP=1.)
2. **Web stays Blueprint for the pilot.** Neev Desk re-skin deferred to P4 — don't re-skin a working surface mid-pilot.
3. **Spec schedule = web; capture = mobile.** Don't build a spec-editor on a phone.
4. **English-first** everywhere; Hindi is a per-user toggle (one language per screen).

---

## What we do first — the next 5 moves

1. **Phase 0 security** — purge/rotate/close-OTP. *(Still the one urgent thing; I can walk you through it now.)*
2. **QA + merge `feat/contractor-neev` → `main`** — land Neev so there's one trunk.
3. **Build the Feature Ledger** — the honest inventory across all three surfaces. *(I can draft it from the audits.)*
4. **Lock the two written decisions** — web-stays-Blueprint + chat doctrine (5 minutes).
5. **Start the Spec engine** — I write the detailed implementation plan (the A–H builds, each to the Production Bar) and we begin Phase 2.

---

## Small open decisions for you

- **Merge `feat/contractor-neev` now (after a quick QA pass), or QA more first?**
- **Web stays Blueprint through the pilot — agreed?** (My recommendation: yes.)
- **Who is the day-to-day spec maintainer on web** (Vikas? a designer? you?) — it sets who the primary web user is.
- **Does client material sign-off *block* ordering, or is it advisory?** (From the CivilArch golden-path doc — decides the approval mechanism.)

---

*Next deliverable on request: a detailed Phase-2 implementation plan for the Spec engine (the A–H builds, ordered, each with its Production-Bar exit test). Say "write the spec-engine plan" and I'll produce it.*
