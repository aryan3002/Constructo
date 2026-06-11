# Feature Ledger — the honest inventory (v1)

> **Author:** Written with Claude, 2026-06-10. Grounded in the four-layer audit + the Neev QA pass (2026-06-10, SHIP verdict).
> **Correction (2026-06-11):** Four rows were mis-tagged after code verification — `dispute-pack`, `vendor-confirm`, `Admin / dashboard roll-ups`, and `mocks/fixtures.ts`. Corrected below.
> **What this is:** one row per notable feature/screen/route across all four layers, tagged with what it *really* is and what to *do*. The single source of truth for Phase-1 convergence. **Living doc — refine as you go.**
>
> **Status:** REAL (wired, works) · THIN (shallow) · STUB (fake/placeholder/no-op) · DEAD (orphaned) · MISSING (doesn't exist yet)
> **Decision:** KEEP · FINISH · QUARANTINE (hide behind a `Labs`/pilot flag, don't delete) · CUT · BUILD

---

## Decisions locked this session

1. **Web stays Blueprint through the pilot.** The "Neev Desk" web re-skin is deferred to Phase 4 — don't re-skin a working surface mid-pilot.
2. **Chat doctrine (UPDATED 2026-06-10 — real contractor signal):** *"Own the room, bridge the edges."* Build a **reliable, intelligent, WhatsApp-grade in-app chat** as a real destination — for **(a)** the contractor's internal team AND **(b)** a shared **contractor↔client/homeowner room**. Capture happens **natively in-app** (the site engineer photographs the challan at the boundary); WhatsApp is only a **migration/edge bridge** (it's ToS-violating + unreliable as a core transport). Chat-as-intelligent-destination is the **acquisition wedge for the broader general-contractor market**. The ledger is still the moat; trust membrane still applies (AI proposes, human commits). *(Supersedes the old "rent the transport / keep chat thin" line.)*
3. **Roles — per company type (confirmed 2026-06-10).** CivilArch (interior fit-out) active set = **Owner · Architect · Site Engineer · Client (+ back-office Accountant)**. The **Architect is the central Spec-engine user** (owns the Material Spec + design decisions); **mukadam is not used** for this profile. The general-contractor profile uses Owner/Supervisor/Mukadam/Accountant. Keep all roles in code, surface per company type ("roles offered" config). **Add an `architect` role to the enum** (small, deliberate add — it's that central here).

> **Flagship bet (updated):** chat reliability + intelligence is no longer "keep thin" — it's a **flagship FINISH**. The whole "WhatsApp but intelligent" wedge dies if the chat isn't WhatsApp-grade reliable, and the current in-app chat is **unreliable today**. Hardening it (offline/delivery/media/voice/groups) is now a core competency to build, sequenced as a major Phase-2/3 surface alongside the Spec engine.

---

## Layer 1 — Backend (the engine)

| Feature | Status | Decision | Note |
|---|---|---|---|
| Auth — OTP login (`000000` stub) | STUB | **FINISH** | wire SMS or a pilot allowlist *before any external exposure* |
| Homeowner masking / membrane | THIN (leaky) | **FINISH** | close the PII-leak paths (Phase 2) |
| **Spec engine** (material spec · site-audit · client approval · costing) | MISSING | **BUILD** | the new capability — Phase 2; see [CIVILARCH-GOLDEN-PATH.md](CIVILARCH-GOLDEN-PATH.md) |
| `dispute-pack` route | REAL | **QUARANTINE (Labs)** | real hash-chained dispute pack (Phase 3.6) — NOT a no-op; gated behind `enable_labs`, hidden for the fit-out pilot. See [docs/LABS-QUARANTINE.md](LABS-QUARANTINE.md). |
| `vendor-confirm` route | REAL | **QUARANTINE (Labs)** | real token-capability vendor GRN loop (Phase 3.8), money-firewalled — NOT a no-op; gated behind `enable_labs`. See [docs/LABS-QUARANTINE.md](LABS-QUARANTINE.md). |
| Admin / dashboard roll-ups | REAL | **KEEP** | this is `GET /dashboard/home` (Owner Brief home) — real aggregation, used by the web (api/dashboard.ts). Not a stub. |
| Permit expiry sweep | THIN (never runs) | **QUARANTINE** | not a fit-out need |
| Vision / image captions | FROZEN | **QUARANTINE (Labs)** | finish in Phase 4 |
| Auto-translation | FAKED | **QUARANTINE (Labs)** | English-first now → low priority |
| Chat groups (no unread/activity) | THIN | **FINISH** | add unread + last-message sort |
| approvals · reconcile · brief · dpr · extraction · search · forecast · agent-ask · sites · payments · ingest · capture | REAL | **KEEP** | the production-grade spine |

## Layer 2 — Contractor mobile (Neev) — ✅ QA'd SHIP

| Feature | Status | Decision | Note |
|---|---|---|---|
| Owner (10 screens), PM, Supervisor, Accountant, Mukadam — all render w/ real data | REAL | **KEEP** | QA: 66/66 jest, all screens render, Neev applied |
| **Neev polish batch (from QA defects):** | | | *all non-blocking* |
| · SettingsRow sage chip leak on contractor More (`SettingsRow.tsx:93` uses `AP.chip`) | DEFECT | **FIX** | real cool-colour leak |
| · Company shows raw UUID on owner/pm/accountant More | DEFECT | **FIX** | name is available (homeowner shows it) |
| · Sign-out fires dev REPLACE nav warning (all roles) | DEFECT | **FIX** | `router.replace('/')` |
| · 2 inputs hardcode `Hind-Regular` instead of Mukta | DEFECT | **FIX** | font slip |
| · Mukadam save → no confirmation | DEFECT | **FIX** | also a flow-coverage gap |
| · Owner title / status-bar overlap | DEFECT | **FIX** | layout |
| · Stale docstrings (e.g. `login.tsx` "Blueprint amber-on-ink") | NIT | **FIX when touching** | cosmetic |
| pm screens · mukadam screens | REAL | **QUARANTINE** | hide for pilot (roles decision) |
| Owner Approve → terminal state · Mukadam stepper persist | UNVERIFIED | **FOLLOW-UP** | 10-min Maestro tap-through |

## Layer 3 — Contractor web (Blueprint) — live ~95%

| Feature | Status | Decision | Note |
|---|---|---|---|
| ~43 pages (owner brief, reconcile, approvals, search, DPR, admin, sites…) | REAL | **KEEP** | Blueprint through the pilot |
| **Material Spec Schedule + costing desk** | MISSING | **BUILD** | Phase 2 — web is the "desk" for the spec |
| `mocks/fixtures.ts` (orphaned) | REAL | **KEEP** | NOT orphaned — imported by web api/client.ts; powers VITE_USE_MOCKS mock mode. |
| Neev Desk re-skin | — | **DEFER → Phase 4** | locked decision #1 |

## Layer 4 — Homeowner mobile (Calm Cockpit) — ~90% wired

| Feature | Status | Decision | Note |
|---|---|---|---|
| Home · Photos · Updates · Design · Messages · Members · Settings | REAL | **KEEP** | QA: Calm Cockpit intact, untouched by Neev branch |
| **Room-by-room slice (% + "awaiting your selection")** | MISSING | **BUILD** | Phase 2 — from the Spec engine |
| Design "Approve" button | STUB (backend 501) | **FINISH** | Phase 2 — via Spec-engine approval gate |
| Monthly digest · voice search · notification delivery | honest placeholders | **QUARANTINE (Labs)** | label clearly |

## Layer 0 — Cross-cutting cleanup (Phase 1)

| Item | Decision |
|---|---|
| Commit the QA report + `.maestro/` e2e suite | **DO** (first regression net) |
| Prune ~150 merged remote branches; adopt delete-on-merge | **DO** |
| Delete orphaned Stitch tokens + web fixtures | **CUT** |
| Required CI status checks on `main` | **DO** |
| "Roles offered" per-company config (hide pm/mukadam/procurement) | **BUILD** (small) |

---

## How to read the work ahead

- **KEEP** rows = leave alone (they're the spine). The bulk of the product.
- **FINISH** rows = the real Phase-2 work (Spec engine, masking, homeowner slice, web spec-desk).
- **CUT** rows = delete the lies (no-op routes, dead fixtures) — fast Phase-1 wins.
- **QUARANTINE** rows = hide behind a flag for the pilot; nothing in the app should pretend to work.
- **FIX** rows = the Neev polish batch — a single cleanup pass.

This ledger *is* Phase 1. Clear the CUT + FIX rows, lock the QUARANTINE flags, and the product is honest end-to-end — then Phase 2 builds the FINISH/BUILD rows on a clean base.
