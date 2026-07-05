# Phase 3 — Designer Cockpit Completion (Mobile Architect + Web /designer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The designer can run their whole half of the loop from either surface: see a sent brief → read clarification answers + conflicts → request changes (with note) or sign off → generate/regenerate → materialize — the mandatory `architect_sign_off` step finally has buttons.

**Architecture:** Thin clients only — every capability already exists in `/api/v1/design/*` (post Phase 1). Mobile work lives in `app/(contractor)/architect/` (Neev contractor design system, `constructo-contractor-design` skill); web in `src/features/designer/` (Blueprint tokens). Shared presentation logic goes in pure utils with jest/vitest tests; screens stay declarative.

**Assumes:** Phases 1–2 merged (homeowner theme authority, `design.generateBrief` wrapper, `inbox-summary`).

**Branch:** `feat/design-loop-p3-designer`.

## Global Constraints

- `request_changes` REQUIRES a note (client-enforced; server accepts empty today — do not weaken the client rule).
- Action availability derives ONLY from `brief.state` via one shared util (below) — never scatter state checks in JSX.
- Mobile: no test files under `app/`; utils + tests in `mobile/src/architect/`. Web verify = `npm run build`.
- Materialize buttons only render for state ∈ {contractor_brief_ready, approved, locked}; 409 `brief_not_ready` still handled (races).

## File structure

| File | Responsibility |
|---|---|
| `mobile/src/architect/brief_actions.util.ts` (+test) | state → available designer actions + labels (EN/HI) |
| `mobile/app/(contractor)/architect/dp/[id].tsx` | action bar, clarifications, generate/regenerate, materialize, timeline |
| `mobile/app/(contractor)/architect/brief.tsx` | badge chips (Phase 2) + state pill per profile card |
| `web/src/features/designer/Intake.tsx` | same capabilities, web |
| `web/src/api/design.ts` | +`actOnBrief`, +`clarifications`, +`conflicts`, +`resolveConflict`, +`generateBrief` (Phase 1 added), +`briefApprovals` |
| `mobile/src/api/client.ts` | +`design.materialize(briefId)` (web already has it) |

---

### Task 1: `brief_actions.util.ts` — one source of action truth

**Files:** Create `mobile/src/architect/brief_actions.util.ts` + `mobile/src/architect/brief_actions.util.test.ts`.

**Interfaces:**
- Produces: `designerActions(state: string): DesignerAction[]` where `DesignerAction = { action: 'architect_sign_off' | 'request_changes' | 'regenerate' | 'materialize', label: string, labelHi: string, variant: 'primary' | 'secondary' | 'ghost', needsNote?: boolean }`. `'regenerate'` and `'materialize'` are client pseudo-actions (regenerate calls `design.generateBrief`, materialize calls `design.materialize`); the other two go to `design.actOnBrief`.

- [ ] **Step 1: Failing test**

```ts
// mobile/src/architect/brief_actions.util.test.ts
import { designerActions } from './brief_actions.util'

test('architect_review offers sign-off and request-changes(note)', () => {
  const acts = designerActions('architect_review')
  expect(acts.map(a => a.action)).toEqual(['architect_sign_off', 'request_changes'])
  expect(acts[1].needsNote).toBe(true)
})
test('revision_requested offers only regenerate — the dead-end exit', () => {
  expect(designerActions('revision_requested').map(a => a.action)).toEqual(['regenerate'])
})
test('contractor_brief_ready and beyond offer materialize', () => {
  expect(designerActions('contractor_brief_ready').map(a => a.action)).toContain('materialize')
  expect(designerActions('approved').map(a => a.action)).toContain('materialize')
  expect(designerActions('locked').map(a => a.action)).toEqual(['materialize'])
})
test('homeowner_review is read-only for the designer', () => {
  expect(designerActions('homeowner_review')).toEqual([])
})
```

- [ ] **Step 2:** run → FAIL. **Step 3: Implement** as a plain switch/map returning the arrays above (labels: "Sign off brief"/"ब्रीफ़ स्वीकृत करें", "Request changes"/"बदलाव माँगें", "Regenerate brief"/"ब्रीफ़ फिर बनाएँ", "Create material selections"/"सामग्री चयन बनाएँ"). **Step 4:** green. **Step 5: Commit** `feat(architect): designer brief action map`

### Task 2: Mobile action bar + request-changes note sheet (`dp/[id].tsx`)

**Files:** Modify `mobile/app/(contractor)/architect/dp/[id].tsx`.

The screen already loads `design.profile(id)` + per-area themes. Add: `briefQ = useQuery({queryKey: ['dp','brief',id], queryFn: () => design.brief(id, 'architect'), retry: false})` (404 → null: show "No brief yet — homeowner is still building" Card). Read state from `briefQ.data.brief_state` (the rendering carries `brief_id` + state per Plan-4 client types; if the field is absent, fetch state via `design.approvals(brief_id)` latest row — verify against actual `ProfilerBriefRendering` type and prefer the direct field).

- [ ] **Step 1:** Render the bar (below SubHeader, above theme sections):

```tsx
{brief && designerActions(brief.brief_state).map((a) => (
  <Button key={a.action} title={a.label} variant={a.variant} size="md"
    loading={acting === a.action}
    onPress={() => a.needsNote ? setNoteSheet(a.action) : runAction(a.action)} />
))}
```

with

