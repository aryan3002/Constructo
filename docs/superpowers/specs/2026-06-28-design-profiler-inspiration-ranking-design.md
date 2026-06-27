# Design Profiler — Real Inspiration Images + Complete Ranking Loop

**Date:** 2026-06-28
**Author:** Aryan (with Claude)
**Status:** Approved design → implementation
**Scope:** Homeowner Design tab (`(homeowner)/design/profiler/*`) + `/api/v1/design/*` backend

---

## 1. Context & problem

The Design tab is the **Design Profiler** — a deterministic engine that turns a homeowner's
taste into an evidence-backed, per-room brief the architect and contractor can build from.
The pipeline (already real on the backend) is:

```
Profile + Areas → Collect references → Vision-extract attributes → Rank (stars+tags)
→ Deterministic taste model → AI-drafted themes (human-approved) → Conflicts → Versioned brief → Materialize to Specs
```

The ranking math, taste reducer, themes, conflicts, and brief are all built and wired.
**But the image layer is stubbed end-to-end**, which is why every area shows "0 of 6 ranked"
and an empty grid:

1. **Nothing can upload.** The `Upload` / `Pinterest` / `Presets` buttons on
   `design/profiler/[area].tsx` only call `toast('… coming soon')`. No picker, no upload,
   no `addReference()`. → no reference rows are ever created.
2. **The UI draws placeholders, not photos.** `RefGridTile` / `RefRankRow` render a grey
   `<Feather name="image">` icon; they never read an image URL.
3. **The backend never returns the image.** `ReferenceOut` exposes
   `id, area_id, source_type, consistency_status, created_at` — no `image_r2_key`, no URL.
4. **Latent bug:** `add_reference` passes the **bare R2 key** (not a fetchable URL) to the
   vision model (`extract_reference_attributes`), so attribute extraction silently fails in
   prod for uploaded images. The consistency check then runs on empty attributes.
5. **Ranked counters are fake.** `[area].tsx` hardcodes `ranked = 0`; the area-list
   progress label is derived from reference count, not actual rankings.

## 2. Goals / non-goals

**Goals**
- Homeowner (and any invited household contributor) can add inspiration images to an area
  from **three sources**: device upload (library/camera), **Pinterest** (paste a pin link),
  and **Presets** (curated designer packs).
- Those images **render** in the Inspiration grid and on the Ranking rows.
- The homeowner can **rank** each image (1–5 stars + quick tags) and the
  **"X of N ranked"** counters update for real (area screen + area-list hub).
- All three sources converge on **one** `profiler_references` row type → one display path,
  one ranking path, one vision-extraction path.
- Fix the vision-URL bug so attribute extraction actually runs.

**Non-goals (this pass)**
- Full Pinterest OAuth "connect account" + board import (needs Pinterest app review; deferred,
  but the data model is forward-compatible — `source_type=pinterest_oauth` already exists).
- The "Sharing" private/shared toggle (separate feature; the old `references/[room].tsx` stub).
- Contractor/architect-side reference upload UI (engine already supports it; out of scope here).
- Editing/removing a reference's ranking history UI beyond the existing save-rating flow.

## 3. Core principle — the converged reference

Every input source produces the **same** `profiler_references` row with an `image_r2_key`
pointing at an object in **our** R2 bucket. Uploads store the picked file; Pinterest
**re-hosts** the pin's preview image into R2; presets reference a pre-seeded R2 object.
Downstream — display, vision extraction, ranking, taste, brief — is identical and source-agnostic.

```
                    ┌─────────── device upload ───────────┐
  homeowner ──────► │ presign → PUT to R2 → key            │
                    ├─────────── Pinterest link ───────────┤ ──► profiler_references
                    │ resolve og:image → fetch → put_bytes │      (image_r2_key in OUR R2)
                    ├─────────── preset pack ──────────────┤        │
                    │ copy/ref seeded R2 object            │        ▼
                    └──────────────────────────────────────┘   vision extract · rank · taste · brief
```

## 4. Backend design (`/api/v1/design/*`)

### 4.1 `ReferenceOut` returns a viewable image (+ vision-URL fix)
- Add fields to `ReferenceOut`: `image_r2_key: str | None`, `source_url: str | None`,
  `image_url: str | None` (computed), `preset_id: str | None`.
- `image_url` is minted with the existing `get_storage().url_for(image_r2_key)` — a
  short-lived presigned GET (S3/R2) or a local path (dev). `source_url` is passed through
  when there is no key (e.g. an as-yet-un-rehosted external image).
- Because `ReferenceOut` is currently `from_attributes`, the computed `image_url` is added
  in a small serializer helper (`_reference_out(ref, storage)`), used by `add_reference`,
  `list_references`, and the from-link / from-preset endpoints.
- **Bug fix in `add_reference`:** compute
  `vision_url = body.source_url or get_storage().url_for(ref.image_r2_key)` and pass *that*
  to `extract_reference_attributes`, never the bare key.

### 4.2 Upload plumbing (mirror the proven chat flow, scoped to a profile)
Two endpoints, mirroring `/chat/media/presign` + `/chat/media`, but membrane-scoped by
`profile_id` (reuse `_load_accessible_profile`, derive `site_id` from the profile):

