# Phase 0 — Land the In-Flight Design Fix Pass

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the ~250-line uncommitted working-tree pass (14 modified files + 1 untracked test) that fixes the P0 Design-tab bugs — dead `file://` reference uploads, the Pinterest og:image attribute-order bug (every real pin failed to parse), stale pin.it messaging, wrong ranked counters — as a reviewed, CI-green PR.

**Architecture:** No new design work. Verify the existing diff, don't rewrite it. The changes are: backend `POST /homeowner/design/references/upload` + `ReferenceUploadOut`; per-meta-tag Pinterest parser + `pinterest_unresolved` 422; generic preset fallback test; mobile upload-before-create in `references/[room].tsx`, honest counters/confidence in `design.tsx`, `KeyboardAvoidingView` pin sheet, check-fit error state.

**Tech stack:** existing — FastAPI/pytest/ruff, Expo/jest/tsc.

## Global Constraints

- Do NOT commit the stray root `node_modules/` (untracked at repo root) — stage explicit paths only.
- Mobile tests stay under `mobile/src/` (the new `src/api/homeowner.test.ts` is correctly placed — keep it there).
- Gates: backend `ruff check` + `pytest`; mobile `npm run typecheck` + `npx jest`. No web files touched → no web build needed.
- Do not push without green local gates (CI gates backend on ruff).

---

### Task 1: Branch and freeze the diff

**Files:** none (git only)

- [ ] **Step 1: Create the branch with the working tree as-is**

```bash
cd /Users/aryantripathi/Developer/contructionAI
git checkout -b fix/design-inflight-pass
git status --short   # expect exactly the 14 modified files + ?? constructo/mobile/src/api/homeowner.test.ts (+ ?? node_modules/ — leave it)
```

- [ ] **Step 2: Read the full diff once, looking only for landmines** (accidental debug code, unrelated edits). The known intentional changes are listed in the Architecture note above; anything outside that list gets flagged, not silently landed.

```bash
git diff
```

Expected: matches the 14-file diff summarized above; no `console.log`/`print` debris.

### Task 2: Backend verification

**Files:**
- Test: `constructo/backend/tests/homeowner/test_design.py`, `tests/test_profiler_pinterest.py`, `tests/test_profiler_presets.py` (all already modified by the pass)

- [ ] **Step 1: Run the touched suites first**

```bash
cd constructo/backend
uv run pytest tests/homeowner/test_design.py tests/test_profiler_pinterest.py tests/test_profiler_presets.py -q
```

Expected: PASS incl. the new `test_reference_upload_persists_real_bytes_and_resolves`, `test_parse_og_image_matches_real_pinterest_attribute_order`, `test_resolver_gives_actionable_error_when_shortlink_has_no_real_pin`, `test_list_presets_falls_back_to_generic_pack_for_uncataloged_area`.

- [ ] **Step 2: Full backend suite + lint**

```bash
uv run pytest -q 2>&1 | tail -5
uv run ruff check .
```

Expected: same pass count as main ± the new tests; only the known pre-existing WeasyPrint-OSError/date-sentinel failures (see pilot-ux-fix-playbook); ruff clean.

### Task 3: Mobile verification

- [ ] **Step 1:**

```bash
cd ../mobile
npm run typecheck
npx jest src/api/homeowner.test.ts src/homeowner --silent 2>&1 | tail -5
npx jest --silent 2>&1 | tail -3
```

Expected: typecheck 0 errors; full jest green including the new `homeowner.test.ts` (it pins the `uploadReferenceImage` multipart contract).

### Task 4: Commit, PR

- [ ] **Step 1: Stage exactly the pass**

```bash
cd /Users/aryantripathi/Developer/contructionAI
git add constructo/backend/app/homeowner/router.py constructo/backend/app/homeowner/schemas.py \
  constructo/backend/app/profiler/pinterest.py constructo/backend/tests/homeowner/test_design.py \
  constructo/backend/tests/test_profiler_pinterest.py constructo/backend/tests/test_profiler_presets.py \
  "constructo/mobile/app/(homeowner)/_design_select.util.ts" "constructo/mobile/app/(homeowner)/design.tsx" \
  "constructo/mobile/app/(homeowner)/design/brief.tsx" "constructo/mobile/app/(homeowner)/design/profiler.tsx" \
  "constructo/mobile/app/(homeowner)/design/profiler/[area].tsx" \
  "constructo/mobile/app/(homeowner)/design/references/[room].tsx" \
  "constructo/mobile/app/(homeowner)/design/select.tsx" constructo/mobile/src/api/client.ts \
  constructo/mobile/src/api/homeowner.test.ts
git status --short   # nothing design-related left unstaged; node_modules/ still untracked
```

- [ ] **Step 2: Commit + push + PR**

```bash
git commit -m "fix(design): real reference uploads, Pinterest parse for real pin pages, honest counters

- homeowner design references: upload bytes to storage first (new POST
  /homeowner/design/references/upload) instead of persisting dead file:// URIs
- pinterest: per-meta-tag og:image parse (real pages emit content BEFORE
  property) + actionable 422 for stale pin.it links
- presets: generic pack fallback for uncataloged areas
- design tab: my_ranked_count-based counters, real avg confidence, honest
  'Design chat (soon)', keyboard-safe pin sheet, check-fit error state

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push -u origin fix/design-inflight-pass
gh pr create --title "fix(design): land the in-flight Design-tab fix pass" --body "$(cat <<'EOF'
Lands the working-tree fix pass: real reference uploads (was dead file:// paths), Pinterest parse fix (every real pin page failed on attribute order), stale pin.it 422, honest ranked counters + UX polish. Phase 0 of docs/superpowers/plans/2026-07-05-design-loop-master-plan.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Watch CI to green, then merge** (repo convention: merge via PR, CI gates backend ruff+pytest, mobile typecheck+jest).
