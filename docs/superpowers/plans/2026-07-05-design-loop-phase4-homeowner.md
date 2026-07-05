# Phase 4 — Homeowner Loop Completion + Pinterest UX + Presets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A homeowner with nothing but the app runs the whole loop without a dead end: quick-start rate presets → answer the AI's questions → settle disagreements → approve a theme → get the brief → send it → watch its state → read the designer's response → approve. Pinterest becomes one-tap; presets become real content.

**Architecture:** Calm Cockpit only (`constructo-homeowner-design` skill). Every new behavior = a pure util (jest-tested in `mobile/src/homeowner/`) + a thin screen change. Backend additions are small and front-load the phase: preset manifest ingest, idempotent preset add, flag-gated Pinterest board import.

**Assumes:** Phases 1–2 merged (homeowner authority on themes/conflicts/brief, self-serve start, events).

**Branch:** `feat/design-loop-p4-homeowner`.

## Global Constraints

- EN lead + HI secondary for every new string (extend the screen-local `STR`/util string tables, both languages, same keys).
- Calm language: conflicts are "Your styles differ", never warnings; errors name the fix.
- New routes registered `href: null` in `(homeowner)/_layout.tsx`; tests under `src/` only.
- Membrane-aware UI: owner/co-owner see commit buttons; family/advisor see the same content read-only with "Only an owner can settle this" — key off `homeowner.capabilities().can_approve` + 403 `approve_forbidden` fallbacks.
- Backend gates: ruff + pytest per task. Mobile: typecheck + jest per task.

## File structure (new/modified)

| File | Responsibility |
|---|---|
| `backend/assets/presets/manifest.json` + images | Real preset catalog (founder-supplied) |
| `backend/scripts/seed_profiler_presets.py` | `--from-dir` manifest mode |
| `backend/app/profiler/router.py` | Q5 idempotent preset add; P4 board branch |
| `backend/app/profiler/pinterest.py` | `parse_board_pins`, board fetch |
| `backend/app/config.py` | `pinterest_board_import: bool = False` |
| `mobile/src/homeowner/{clarifications,conflicts,brief_state,brief_diff,pin_paste}.util.ts` (+tests) | Pure logic |
| `mobile/app/(homeowner)/design.tsx`, `design/brief.tsx`, `design/profiler/[area].tsx` | Wiring |
| `mobile/app/(homeowner)/design/profiler/quickstart.tsx` (new) | Q3 rating deck |
| `mobile/app/(homeowner)/messages/[id].tsx` | `?draft=` composer seeding |

---

## A. Preset foundation (backend first — unblocks Q3/Q4)

### Task 1 (Q1): Manifest-driven preset ingest

**Files:** Modify `scripts/seed_profiler_presets.py`; Create `backend/assets/presets/manifest.json` (starter: 2 real entries + schema comment); Test `tests/test_seed_presets_manifest.py`.

**Interfaces:** manifest entry `{"pack": str, "title": str, "area_kind": "interior"|"house_build"|"elements", "area_key": str|null, "file": "<pack-dir>/<name>.jpg"}`. CLI: `python -m scripts.seed_profiler_presets --from-dir assets/presets` (no flag → existing gradient mode unchanged). Upsert identity stays uuid5-of-R2-key → re-runs overwrite bytes, never duplicate rows.

- [ ] **Step 1: Failing test** — pure loader function:

```python
# tests/test_seed_presets_manifest.py
import json, pytest
from scripts.seed_profiler_presets import load_manifest  # new pure fn

def test_load_manifest_validates_and_resolves(tmp_path):
    d = tmp_path / "warm-minimal"; d.mkdir()
    (d / "oak.jpg").write_bytes(b"\xff\xd8jpeg")
    (tmp_path / "manifest.json").write_text(json.dumps([
        {"pack": "Warm Minimal", "title": "Oak & stone", "area_kind": "interior",
         "area_key": "kitchen", "file": "warm-minimal/oak.jpg"},
    ]))
    items = load_manifest(tmp_path)
    assert items[0].bytes_path.name == "oak.jpg" and items[0].area_key == "kitchen"

def test_load_manifest_rejects_missing_file_and_bad_kind(tmp_path):
    (tmp_path / "manifest.json").write_text(json.dumps([
        {"pack": "X", "title": "gone", "area_kind": "interior", "area_key": None, "file": "nope.jpg"},
    ]))
    with pytest.raises(ValueError, match="nope.jpg"):
        load_manifest(tmp_path)   # fail LOUD before any write — no partial catalogs
```