```tsx
const qc = useQueryClient()
const [acting, setActing] = useState<string | null>(null)
const [noteSheet, setNoteSheet] = useState<string | null>(null)
const [note, setNote] = useState('')
async function runAction(action: string, noteText?: string) {
  setActing(action)
  try {
    if (action === 'regenerate') await design.generateBrief(pid)
    else if (action === 'materialize') { const r = await design.materialize(brief.brief_id); setMatResult(r) }
    else await design.actOnBrief(brief.brief_id, { action, note: noteText })
    toast(action === 'architect_sign_off' ? 'Signed off — the homeowner will be notified' : 'Done')
    void qc.invalidateQueries({ queryKey: ['dp'] })
  } catch (e) { toast((e as Error).message) } finally { setActing(null); setNoteSheet(null); setNote('') }
}
```

Note sheet = the same Modal pattern as the area screen's Pinterest sheet (slide-up Pressable scrim + Card with `TextInput multiline` bound to `note`, primary button disabled while `note.trim().length < 3`).
- [ ] **Step 2:** Materialize result sheet: on `matResult`, Card listing `specs_created`, `materials_created`, `skipped_areas.join(', ')` + Button "Open selections" → `router.push('/(contractor)/architect/selections')`.
- [ ] **Step 3:** Approval timeline section (bottom): `design.approvals(brief.brief_id)` → ListRow per row: icon "check-circle", title from the Phase-2 `_DESIGN_TITLES`-equivalent label map (duplicate the 5-entry map locally in `brief_actions.util.ts` as `actionLabel(action)`), subtitle `${actor_role} · ${date}`.
- [ ] **Step 4:** typecheck + jest green; quick sim check happens in Phase 6. **Step 5: Commit** `feat(architect): sign-off, request-changes, regenerate, materialize on mobile`

### Task 3: Clarifications panel (mobile)

**Files:** Modify `dp/[id].tsx`; util additions in `brief_actions.util.ts`.

- [ ] **Step 1:** `clarQ = useQuery({queryKey: ['dp','clar',pid], queryFn: () => design.clarifications(pid)})`. Add util + test: `splitClarifications(rows) -> { answered: Clarification[], waiting: Clarification[] }` (answered = `answer != null`, both newest-first).
- [ ] **Step 2:** Section "Homeowner Q&A": waiting rows render quiet (question + "Waiting for homeowner"); answered rows render question + BodyStrong answer + date. If `answered.length > 0 && brief?.brief_state === 'revision_requested'`, show an inline hint Card: "New answers came in — regenerate the brief to fold them in" (button reuses `runAction('regenerate')`).
- [ ] **Step 3:** typecheck/jest; commit `feat(architect): clarification answers visible where decisions happen`

### Task 4: Web — actions, clarifications, conflicts parity (`Intake.tsx`)

**Files:** Modify `web/src/api/design.ts`, `web/src/features/designer/Intake.tsx`.

- [ ] **Step 1: API methods** (each copies the `profileBySite` USE_MOCKS+call pattern verbatim, `web/src/api/design.ts:318-326`):

```ts
actOnBrief(briefId: string, body: { action: string; note?: string }) →
  POST /api/v1/design/briefs/${briefId}/approval
clarifications(profileId: string) → GET /api/v1/design/profiles/${profileId}/clarifications
conflicts(profileId: string)     → GET /api/v1/design/profiles/${profileId}/conflicts
resolveConflict(conflictId, body: { resolution: string; note?: string }) →
  POST /api/v1/design/conflicts/${conflictId}/resolve
briefApprovals(briefId: string)  → GET /api/v1/design/briefs/${briefId}/approvals
generateBrief(profileId: string) → POST /api/v1/design/profiles/${profileId}/brief   // added in Phase 1 Task 11 — verify present
```

USE_MOCKS branches return static shapes consistent with the MOCK_* fixtures (one canned clarification answered, one open conflict, approvals list of two rows).
- [ ] **Step 2: Intake sections.** Port Task 1's util into `web/src/features/designer/briefActions.ts` (same code, same tests under the web test runner) — do NOT fork logic. Render: action buttons row (request-changes opens an inline textarea + confirm), "Homeowner Q&A" list, "Conflicts" list with resolve buttons (`keep_a` / `keep_b` / note-compromise / already-deferred rows show "Homeowner asked you to decide" badge), approval timeline.
- [ ] **Step 3:** existing web test file for Intake (add cases: sign-off button visible in architect_review; materialize hidden in homeowner_review) — then `npm run build` + web tests green. **Step 4: Commit** `feat(web): full designer brief cockpit in Intake`

### Task 5: Mobile materialize wrapper + architect hub state pills

**Files:** `mobile/src/api/client.ts` (+`materialize: (briefId: string) => request<MaterializeOut>(...POST...)` + `MaterializeOut` type `{ materials_created: number; materials_reused: number; specs_created: number; specs_reused: number; skipped_areas: string[] }`), `mobile/app/(contractor)/architect/brief.tsx` (profile cards gain a brief-state StatusPill via a small `stateTone` map: homeowner_review/quiet · architect_review/info · revision_requested/warn · contractor_brief_ready/ok · approved/ok · locked/quiet), plus the Phase-2 badge chips if not landed.

- [ ] Steps: URL-shape jest in `src/api/design_loop.test.ts` → implement → typecheck/jest → commit `feat(architect): brief hub shows where every brief stands`.

### Task 6: Phase gate

- [ ] Full: backend suite untouched (verify no accidental edits), mobile typecheck+jest, web build+tests. PR `feat(design): Phase 3 — the designer cockpit closes its half of the loop`, review, merge.

## Self-review notes
- The mandatory-path fix (sign-off UI) is Task 2/Task 4 — both surfaces.
- Action availability logic exists once per platform, tested, both ports of the same table.
- `regenerate` from `revision_requested` matches Phase 1 Task 7's pinned backend behavior.