- `POST /api/v1/design/media/presign` → body `{ profile_id }` → `{ key, put_url, upload_mode }`.
  Key shape: `design/{site_id}/{uuid4().hex}.jpg`. `presigned_put` for S3; `NotImplementedError`
  on local → `upload_mode:"multipart"`, `put_url:null`.
- `POST /api/v1/design/media` (multipart fallback for local/CI) → `file` + `profile_id` →
  stores via `put_bytes` → `{ key }`. Enforce a max size (reuse the 15 MB chat ceiling).

The client then calls the existing `POST /api/v1/design/references` with `image_r2_key=key`.

### 4.3 Pinterest "from-link" resolver (Layer 2)
- `POST /api/v1/design/references/from-link` → body
  `{ area_id, contributor_id?, url }`.
- Server fetches `url` (allowlist host = `*.pinterest.*`, `pin.it`; follow one redirect for
  `pin.it` shortlinks), parses `<meta property="og:image">` (fallback `twitter:image`).
- **Re-host:** download the og:image bytes (size-capped, content-type must be `image/*`),
  `put_bytes('design/{site_id}/{uuid}.jpg', …)` → key.
- Create the reference with `source_type=pinterest_link`, `image_r2_key=key`,
  `source_url=<original pin url>`, then run the same vision extraction + consistency path as
  `add_reference`. Returns `ReferenceOut`.
- Network/parse failures → `AppError(422, "pinterest_unresolved", …)` with a friendly message;
  never 500.

### 4.4 Presets catalog (Layer 3)
- New table `profiler_presets`: `id`, `area_kind` (interior/house_build/element),
  `area_key` (e.g. `kitchen`; nullable = applies to any area of that kind), `pack` (e.g.
  "Warm Minimal"), `title`, `image_r2_key`, `sort`, `created_at`. Additive migration.
- Seed script `scripts/seed_profiler_presets.py` uploads a handful of curated images per
  common room into R2 and inserts rows. (Pilot: ~4 packs × ~4 rooms; honest + small.)
- `GET /api/v1/design/presets?area_kind=&area_key=` → list available presets (membrane: any
  authenticated user; images are generic catalog, not site data).
- `POST /api/v1/design/references/from-preset` → `{ area_id, contributor_id?, preset_id }` →
  creates a reference with `source_type=preset`, `preset_id`, and `image_r2_key` copied from
  the preset row (no re-upload needed — same bucket). Runs vision extraction like the rest.