- [ ] **Step 2-3:** fail → implement `load_manifest(dir) -> list[ManifestItem]` (dataclass: pack, title, area_kind, area_key, bytes_path) validating kind ∈ AreaKind values and file existence; `main(--from-dir)` iterates items through the EXISTING upsert (`_slug`, uuid5, `put_bytes`) reading real bytes instead of `_make_image`.
- [ ] **Step 4:** green; run the script once in gradient mode to confirm no regression. **Step 5: Commit** `feat(presets): manifest-driven real-image catalog ingest`

> **Q2 founder loop (no code):** drop CivilArch project photos into `assets/presets/<pack>/…` + extend manifest — target ≈6 packs (Warm Minimal, Modern Indian, Earthy Traditional, Soft Neutrals, Bold Contemporary, Classic Heritage) × kitchen/living/master bedroom/bath/pooja/facade/balcony. CivilArch-owned photos are the safe licensing core; verify terms for anything external. Re-run the script per batch — idempotent.

### Task 2 (Q5): Idempotent preset add

**Files:** Modify `app/profiler/router.py` `add_reference_from_preset` (:770-809); Test: extend `tests/test_profiler_presets.py`.

- [ ] **Step 1: Failing test** — add the same preset twice for one contributor+area → second call returns **200 with the SAME reference id** (not 201/duplicate); a different contributor same preset → new row.
- [ ] **Step 2:** implement: before insert, `select(ProfilerReference).where(area_id==, contributor_id==, preset_id==body.preset_id)`; hit → return `_reference_out(existing)` with `status_code=200` (use `Response(status_code=...)` pattern or split endpoint return via `JSONResponse`; simplest: keep 201 route but return existing row — then assert same-id only. **Pick same-id + 201 to avoid FastAPI response gymnastics; test asserts id equality, not status.**)
- [ ] **Step 3-4:** green → commit `fix(profiler): preset add is idempotent per contributor+area`

## B. Pinterest backend (P4 — board links, flag-gated)

### Task 3: `parse_board_pins` + board branch in from-link

**Files:** Modify `app/profiler/pinterest.py`, `app/profiler/router.py` (`add_reference_from_link` :690-737), `app/config.py` (+`pinterest_board_import: bool = False`); Test: extend `tests/test_profiler_pinterest.py` with fixture HTML.

**Interfaces:** `parse_board_pins(html: str, limit: int = 10) -> list[str]` — image URLs from the page's embedded `__PWS_DATA__` JSON; `is_board_url(url) -> bool` (`pinterest.*/<user>/<board>/` path with exactly 2 non-empty segments, not starting with `pin`). Endpoint behavior: board URL + flag ON → up to `limit` references created via the EXISTING single-image path (each og-image through `assert_safe_media_url` + re-host); returns the list's FIRST created ReferenceOut plus header `X-Board-Imported: <n>` (keeps the response model stable) — client treats it like a multi-add and refetches. Flag OFF or parse failure → 422 `pinterest_board_unsupported` "Board import is coming — paste individual pins for now."

- [ ] **Step 1: Failing tests**

```python
BOARD_HTML = """<html><body>
<script id="__PWS_DATA__" type="application/json">
{"props":{"initialReduxState":{"pins":{
  "1":{"images":{"orig":{"url":"https://i.pinimg.com/originals/aa/p1.jpg"}}},
  "2":{"images":{"orig":{"url":"https://i.pinimg.com/originals/bb/p2.jpg"}}}
}}}}</script></body></html>"""

def test_parse_board_pins_extracts_orig_urls():
    assert parse_board_pins(BOARD_HTML) == [
        "https://i.pinimg.com/originals/aa/p1.jpg",
        "https://i.pinimg.com/originals/bb/p2.jpg",
    ]

def test_parse_board_pins_empty_on_shape_change():
    assert parse_board_pins("<html><script id='__PWS_DATA__'>{}</script></html>") == []

def test_is_board_url():
    assert is_board_url("https://www.pinterest.com/ary/dream-kitchen/")
    assert not is_board_url("https://www.pinterest.com/pin/123/")
```

