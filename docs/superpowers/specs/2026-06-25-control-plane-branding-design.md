# Control Plane: Branded Reports + Cleanup — Design

**Date:** 2026-06-25
**Status:** Draft for review
**Scope (user-approved):** (1) Company **logo → branded report PDFs** (logo only). (2) **Control-plane cleanup** — remove the stale Drawings tile, hide the empty "Soon" tiles, regroup sections into zones.

---

## Goal

Make the owner's generated reports carry their company logo, and make the Settings → Control plane feel finished (no dead "Soon" tiles, no redundant entries, grouped by purpose).

## Why

- **Branding:** Today the report letterhead renders the company *name as plain text* — no logo. A logo on every PDF (DPR + Progress) is a large perceived-quality jump for owners who share reports with homeowners, banks, and municipal inspectors. The company model has **no logo field today**; this adds one.
- **Cleanup:** Of 12 control-plane sections, 5 are empty/stale. "Drawings register" is now redundant (the real register is a sidebar item after #209). Empty "Soon" tiles read as unfinished — same reasoning as hiding Reconcile/Finance (#214).

## Non-goals (explicit)

- No letterhead footer line, "authorized signatory", accent color, or app-shell white-label (those were the "logo + extras" / "full brand kit" options — deferred).
- No new report *types*. Only the existing DPR + Progress reports get the logo.
- No SVG logo support in v1 (PNG/JPEG only — most reliable in WeasyPrint). SVG can come later.
- No build-out of the Integrations / Audit / Security sections — they are *hidden*, not built.

---

## Architecture overview

Two workstreams that meet at the **Company** section:

```
BRANDED REPORTS (backend-heavy)
  Company.logo_key (new nullable column + migration)
     ▲ set via                         │ read at report build
  POST /auth/company/logo/presign  ─►  R2 (branding/{company_id}/logo-{uuid}.{ext})
  PATCH /auth/company { logo_key }      │
                                        ▼
  reports/builders.py _load_company_dict → adds logo_url (presigned GET)
                                        ▼
  reports/templates/base.html letterhead → <img src=logo_url> above the name
                                        ▼
  Both DPR + Progress PDFs branded (no per-report change)

CONTROL-PLANE CLEANUP (web-only)
  AdminConsole SECTIONS registry → remove `documents`; drop `integrations`/`audit`/`security`
  (with restore comments); add `group` field; render the rail grouped by zone.
  CompanyProfile.tsx → add a Logo uploader + live letterhead preview.
```

**Deployment note:** the logo *upload UI* + cleanup ship via Vercel (web). The logo *appearing on PDFs* requires the **Azure backend** redeployed with the migration + endpoint + template change. Until then, the upload works and stores the key, but PDFs stay unbranded.

---

## Workstream 1 — Branded reports (logo only)

### 1.1 Data model
- Add `logo_key: str | None` (nullable) to `Company` (`app/models/company.py`) + an Alembic migration (additive, no backfill).
- `CompanyOut` gains `logo_url: str | None` (a **presigned GET** resolved from `logo_key` at serialize time, or `None`). `CompanyUpdateIn` gains optional `logo_key: str | None` (so the client can save or clear it).

### 1.2 Upload endpoint (reuse the R2 presign pattern)
- `POST /api/v1/auth/company/logo/presign` (owner-only, `require_role(owner)`). Body `{ filename, content_type }`. Validates `content_type ∈ {image/png, image/jpeg}` and a ≤2 MB hint. Returns `{ key, put_url, upload_mode }` exactly like `chat/media/presign` (`app/chat/router.py:902` is the reference). Key = `branding/{company_id}/logo-{uuid4}{ext}`.
  - `upload_mode='unavailable'` when local storage can't presign (mirrors the drawings flow) → UI shows an honest "upload not available here" note.
- Saving the key reuses the **existing** `PATCH /api/v1/auth/company` (now accepts `logo_key`). Clearing = `PATCH { logo_key: null }`.
- A unique key per upload avoids overwrite/caching races; the previous object is left as an orphan (acceptable; a cleanup job is out of scope).

### 1.3 Report injection
- `reports/builders.py` `_load_company_dict` (≈line 113): add `"logo_url": storage.url_for(company.logo_key) if company.logo_key else None`.
- `reports/templates/base.html` letterhead (≈line 186): above `.letterhead__name`, add
  ```html
  {% if company.logo_url %}
  <img class="letterhead__logo" src="{{ company.logo_url }}" alt="{{ company.name }}" />
  {% endif %}
  ```
  + CSS `.letterhead__logo { max-height: 48pt; max-width: 180pt; margin-bottom: 6pt; }`. WeasyPrint fetches the absolute presigned URL at render (its `base_url` is the templates dir, so `https://` URLs go over the network — confirmed `pdf.py:74`). Both templates extend `base.html`, so both reports brand at once.
  - **Robustness:** if WeasyPrint can't fetch the image (network/expired URL), the `<img>` renders empty/with alt text — the report still generates. The presigned GET TTL must comfortably exceed render time (use the default GET TTL already used for photos).

### 1.4 Web upload UI (in the Company section)
- `CompanyProfile.tsx` gains a **Logo** block (owner-only, gated by `manage_settings` like the rest of the form): current logo preview (or an empty dropzone), "Upload logo" (file input + drag-drop, reusing the `ChatComposer.processFile` presign→PUT→save shape), and "Remove". On success → `PATCH company { logo_key }` → invalidate the company query.
- A small **letterhead preview** card ("how your reports will look"): the logo + company name + GSTIN line, mirroring the PDF letterhead, so the owner sees the result without generating a PDF.
- Honest failures via the same `describeUploadError` discipline used for drawings (upload-side vs save-side messages); `upload_mode='unavailable'` → a calm note.

### 1.5 RBAC
- Read (`GET /auth/company` → `logo_url`): any authenticated member.
- Write (presign + `PATCH`): **owner only** (`require_role(owner)` server-side; `manage_settings` cap gates the UI). Matches the existing company-edit rules.

---

## Workstream 2 — Control-plane cleanup (web-only)

### 2.1 Section registry (`AdminConsole.tsx` SECTIONS)
- **Remove** `documents` (Drawings) — redundant with the sidebar register.
- **Remove (hide)** `integrations`, `audit`, `security` — empty stubs with no content. Leave a restore comment listing them (so re-adding when built is trivial). *Security in particular is the intended home for the auth/Phase-0 work — noted for later, not built now.*
- **Keep** `company`, `team`, `groups` (redirect to the real `/groups`), `baselines`, `vendors`, `materials`, `notifications`, `billing`.
- Rename the `company` section label to **"Company & branding"** (i18n `admin.section.company`, en+hi) since it now holds the logo.

### 2.2 Grouping
- Add an optional `group` field to each section and render the section rail with small group subheadings:
  ```
  Company & brand →  company
  People          →  team
  Site setup      →  baselines · vendors · materials
  Comms           →  groups · notifications
  Account         →  billing
  ```
- Sections without a `group` render ungrouped (forward-compatible). Group labels are i18n keys (`admin.group.*`, en+hi). The active-section selection, deep-link `?section=`, and keyboard behavior are unchanged — only visual grouping is added.

---

## Testing

- **Backend:** migration applies + downgrades; `GET /auth/company` returns `logo_url=None` when unset and a presigned URL when set; presign endpoint validates content-type + owner-only (401/403 paths); `PATCH` saves + clears `logo_key`; a builder test asserting `_load_company_dict` includes `logo_url`; a render test asserting the `<img>` appears in the HTML when `logo_url` is set and is absent when not.
- **Web:** CompanyProfile renders the uploader for owner and hides it for non-owner; a successful upload calls presign→PUT→PATCH with the returned key; `upload_mode='unavailable'` shows the note; AdminConsole no longer lists `documents`/`integrations`/`audit`/`security`, still lists the kept sections, and renders the group subheadings; existing AdminConsole/section tests updated for the new registry.
- **Gate:** `tsc -b` · `vitest --retry=2` · `npm run build` (web); `ruff` + `pytest` (backend).

## Out-of-scope / follow-ups
Letterhead footer + signatory, accent color, app-shell white-label, SVG logos, orphan-logo cleanup, and building the Integrations/Audit/Security sections (Security = the auth/Phase-0 home).

## Risk / rollback
Backend changes are additive (nullable column, new endpoint, conditional template block) — safe. Rollback = revert the branch; the nullable column can stay harmlessly. Web cleanup is reversible via the restore comments. The logo only reaches PDFs after the Azure backend redeploy.
