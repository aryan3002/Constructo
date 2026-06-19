# W5 Slice 2b — Documents-with-Expiry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Complete the `/settings/documents` screen with a **Documents** tab (alongside Drawings) for company records — contracts, BOQ, NOC, insurance, licenses — each with a file, an optional **expiry date**, and an **expiry status pill** (expired / expiring-soon / ok). Add-document via the same presign→PUT→create flow; editable + archivable (not append-only versioned like drawings).

**Architecture:** Net-new `CompanyDocument` model (company+optional-site scoped) + `/api/v1/documents` CRUD + a documents presign endpoint. Web `documents.ts` client + a tab on the existing `DocumentsPage`. Expiry pill reuses the Permits pattern (days-to-expiry → risk/warn).

**Tech Stack:** FastAPI, async SQLAlchemy, Alembic (one new migration), R2 presign; React, TanStack Query, vitest.

**Verification:** backend `uv run ruff check` + `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest -q` (run from `constructo/backend`); web `npm run build`+`npm test`+`npm run lint`+`npm run budget`.

**Verified facts:** Alembic head = **`0b0c4f2ad211`** (slice 2a added no migration; the new migration chains off this — confirm with `uv run alembic heads`). Storage `get_storage()` (`app/storage/__init__.py`), `url_for(key)` / `presigned_put(key, content_type)->{key,url}` (LocalStorage `presigned_put` raises `NotImplementedError`). `effective_visible_site_ids` `app/sites/router.py:62`. Permit expiry-pill logic `web/src/pages/permits/Permits.tsx:117` (days<0→risk "Expired N days ago"; days≤30→warn "Expires in N days"). Backend module template `app/vendors/`. Web admin form template `features/admin/Vendors.tsx` (RHF+Zod, archive-not-delete). DocumentsPage from slice 2a: `web/src/features/documents/DocumentsPage.tsx` (currently Drawings only). i18n flat dotted keys, en+hi parity compile-enforced. `qk` factory `web/src/api/queryKeys.ts`.

---

## File structure
**Backend create:** `app/models/company_document.py`, `app/documents/__init__.py`, `app/documents/router.py`, `app/documents/schemas.py`, migration. **modify:** `app/models/__init__.py`, `app/main.py`. **tests:** `tests/test_documents.py`.
**Frontend create:** `src/api/documents.ts`, tab/subcomponents in `src/features/documents/`. **modify:** `src/api/queryKeys.ts`, `src/features/documents/DocumentsPage.tsx`, `src/i18n/en.ts`+`hi.ts`. **tests:** `src/api/__tests__/documents.test.ts`, `src/features/documents/__tests__/DocumentsTab.test.tsx`.

---

## Task 1 (backend): CompanyDocument model + migration + CRUD + presign

**Files:** `app/models/company_document.py`, `app/models/__init__.py`, `app/documents/{__init__,router,schemas}.py`, migration, `app/main.py`, `tests/test_documents.py`.

- [ ] **Step 1 — model.** `CompanyDocument` (table `company_documents`): `id(UUID pk)`, `company_id(UUID, index, not null)`, `site_id(UUID FK sites.id, nullable)`, `doc_type(String(20), not null)` (values: contract/boq/noc/insurance/license/other), `title(String, not null)`, `file_url(String, not null)` (bare R2 key), `expiry_on(Date, nullable)`, `notes(Text, nullable)`, `is_active(bool, not null, server_default true)`, `created_by(UUID, nullable)`, `created_at(DateTime tz, server_default now())`. Mirror `app/models/vendor.py` idioms; `from app.db import Base`. Register in `app/models/__init__.py` (+`__all__`).
- [ ] **Step 2 — migration.** `uv run alembic revision --autogenerate -m "company_documents"`; verify it ONLY creates `company_documents` + the `company_id` index (strip any autogenerate drift). Round-trip up/down/up on `pgvector/pgvector:pg16` Docker (set `DATABASE_URL=postgresql+asyncpg://postgres:pw@localhost:55432/postgres`; `CREATE EXTENSION vector` if the first upgrade needs it).
- [ ] **Step 3 — failing tests** (`tests/test_documents.py`, real fixtures from conftest): owner POST a document → 201; GET `/api/v1/documents` lists it (company-scoped; a different-company user sees none); GET returns resolved `file_url` (mock `url_for`); PATCH updates `expiry_on`/`notes`; PATCH `is_active=false` archives (and archived excluded unless `?include_archived=true`); a supervisor/labor role is forbidden from POST (403); presign in-scope returns `{key,put_url,mode}`, `NotImplementedError`→`mode:"unavailable"` 200.
- [ ] **Step 4 — run → fail.**
- [ ] **Step 5 — implement** `app/documents/`:
  - `schemas.py`: `DocumentOut` (all fields + resolved `file_url`), `DocumentCreateIn{site_id?,doc_type,title,file_url,expiry_on?,notes?}`, `DocumentUpdateIn{title?,doc_type?,expiry_on?,notes?,is_active?}` (all optional), `DocPresignIn{filename,content_type,site_id?}`, `DocPresignOut{key,put_url:str|None,mode:Literal["presigned","unavailable"]}`.
  - `router.py` (prefix `/api/v1/documents`): `GET ""` (any company member; `company_id==user.company_id`; optional `site_id` filtered to `effective_visible_site_ids`; `include_archived` query; resolve `file_url` via `get_storage().url_for`); `POST ""` (gate `require_role(owner, pm, architect)`; if `site_id` given assert in scope; `created_by=user.id`, `commit()`); `PATCH "/{id}"` (same gate; cross-company→404; partial update; `commit()`); `POST "/presign"` (member; key `documents/{company_id}/{uuid4().hex}{ext}`; presigned_put with NotImplementedError fallback). Mount in `app/main.py` OUTSIDE `enable_labs`.