Plus an endpoint test: flag ON via `monkeypatch.setattr("app.config.settings.pinterest_board_import", True)` + MockTransport serving BOARD_HTML for the board URL and JPEG bytes for `i.pinimg.com` → POST from-link with the board URL creates 2 references in the area; flag OFF (default) → 422 `pinterest_board_unsupported`.
- [ ] **Step 2-3:** fail → implement. Parse: regex the `<script id="__PWS_DATA__"...>` body, `json.loads`, then walk: `data["props"]["initialReduxState"]["pins"]` dict → each pin's `images.orig.url` (guard every level with `.get`; non-dict → skip). Board fetch reuses `_get_pinterest_page` (same no-redirect + per-hop host-check discipline); EVERY extracted image URL passes `assert_safe_media_url` before fetch — identical to the single-pin path.
- [ ] **Step 4:** green (all existing pinterest tests too). **Step 5: Commit** `feat(pinterest): board-link import behind PINTEREST_BOARD_IMPORT flag`

## C. Homeowner UI completion

### Task 4: Brief-state copy map + state-aware banner (4.4)

**Files:** Create `mobile/src/homeowner/brief_state.util.ts` + test; Modify `design.tsx` (DPHub banner), `design/brief.tsx` (post-action confirmations).

**Interfaces:** `briefStateCard(state: string, opts: { note?: string; sinceLabel?: string }) -> { title: string; titleHi: string; body: string; bodyHi: string; tone: 'ok'|'info'|'warn'|'quiet'; cta?: 'view_brief'|'regenerate' } | null` (null → no banner, e.g. no brief yet).

- [ ] **Step 1: Failing test** — all seven states return honest copy naming the **next actor**: `homeowner_review`→"Your brief is ready — review and send it" · `architect_review`→"With your designer{since}" · `revision_requested`→"Changes asked: {note}" + cta regenerate · `contractor_brief_ready`→"Designer signed off — your approval unlocks pricing" · `approved`→"Being priced by your contractor" · `locked`→"Locked in — materials are being finalised"; unknown state → null (forward-compat).
- [ ] **Step 2-3:** fail → implement (pure map) → wire: DPHub renders the card (tone → StatusPill; cta buttons route to `/design/brief` or fire regenerate). In `brief.tsx`, after each successful `actMut`, replace bare toast with the SAME card content ("Done — {next actor line}").
- [ ] **Step 4-5:** typecheck/jest → commit `feat(homeowner): the Design tab always says whose move it is`

### Task 5: "Questions for you" — clarifications card + answer sheet (4.1)

**Files:** Create `mobile/src/homeowner/clarifications.util.ts` + test (`openClarifications(rows)` filter+sort, `CLAR_STR` en/hi); Modify `design.tsx` (DPHub card), `design/profiler/[area].tsx` (AI Notes tab list).

- [ ] **Step 1:** util test (open = `answer == null`, newest first; count label "2 questions for you"/"आपके लिए 2 सवाल").
- [ ] **Step 2:** DPHub: when `design.clarifications(pid)` has open rows → Card between progress and accordions: help-circle icon, count label, first question preview → press opens the area screen's AI Notes tab (`router.push` with `tab=notes` param the screen already accepts — else add param handling). AI Notes tab: each open row renders question + `TextInput` + "Send answer" → `design.answerClarification(id, text)` → invalidate + toast "Answered — this sharpens your brief". Answered rows show quietly beneath.
- [ ] **Step 3-4:** typecheck/jest → commit `feat(homeowner): the AI's questions are answerable in-app`

### Task 6: Conflict sheet (4.2) — replaces the "design chat" stub

**Files:** Create `mobile/src/homeowner/conflicts.util.ts` + test; Modify `design/profiler/[area].tsx` (conflict card + new sheet Modal).

**Interfaces:** `conflictSides(c: ProfilerConflict, contributors: Contributor[]) -> { dimension: string; label: string; a: { name: string; value: string }; b: { name: string; value: string } }` (names resolved from profile contributors; fallback "You"/"Co-owner").

