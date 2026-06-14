# W5 Slice 2a — Drawings Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A contractor-facing **Drawings register** at `/settings/documents` that lists published drawings across the company's sites, shows the append-only **version history** (supersede chain) with the current revision marked, and lets an authorized user **upload a new revision** (which never overwrites — it extends the chain).

**Architecture:** Reuse the existing `PublishedDrawing` model + `/api/v1/publish/drawings` POST (append-only `supersedes_id`). Add (a) a company-wide register **list** endpoint that resolves the R2 key to a presigned URL and computes `is_current`, and (b) a **presign** endpoint for direct-to-R2 uploads. New web `features/documents/` register screen + an upload flow (presign → PUT → publish).

**Tech Stack:** FastAPI, async SQLAlchemy (no new model/migration in 2a), R2/S3 presigned URLs; React, TanStack Query, vitest.

**Verification:** backend `uv run ruff check` + `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest -q`; web `npm run build` + `npm test` + `npm run lint` + `npm run budget`. **There is NO `npm run typecheck`; use `npm run lint`.**

**Verified facts (recon 2026-06-14):**
- Alembic head is **`0b0c4f2ad211`** (NOT `f8a9b0c1d2e3` — that doesn't exist). 2a adds **no migration**.
- `PublishedDrawing` (`app/models/homeowner_drawings.py`, table `published_drawings`): `id, site_id(FK), title, version, file_url(bare R2 key), kind(DrawingKind enum: plan/elevation/section/structural/electrical/plumbing/other), published_by, published_at, plain_summary_en/hi, change_note, supersedes_id(self-FK)`. **No `company_id`** (scope via `site_id`→`sites.company_id`). **No `is_latest`** flag — current = rows not referenced by any other row's `supersedes_id`.
- Publish router `app/publish/router.py` (prefix `/api/v1/publish`): `POST /drawings` (201) + `GET /drawings?site_id=` (single-site, contractor-scoped via `_assert_site`→`effective_visible_site_ids`). `PublishDrawingIn` (schemas.py:68): `site_id, title, version, file_url, kind, change_note, plain_summary_en/hi, supersedes_id`. Supersede logic at router.py:530-543 validates prior on same site. `_drawing_out` returns `file_url` as the **bare key (unresolved)**.
- Storage `app/storage/base.py`: `url_for(ref) -> presigned GET | passthrough`; `presigned_put(key, content_type) -> {key,url,method,headers,expires_in}` (S3 impl in `s3.py`; **LocalStorage.presigned_put raises NotImplementedError** — handle gracefully).
- `effective_visible_site_ids(session, user)` from `app.sites.router:62`. Cross-site list pattern: `app/permits/router.py:111-144` (filter `company_id` + `site_id.in_(visible)`).
- Web: lazy routes in `App.tsx` wrapped `<Guarded>`; AdminConsole sections registry (`features/admin/AdminConsole.tsx:39`); admin template `features/admin/Vendors.tsx` (RHF+Zod + useQuery/useMutation + `qk`); expiry/status pill pattern `pages/permits/Permits.tsx:117`; `StatusPill` from `ui`; `qk` factory `api/queryKeys.ts`; `api/client.ts` `request`/`ApiError`; states `components/states`; `useT`; **no existing file-upload client — build it.** Follow the slice-1 review discipline (no emoji, no hardcoded hex, en+hi parity, four-states).

---

## File structure
**Backend (modify):** `app/publish/router.py` (+ register endpoint, presign endpoint), `app/publish/schemas.py` (+ `DrawingRegisterOut`, `DrawingPresignIn/Out`). **Tests:** `tests/test_publish_register.py`.
**Frontend (create):** `src/api/drawings.ts`, `src/features/documents/DocumentsPage.tsx`, `src/features/documents/DrawingRow.tsx` (if needed), `src/features/documents/UploadRevision.tsx`, tests under `src/features/documents/__tests__/` + `src/api/__tests__/drawings.test.ts`.
**Frontend (modify):** `src/api/queryKeys.ts`, `src/App.tsx`, `src/features/admin/AdminConsole.tsx` (link `documents` section), `src/i18n/en.ts` + `hi.ts`.

---

## Task 1 (backend): Register list endpoint + URL resolution

**Files:** `app/publish/router.py`, `app/publish/schemas.py`, `tests/test_publish_register.py`.

- [ ] **Step 1 — failing tests** (`tests/test_publish_register.py`; read `tests/test_publish_*.py`/conftest for fixtures): owner with 2 sites + drawings across both → `GET /api/v1/publish/drawings/register` returns rows from BOTH sites; a drawing with a superseding revision → the old row has `is_current=False`, the new `is_current=True`; a user from another company gets none of these sites' drawings; each row's `file_url` is a resolved URL (mock storage `url_for` to return `https://signed/...`).
- [ ] **Step 2 — run → fail.**
- [ ] **Step 3 — implement.** In `schemas.py` add `DrawingRegisterOut` = the drawing fields + `site_name: str`, `is_current: bool`, `file_url: str` (resolved). In `router.py` add:
  ```python
  @router.get("/drawings/register", response_model=list[DrawingRegisterOut])
  async def register(site_id: UUID | None = Query(default=None),
                     user: User = Depends(get_current_user),
                     session: AsyncSession = Depends(get_session)):
      visible = await effective_visible_site_ids(session, user)
      site_ids = [site_id] if site_id else visible
      if site_id and site_id not in visible:
          raise AppError(403, "forbidden", "Site not in scope")
      rows = (await session.execute(
          select(PublishedDrawing).where(PublishedDrawing.site_id.in_(site_ids))
          .order_by(PublishedDrawing.published_at.desc()))).scalars().all()
      superseded = {r.supersedes_id for r in rows if r.supersedes_id}
      site_names = await _site_name_map(session, site_ids)  # {site_id: name}
      return [DrawingRegisterOut(..., site_name=site_names.get(r.site_id, ""),
              is_current=(r.id not in superseded),
              file_url=storage.url_for(r.file_url) or r.file_url, ...) for r in rows]
  ```
  Use the project's storage accessor (read how `s3`/`url_for` is obtained elsewhere — e.g. `app.storage`). Don't change `_drawing_out` or the homeowner endpoint.
- [ ] **Step 4 — run → pass;** `uv run ruff check`.
- [ ] **Step 5 — commit** (`feat(drawings): company-wide register list with resolved URLs + is_current`).

## Task 2 (backend): Upload presign endpoint

**Files:** `app/publish/router.py`, `app/publish/schemas.py`, `tests/test_publish_register.py`.

- [ ] **Step 1 — failing test:** `POST /api/v1/publish/drawings/presign` with `{site_id, filename, content_type}` for an in-scope site returns `{key, put_url, mode}`; out-of-scope site → 403. Mock `presigned_put` to return a ticket; also a test that when storage raises `NotImplementedError` (local), the endpoint returns `mode="unavailable"` (not a 500).
- [ ] **Step 2 — run → fail.**
- [ ] **Step 3 — implement.** `DrawingPresignIn{site_id, filename, content_type}`, `DrawingPresignOut{key, put_url: str|None, mode: Literal["presigned","unavailable"]}`. Handler: `_assert_site`, build key `drawings/{site_id}/{uuid4}{ext-from-filename}`, try `storage.presigned_put(key, content_type)` → `mode="presigned"`; on `NotImplementedError` → `put_url=None, mode="unavailable"`. (Client decides whether upload is possible.)
- [ ] **Step 4 — run → pass;** ruff.
- [ ] **Step 5 — commit** (`feat(drawings): presign endpoint for direct-to-R2 revision upload`).

## Task 3 (frontend): drawings API client

**Files:** `src/api/drawings.ts`, `src/api/queryKeys.ts`, `src/api/__tests__/drawings.test.ts`.

- [ ] **Step 1** — `qk.drawings: (siteId?: string) => siteId ? ['drawings', siteId] as const : ['drawings'] as const`.
- [ ] **Step 2 — failing test** (mock fetch): `drawingsApi.listRegister()` returns parsed rows; `presign(...)` returns the ticket; `publish(...)` POSTs the right body. (Mirror `api/__tests__/reports.test.ts` style; force `USE_MOCKS=false` via `vi.stubEnv`.)
- [ ] **Step 3 — implement** `src/api/drawings.ts`: types `DrawingRegisterRow`, `PresignTicket`; `listRegister(siteId?)`, `presign(siteId, filename, contentType)`, `putToR2(url, file)` (a `fetch(url,{method:'PUT',headers:{'Content-Type':file.type},body:file})`), `publish({site_id,title,version,file_url,kind,change_note,supersedes_id})`. USE_MOCKS branch returning an in-memory roster (so the register renders offline; mock presign returns `mode:"unavailable"`). Reuse the bearer/`ApiError` pattern from `api/reports.ts`/`client.ts`.
- [ ] **Step 4 — run → pass.**
- [ ] **Step 5 — commit** (`feat(drawings): web drawings API client + mock + qk`).

## Task 4 (frontend): Documents/Drawings register screen + route + nav

**Files:** `src/features/documents/DocumentsPage.tsx` (+ small subcomponents), `src/App.tsx`, `src/features/admin/AdminConsole.tsx`, `src/i18n/en.ts`+`hi.ts`, tests under `src/features/documents/__tests__/`.

- [ ] **Step 1 — i18n** `documents.*` + `nav.documents` keys in BOTH en+hi (title, drawings_tab, upload, new_revision, version, current, superseded, show_versions, change_note, no_drawings, upload_unavailable, search_placeholder, generating/uploading, etc.).
- [ ] **Step 2 — failing tests** (`__tests__/DocumentsPage.test.tsx`, providers like reports tests; mock `drawingsApi`, `useMeRole`→'owner', `useSites`): renders the register grouped so a drawing with 2 versions shows ONE current row + a "Show versions" reveal listing both; the superseded version is labelled superseded; selecting a file + clicking "Upload new revision" calls `presign`→`putToR2`→`publish` with the prior row's id as `supersedes_id`; when presign returns `mode:"unavailable"`, the UI shows an honest "upload not available in this environment" note instead of failing.
- [ ] **Step 3 — implement** `DocumentsPage` at route `/settings/documents` inside `<AppShell role={useMeRole() ?? 'owner'} ...>`: 
  - Load `drawingsApi.listRegister()`; **group by supersede chain** (a drawing = its current row + the chain of `supersedes_id` ancestors) — current rows (`is_current`) are the list; each has a `Show versions ▾` reveal showing the chain newest→oldest with `published_at` + `version` + `change_note`, every version a working link (`<a href={file_url}>`). NEVER a delete/overwrite affordance (append-only).
  - Upload-new-revision: a file `<input type="file">` + version + change_note; on submit → `presign(site, file.name, file.type)`; if `mode==="presigned"` → `putToR2(put_url, file)` → `publish({..., file_url: key, supersedes_id: currentRow.id})` → invalidate `qk.drawings()`; if `mode==="unavailable"` → show the honest note (`documents.upload_unavailable`). A first-upload (no prior) omits `supersedes_id`.
  - Client-side **search** filter over title/site/version. Four-states (loading/empty "No drawings"/error/data). `StatusPill` for current/superseded. No emoji, no hardcoded hex.
  - Gate the screen by `useCan('manage_settings')` OR site-visibility (owner/pm/architect). 
- [ ] **Step 4 — route + nav:** lazy `/settings/documents` route in `App.tsx` (`<Guarded>`); in `AdminConsole.tsx` SECTIONS add `{ key: 'documents', labelKey: 'admin.section.documents', link: '/settings/documents' }` so the control-plane IA shows it (link pattern, like `groups`).
- [ ] **Step 5 — run tests → pass;** `npm run build && npm run lint && npm run budget` (documents lazy chunk; entry under budget).
- [ ] **Step 6 — commit** (`feat(drawings): /settings/documents register — version history + revision upload`).

## Task 5: Verify slice 2a
- [ ] Backend full gate: `uv run ruff check` + `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest -q` → all pass.
- [ ] Web full gate: `npm run build && npm test && npm run lint && npm run budget` → all pass.
- [ ] Manual trace: a drawing with v1→v2→v3 shows ONE current row (v3) with both older versions reachable under "Show versions"; uploading v4 marks v3 superseded and v4 current; no version is ever deleted/overwritten (append-only DoD).

---

## Notes / deferred
- **2b (next plan):** Documents-with-expiry (contracts/BOQ/NOC/insurance) — net-new `company_documents` table (`doc_type`, `expiry_on`, `file_url`, company+site scope) + expiry pills; the `/settings/documents` screen gets a second "Documents" tab alongside "Drawings".
- **OCR/full-text search** (slice 3): start with the client-side filename/metadata search built here; OCR indexing layered later.
- Local dev can't presign-PUT (LocalStorage raises NotImplementedError) → the UI degrades to an honest "upload unavailable" note; upload is exercised via mocks in tests and works against R2 in deploy.