### 4.5 Ranking progress counters
- Extend `AreaOut` with `reference_count: int` and `my_ranked_count: int` (the latter computed
  for the requesting user's `my_contributor_id`; `0` when they are not a contributor).
- `get_profile` / `get_profile_by_site` populate these with two grouped count queries over
  `profiler_references` and `profiler_rankings` (joined to references in the area). Keep it to
  2 aggregate queries for the whole profile, not N per area.

### 4.6 Membrane / security (unchanged rules, new surfaces honor them)
- All new endpoints load the profile via `_load_accessible_profile` (homeowner needs an active
  membership on the site; contractor-side keeps company scope).
- `from-link` / `from-preset` / `add_reference` already validate `contributor_id` via
  `_validate_contributor` — a homeowner may only add as themselves.
- Presigned PUT keys are namespaced under `design/{site_id}/…`; GET is presigned + short-lived.

## 5. Mobile design (`constructo/mobile`)

Built on the **Calm Cockpit** homeowner design system (`constructo-homeowner-design` skill) —
reuse existing `ui` primitives (`Card`, `Button`, `Chip`, `Sheet/Modal`, tokens). No new
visual language.

### 5.1 `RefImage` — render the real photo
- New small component: given `reference.image_url`, render an `<Image>` with the rounded-tile
  styling; while loading or when `image_url` is null, fall back to the current
  `<Feather name="image">` placeholder + a tiny source kicker ("Upload"/"Pinterest"/"Preset").
- Used by both `RefGridTile` (Inspiration grid, 120px) and `RefRankRow` (Ranking row, 68px).

### 5.2 Upload wiring (`Upload` button)
- Reuse the `useChatThread` pattern: `expo-image-picker` (library; offer camera too) →
  `design.presignMedia({ profileId })` → if `presigned`, `fetch(put_url, {method:'PUT', body: blob,
  headers:{'Content-Type':'image/jpeg'}})`; else multipart `POST /design/media` →
  `design.addReference({ area_id, contributor_id, image_r2_key: key, source_type:'upload' })` →
  invalidate `['design','profiler']`.
- Optimistic "Uploading…" state on the tile; toast on success/failure. Gate on `canRank`-style
  membership: a non-contributor sees the buttons disabled with "Only members of this home can add."

### 5.3 Pinterest sheet (`Pinterest` button)
- Opens a small bottom sheet: a `TextInput` ("Paste a Pinterest pin link") + "Add" button.
- On submit → `design.referenceFromLink({ area_id, contributor_id, url })` → invalidate.
- Inline error if `pinterest_unresolved`; success toast + the new tile appears.

### 5.4 Presets picker (`Presets` button)
- Opens a sheet listing packs (`design.presets({ area_kind, area_key })`), grouped by `pack`,
  each a tappable thumbnail. Tap → `design.referenceFromPreset({ area_id, contributor_id, preset_id })`
  → invalidate. Multi-add allowed (tap several, then "Done").

### 5.5 Real counters
- `[area].tsx`: replace `ranked = 0` with `areaDetail.my_ranked_count`; progress bar uses
  `my_ranked_count / recommended_count`; header subtitle "X of N ranked".
- `profiler.tsx` (hub) + area rows: use `reference_count` / `my_ranked_count` for the
  "0 of 6 ranked" labels via the existing `areaProgressLabel` helper.

### 5.6 Types & API client (`src/api/client.ts`)
- `ProfilerReference` gains `image_url: string | null`, `image_r2_key: string | null`,
  `source_url: string | null`, `preset_id: string | null`.
- `ProfilerArea` gains `reference_count: number`, `my_ranked_count: number`.
- `design` client gains: `presignMedia`, `uploadMedia` (multipart), `referenceFromLink`,
  `presets`, `referenceFromPreset`. `addReference` already exists.

## 6. Data flow (per layer)

**Layer 1 — upload:** pick → presign → PUT/multipart → key → `addReference(image_r2_key)` →
server stores row + `url_for` for vision → `ReferenceOut.image_url` → grid/rank render → rank →
`my_ranked_count` increments.

**Layer 2 — Pinterest:** paste url → `from-link` → og:image → re-host to R2 → reference (same
shape as upload) → identical render + rank.

**Layer 3 — preset:** open packs → tap → `from-preset` → reference referencing seeded R2 key →
identical render + rank.

## 7. Error handling
- Upload: presign failure → multipart fallback; PUT failure → toast, keep local optimistic tile
  in an error state with retry. Oversize (>15 MB) → friendly toast.
- Pinterest: non-Pinterest host / no og:image / fetch fail → `422 pinterest_unresolved`,
  inline sheet error. Never 500.
- Vision extraction: already wrapped in try/except — never fails the request (logs + leaves
  attributes empty). Unchanged.
- Presets: empty catalog → sheet shows "No preset packs yet."

## 8. Testing strategy

**Backend (pytest, `constructo/backend`):**
- `ReferenceOut.image_url` is a resolvable URL for a keyed reference; null when no key.
- `add_reference` passes a resolved URL (not the bare key) to a `FakeLLMClient` spy.
- presign returns `multipart` mode under LocalStorage; `/design/media` stores bytes + returns key.
- `from-link`: stub the fetcher; og:image parsed + re-hosted + reference created; bad host → 422.
- `from-preset`: creates a reference with the preset's key; unknown preset → 404.
- counters: `reference_count` / `my_ranked_count` correct after adds + ranks; membrane-scoped.
- Run `ruff check` + `pytest` before every push (per repo CI gate).

**Mobile (`constructo/mobile`):**
- Unit tests live in `src/`, **never** `app/` (Expo Router evaluates every `app/` module at
  startup — a `describe()` there crashes the app). Test the upload/util helpers in `src/`.
- `npm run build` (tsc -b) — NOT just lint — is the real gate (CI/Vercel parity).

**Manual test-first sequence (the order we build in):**
1. **Layer 1 only**, then verify live: homeowner → area → Upload a photo → it appears in grid +
   ranking → rank it → counters move. Don't proceed until green.
2. **Layer 2**: paste a real pin link → image appears → rank.
3. **Layer 3**: seed presets → add from a pack → rank.

## 9. Phasing / decomposition (independently shippable)
- **Phase 1 — Core loop:** §4.1, §4.2, §4.5, §5.1, §5.2, §5.5, §5.6 (+ vision-URL fix). The
  foundation; everything else rides on the display path it establishes.
- **Phase 2 — Pinterest:** §4.3, §5.3.
- **Phase 3 — Presets:** §4.4, §5.4, seed script.

Each phase = its own implementation plan, its own branch/PR, verified before the next.

## 10. Risks & open questions
- **Pinterest fragility:** og:image scraping can break if Pinterest changes markup; isolated to
  one resolver + clearly labeled. Acceptable for v1; OAuth path is forward-compatible.
- **Contributor existence:** the homeowner must have a `profiler_contributors` row for
  `my_contributor_id` (→ `canRank`). Verify the seed/profile-create path creates one; if not,
  add it (a profile's owner should auto-become a decision-owner contributor). **Confirm during
  Phase 1.**
- **Presign CORS:** R2 must allow the app's PUT `Content-Type`. The chat flow already works in
  prod, so reuse its bucket/CORS; local dev uses the multipart fallback.
- **Image orientation/size:** downscale on upload (`expo-image-picker` quality 0.8) to keep R2
  objects small and vision fast.

## 11. Verification gotchas (from prior pilot work)
- Web: verify with `npm run build` (tsc -b), not `npm run lint`.
- Mobile tests: under `src/`, never `app/`.
- Backend tests: a stray `constructo_test` orphan table can break pytest; run `ruff` + `pytest`.