- [ ] **Step 1:** util test with two contributors + a colors conflict → labeled sides; unknown contributor → fallback names.
- [ ] **Step 2:** Replace the stub button with "Settle this together" → Modal sheet (same slide-up pattern as the Pinterest sheet): shows both sides as two Cards, then three actions — `Go with {a.name}` (`resolution: 'keep_a'`), `Go with {b.name}` (`keep_b`), "Write our own middle ground" (TextInput → `resolution: 'compromise'`, note required), "Ask our designer to decide" (ghost, `defer_to_architect`) — all via `design.resolveConflict(conflictId, body)` (add wrapper: `resolveConflict: (id, body: { resolution: string; note?: string }) => request(POST /api/v1/design/conflicts/${id}/resolve)`). `can_approve === false` → sheet renders read-only + "Only an owner can settle this. You can talk it over in chat." Resolved conflicts render as quiet rows: "Settled by {name}: {note}".
- [ ] **Step 3-4:** typecheck/jest; commit `feat(homeowner): conflicts are settled in-app — accept, compromise, or defer`

### Task 7: Theme review for owners (4.3)

**Files:** Modify `design/profiler/[area].tsx` (AI Notes theme cards) and `design.tsx` ("From the AI" row badge).

- [ ] **Step 1:** On each `status === 'suggested'` theme card (owner/co-owner only): three Buttons — "Love it" (`approve`), "Close, adjust" (`adjust`, optional note via the note-sheet pattern), "Not this one" (`reject`) → `design.decideTheme(themeId, action)` (wrapper exists; homeowner path opened in Phase 1). Decided themes show StatusPill + "Approved by {you|name}". 403 `approve_forbidden` → toast the server's comment-box message. DPHub "Theme suggestions" ListRow gains a count chip when suggested themes await.
- [ ] **Step 2:** typecheck/jest (add a `themeDecisionLabel` micro-util + test only if logic exceeds a map); commit `feat(homeowner): owners commit theme decisions`

### Task 8: "Get my brief" + version history/diff (4.5 + 4.6)

**Files:** Create `mobile/src/homeowner/brief_diff.util.ts` + test; Modify `design.tsx`, `design/brief.tsx`.

**Interfaces:** `briefDiff(prev: BriefAreaPayload[] | null, curr: BriefAreaPayload[]) -> { area_key: string; added: string[]; removed: string[] }[]` — pure set-diff of `material_families` per area; prev null → [].

- [ ] **Step 1:** util failing test (v1 [oak] → v2 [oak, quartz] → added ["quartz"]; area present only in v2 → all added).
- [ ] **Step 2:** `design.tsx`: when ≥1 area status ready AND `design.brief` 404s → primary Button "Get my brief" → `design.generateBrief(pid)` → navigate to `/design/brief`. In `revision_requested`, `brief.tsx` shows "Regenerate with my updates" (same call). Version chip `v{n}` in the brief header; "What changed" section renders `briefDiff` of the previous rendering's `content_json.areas` (fetch previous via `design.approvals` → if the API lacks a prior-version fetch, keep the diff against the version cached in TanStack Query from before the regenerate — acceptable v1, note it honestly in the section title "Since you last looked").
- [ ] **Step 3-4:** typecheck/jest; commit `feat(homeowner): get-my-brief + honest what-changed`

### Task 9: Design chat deep-link with prefilled draft (4.7)

**Files:** Modify `mobile/app/(homeowner)/messages/[id].tsx` (accept `?draft=`), `design.tsx`, `design/profiler.tsx`, `design/profiler/[area].tsx` (replace the three stubs).