- [ ] **Step 6 — run → pass;** `uv run ruff check`.
- [ ] **Step 7 — commit** (`feat(documents): CompanyDocument model + /api/v1/documents CRUD + presign`).

## Task 2 (frontend): documents API client

**Files:** `src/api/documents.ts`, `src/api/queryKeys.ts`, `src/api/__tests__/documents.test.ts`.

- [ ] **Step 1** — `qk.companyDocuments: (includeArchived?: boolean) => ['company_documents', !!includeArchived] as const`.
- [ ] **Step 2 — failing tests** (mock fetch, `vi.stubEnv` USE_MOCKS=false): `listDocuments()` GET `/api/v1/documents`; `listDocuments({siteId,includeArchived})` adds query; `presign(...)` POST; `create(...)` POST; `update(id, patch)` PATCH.
- [ ] **Step 3 — implement** `src/api/documents.ts` mirroring `src/api/drawings.ts`: types `DocType`, `CompanyDocument`, `DocPresignTicket`; `listDocuments(opts?)`, `presign(filename, contentType, siteId?)`, `putToR2` (import from drawings or re-impl), `create(body)`, `update(id, patch)`. `USE_MOCKS` in-memory roster with 3 docs incl. one expired + one expiring-soon + one with no expiry; `create` appends; `update` mutates/archives.
- [ ] **Step 4 — run → pass.**
- [ ] **Step 5 — commit** (`feat(documents): web documents API client + mock + qk`).

## Task 3 (frontend): Documents tab on DocumentsPage

**Files:** `src/features/documents/DocumentsPage.tsx` (+ `DocumentsTab.tsx`, `AddDocument.tsx`), `src/i18n/en.ts`+`hi.ts`, `src/features/documents/__tests__/DocumentsTab.test.tsx`.

- [ ] **Step 1 — i18n** `documents.tab_drawings`, `documents.tab_documents`, `documents.doc_type.*` (contract/boq/noc/insurance/license/other), `documents.add_document`, `documents.expiry`, `documents.no_expiry`, `documents.expired_ago` (`{days}`), `documents.expires_in` (`{days}`), `documents.archive`, `documents.restore`, `documents.show_archived`, `documents.no_documents`, `documents.notes` — in BOTH en+hi.
- [ ] **Step 2 — failing tests** (`__tests__/DocumentsTab.test.tsx`; mock `documentsApi`, `useMeRole`→'owner', `useSites`): switching to the Documents tab lists docs with the right **expiry pill** (an `expiry_on` in the past → "Expired N days ago" risk pill; within 30 days → "Expires in N days" warn pill; null → no pill / "No expiry"); add-document (type+title+expiry+file) calls `presign`→`putToR2`→`create`; archive calls `update(id,{is_active:false})`; `mode:'unavailable'` shows the upload note and skips create.
- [ ] **Step 3 — run → fail.**
- [ ] **Step 4 — implement.** Add a tab switcher to `DocumentsPage` (Drawings | Documents) — keep the existing Drawings content as one tab; the Documents tab loads `qk.companyDocuments(includeArchived)`→`documentsApi.listDocuments`. Render a list: title · doc_type · site (or "Company") · an **expiry pill** computed exactly like `Permits.tsx` (`StatusPill status="risk"` expired / `"warn"` ≤30d / none otherwise) · an open link (`<a href={file_url}>`) · an Archive/Restore action (optimistic `update`). An **Add document** form (doc_type select + title + expiry date + optional notes + file) → presign→PUT→create→invalidate `qk.companyDocuments`; `mode:'unavailable'`→note. A **Show archived** toggle. Client-side search. Four-states. Gate to owner/pm/architect or `manage_settings`. No emoji, no hardcoded hex; copy via `useT`.
- [ ] **Step 5 — run → pass;** `npm run build && npm run lint && npm run budget`.
- [ ] **Step 6 — commit** (`feat(documents): Documents-with-expiry tab on /settings/documents`).

## Task 4: Verify slice 2b
- [ ] Backend full gate (from `constructo/backend`): `uv run ruff check` + `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run pytest -q`.
- [ ] Web full gate: `npm run build && npm test && npm run lint && npm run budget`.
- [ ] Trace: a contract with a past `expiry_on` shows a red "Expired" pill; one expiring in 10 days shows a warn pill; archive hides it unless Show-archived is on. Generate a sample (optional) and confirm the screen has both tabs.

## Notes
- Documents are editable + archivable (NOT append-only versioned) — that's the Permits/Vendors pattern, appropriate for renewable records (unlike drawings, which are append-only). No hard delete.
- Local dev can't presign-PUT → "upload unavailable" note; tested via mocks; works on R2 in deploy.
