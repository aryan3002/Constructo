# Phase 6 — Prove the Loop, Then Ship It

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One command seeds both personas mid-loop; a scripted sim walk closes the loop from both phones; full gates pass; prod gets the deploy. Nothing ships on green checkmarks alone — the loop is walked, live.

**Assumes:** Phases 1–5 merged to main.

**Branch:** `feat/design-loop-p6-ship` (seeds + fixes only).

## Global Constraints

- Sim smoke is MANDATORY for every screen this program added/changed — jest cannot catch missing providers, unregistered routes, or missing endpoints (lesson: the 2026-06-12 ToastProvider + missing-GET bugs were only caught on device).
- Backend deploy is the Azure-for-Students subscription (`7674466f…`), app `constructo-api` / rg `constructo-rg` — runbook `backend/DEPLOY.md`.
- Web deploys automatically on Vercel from main; verify after backend.

---

### Task 1: `scripts/seed_design_loop_demo.py` — both personas, mid-loop

**Files:** Create `backend/scripts/seed_design_loop_demo.py` (structure-copy `seed_profiler_demo.py`); Test: none (script), but it must be idempotent (uuid5 identities, upserts) and end by printing login coordinates.

- [ ] **Step 1:** Seed one company + site with:
  - Homeowner owner (+ co-owner) members, OTP 000000 phones printed at the end.
  - Architect user (reuse `seed_designer_calm.py` persona pattern, phone +919810000020 family).
  - Profile with 3 areas: **kitchen** = ranked past threshold (so Phase-1 auto-propose has fired: suggested themes + 2 clarifications, 1 answered), **living room** = 1 open conflict between the two owners + 1 deferred_to_architect, **master bedroom** = 0 refs (quick-start entry demo).
  - Brief v2 in `architect_review` (v1 went through request_changes — approvals history shows it).
  - 2 materialized+routed specs from an older approved brief → 2 pending homeowner Decisions with `spec_id` (the payoff group renders).
  - Presets seeded via `--from-dir` if `assets/presets/manifest.json` exists, else gradient fallback.
- [ ] **Step 2:** Run twice; second run changes nothing (idempotency by construction). Commit `feat(seeds): full design-loop demo world`.

### Task 2: Sim smoke — walk the loop closed

- [ ] Run backend + `expo start`; execute this script on the iOS simulator, checking EVERY item:

**Homeowner phone (owner):**
1. Design tab → state banner reads "With your designer" (brief v2) — Phase 4.4.
2. Master bedroom → quick-start deck → rate 10 → return → themes appear in AI Notes (auto-propose live) — Phases 4.11 + 1.
3. Kitchen → "Questions for you" → answer one → designer badge math will move — Phase 4.5.
4. Living room → conflict sheet → "Write our own middle ground" → settled row renders — Phase 4.6.
5. Approve one suggested theme ("Love it") — Phase 4.7.
6. Pinterest sheet → "Paste from Pinterest" with a real copied pin → tile appears; paste 2 links at once → 2 tiles — Phase 4.10 (needs sim clipboard + network).
7. Selections tab → "From your design brief" group → open a decision → Approve (owner) — Phase 5.4.
8. Design-chat button → lands in crew thread with prefilled draft — Phase 4.9.
9. Bell inbox shows design rows; background the app → trigger a designer action (below) → push arrives (PUSH_SEND_MODE=expo on a dev backend or assert via bell) — Phase 2.

**Designer phone/web:**
10. Architect Brief hub → badge counts ("1 waiting") + state pills — Phases 2.7/3.5.
11. dp/[brief] → clarification answers visible → Request changes with note → homeowner banner flips + note shows — Phase 3.2/3.3.
12. Homeowner regenerates ("Regenerate with my updates") → v3 → designer sees it, Signs off — Phases 4.8/3.2.
13. Homeowner approves v3 → designer Materializes (mobile this time) → result sheet → Selections desk shows rows — Phases 3.5.
14. Web `/designer?tab=intake`: same brief, conflicts panel shows the deferred one, resolve it — Phase 3.4. Owner web activity feed shows the design rows — Phase 2.3/2.4.

- [ ] Any failure: `superpowers:systematic-debugging`, fix, re-walk THAT numbered step and its neighbors. Commit fixes individually.

### Task 3: Full gates

- [ ] `cd constructo/backend && uv run ruff check . && uv run pytest -q` — zero regressions (known WeasyPrint/date-sentinel exceptions only).
- [ ] `cd constructo/mobile && npm run typecheck && npx jest --silent`.
- [ ] `cd constructo/web && npm run build && npm test --silent` (build, not lint — the CI/Vercel gotcha).
- [ ] PR + CI green + merge.

### Task 4: Deploy + live verify

- [ ] Backend: follow `backend/DEPLOY.md` (build+push image, `az containerapp update -n constructo-api -g constructo-rg --image …`); confirm the new revision Healthy/100%.
- [ ] Apply migrations against prod Neon (the two Phase-1 columns): runbook's alembic step.
- [ ] `curl https://<api>/healthz` → 200; `GET /api/v1/design/presets` authed → 200 (Labs live).
- [ ] Seed real presets in prod when Q2 images exist: `python -m scripts.seed_profiler_presets --from-dir assets/presets` against prod env (runbook DB URL discipline).
- [ ] Vercel auto-deploy verified: owner web activity renders design rows against prod.
- [ ] One REAL loop transition on prod with a pilot-allowlisted phone: paste one real pin → tile renders (presigned URL OK in prod R2). Done means done.

### Task 5: Program close-out

- [ ] Update `docs/superpowers/plans/2026-07-05-design-loop-master-plan.md` phase table statuses.
- [ ] Note follow-ups that stayed deferred: Pinterest OAuth build (post-approval), P4 flag flip decision after fixture confidence, legacy DesignReference data migration, brief PDF export.