- [ ] **Step 1:** `messages/[id].tsx` — add `draft` to the existing `useLocalSearchParams<{...}>` (:128) and seed the composer state once: the screen owns `value` passed to `ChatComposer` (`src/chat/ChatComposer.tsx:26-37` — controlled component), so `const [text, setText] = useState(() => (typeof draft === 'string' ? draft : ''))` (adjust to the actual state variable name in the file).
- [ ] **Step 2:** Replace all three "(soon)" stubs with a shared helper in `design_profiler.util.ts`: `designChatDraft(ctx: { areaLabel?: string; briefVersion?: number }) -> string` ("About our {area} design…" / "About our design brief v{n}…") + navigation to the homeowner crew thread route (`/(homeowner)/messages/[id]` with the site's crew conversation id — resolve exactly the way `chat-viewer`/inbox resolves it today; pass `draft=designChatDraft(...)`). Delete the "(soon)" copy + ghost variants → normal secondary buttons.
- [ ] **Step 3-4:** typecheck/jest (util test for draft strings, en+hi); commit `feat(homeowner): design chat buttons go to the real room, context in hand`

### Task 10: Pinterest one-tap + multi-link (P2 + P3)

**Files:** `mobile/package.json` (+`expo-clipboard`), Create `mobile/src/homeowner/pin_paste.util.ts` + test; Modify `design/profiler/[area].tsx` pin sheet.

**Interfaces:** `extractPinterestUrls(text: string) -> string[]` — all pinterest/pin.it URLs in a blob (split on whitespace/newlines/commas, validate with the same host rule as the backend, dedupe, cap 10).

- [ ] **Step 1:** util failing test (mixed blob with 2 pins + 1 instagram URL → the 2 pins; 12 pins → first 10; empty → []).
- [ ] **Step 2:** `npx expo install expo-clipboard`. Pin sheet gains: "Paste from Pinterest" Button — on press `const text = await Clipboard.getStringAsync()` (explicit tap → no surprise iOS banner) → `extractPinterestUrls` → none? toast "Copy a pin link in Pinterest first, then tap again." The TextInput also accepts pasted multi-line blobs; submit runs sequentially: `for (const url of urls) try { await design.referenceFromLink({ area_id, contributor_id, url }) ; ok++ } catch (e) { fails.push(short(e)) }` → result line "{ok} added{fails.length ? `, ${fails.length} couldn't be read` : ''}" + per-fail Small rows (the backend's 422 messages are already homeowner-language). Board URLs pass straight through from-link (backend decides per flag; its 422 copy guides).
- [ ] **Step 3-4:** typecheck/jest; commit `feat(homeowner): Pinterest is paste-and-done, plural included`

### Task 11: Quick-start rating deck (Q3)

**Files:** Create `mobile/app/(homeowner)/design/profiler/quickstart.tsx` (+ register `href: null` in `(homeowner)/_layout.tsx`); Create `mobile/src/homeowner/quickstart.util.ts` + test; Modify `design/profiler/[area].tsx` (entry card).

**Interfaces:** `pickQuickstartPresets(presets: DesignPreset[], n = 10) -> DesignPreset[]` — pack-interleaved selection (round-robin across packs so one pack can't dominate), stable order (no randomness — deterministic for tests and repeat visits).

- [ ] **Step 1:** util failing test (3 packs × 4 items → first 10 alternate packs; <10 available → all).
- [ ] **Step 2: Screen** — route params `{ pid, area, key }`. Flow: load `design.presets(areaKind, areaKey)` → `pickQuickstartPresets` → one card at a time: full-width RefImage, pack+title kicker, a 1–5 star row, "Skip" ghost. On star tap: `await design.referenceFromPreset({ area_id, contributor_id, preset_id })` then `design.rankReference(ref.id, { contributor_id, stars, tags: {} })`, advance. Progress dots "3 of 10". Finish (or exit — progress persists naturally, both writes are idempotent): screen shows the area's new state line ("{n} rated — your taste is taking shape") + Button "See my area" → back to `[area]`. Entry: in `[area].tsx`, when `references.length === 0`, an inviting Card "Not sure where to start? Rate 10 designer picks — 1 minute" → quickstart.
- [ ] **Step 3:** With Phase 1 merged, finishing the deck crosses `recommended_count` → themes auto-propose → the AI Notes tab fills in on return. That IS the acceptance demo.
- [ ] **Step 4-5:** typecheck/jest; sim smoke in Phase 6; commit `feat(homeowner): rate-10-picks quick start — taste profile in a minute`

### Task 12: Phase gate

- [ ] Backend: ruff + full pytest. Mobile: typecheck + full jest. Register/verify all routes; PR `feat(design): Phase 4 — the homeowner loop has no dead ends`, review, merge.

## Self-review notes
- Every "coming soon" stub in the audit now has a real implementation task (chat 4.9→Task 9, conflict 4.2→Task 6, scope stays informational by design).
- P2/P3/P4 all funnel through the ONE existing re-host path — no second image pipeline.
- Q3 depends only on Q1 content existing in the environment (gradient fallback still works for dev).
