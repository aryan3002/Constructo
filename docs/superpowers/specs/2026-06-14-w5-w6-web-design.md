# W5 + W6 — Contractor Web Console: Reports/PDF, Drawings & Docs, Polish

**Date:** 2026-06-14
**Branch:** `feat/web-w5-w6`
**Scope:** Everything remaining for the contractor web console (`constructo/web` + supporting `constructo/backend`) — the W5 feature surfaces (Reports/Exports + PDF, Drawings & Documents register, remaining exports + OCR) and the W6 hardening pass (accessibility, consistency, performance, four-state completeness, E2E).
**Status of design:** Slice 1 (Reports + PDF) approved by user 2026-06-14. Slices 2–6 approved in principle ("full approval on everything remaining for web"); each is detailed at roadmap depth here and gets its own implementation plan when reached.

---

## 1. Context

The console is a React 18 + Vite + TS + Tailwind SPA talking to a FastAPI + async SQLAlchemy + Postgres/pgvector backend. W0–W3 are shipped and smoke-proven; W4 admin is 7/12 sections. This program finishes the build.

Center of gravity is the product's existing thesis — an **evidence-anchored decision spine**, not a full construction ERP. The user's directive: **harden the spine + add PDF generation for specific high-value artifacts.** We are *not* adding schedule/Gantt, BOQ/estimation, procurement/PO, inventory, RFI, or commercial change-order modules in this program (separate scope decision, deferred).

### Key facts established by audit (2026-06-13/14)
- **No PDF tooling exists in the backend** — only `openpyxl` (xlsx). PDF generation is greenfield.
- **`PublishedDrawing`** model (`app/models/homeowner_drawings.py`) + `/api/v1/publish/drawings` already implement an **append-only, `supersedes_id`-versioned** drawing chain (homeowner-publish-scoped today). Reusable for the contractor register.
- **DPR** has a draft→send flow (`POST /dpr/sites/{id}/draft`, `/{id}/send`). The PDF is largely additive on top of existing DPR data.
- **Tally CSV** export already exists in reconcile (`/api/v1/reconcile/export/tally`), gated behind **OTP step-up** (`X-Step-Up-Token`). We surface it in `/reports`, not rebuild it.
- **OCR infra exists** (`app/extraction/ocr.py`, Azure + Sarvam providers) and is reusable for document text extraction.
- Deploy target is Azure Container Apps (Docker) + Neon Postgres + Cloudflare R2 (presigned media). Alembic chain is linear/single-head; every migration must round-trip on a `pgvector/pgvector:pg16` Docker postgres before merge.

---

## 2. Invariants (apply to every slice)

1. **Tracking-only.** Reports/exports render the ledger; they never move money. A "no money is moved here" line is explicit on financial PDFs.
2. **Deterministic numbers only.** Every figure in any export comes from an existing server-side reducer/endpoint. No new math in the report layer, never an LLM-derived number.
3. **No fake %.** Progress is stage + variance, never a fabricated percent. Generation progress UI is a time-bar/stages, never a spinner-percent.
4. **Evidence-anchored.** Figures are traceable to their source; PDFs cite the period/scope and carry an evidence footer.
5. **Append-only.** Drawing/document revisions set `supersedes_id`; nothing is overwritten or deleted. Every export is logged append-only.
6. **Authority server-side, surfaced as identity.** `exports.run` = owner + accountant (PM additionally for DPR pack). Shape the surface to the role; OTP step-up guards irreversible egress (CSV exports).
7. **Vernacular-first & accessible.** Full en + hi i18n on every new surface; WCAG 2.2 AA in both light and dark.

**Abort conditions (per W5/W6 DoD):** an export that runs without its required OTP step-up, or a publish that overwrites instead of extending the supersede chain, does not merge.

---

## 3. Program roadmap (6 slices)

### W5
- **Slice 1 — Reports + PDF** (detailed in §4): `/reports` screen, server-side PDF pipeline, DPR-pack PDF + Site-progress PDF, surface Tally CSV.
- **Slice 2 — Drawings & Documents register**: `/settings/documents`. Reuse/extend `PublishedDrawing` for contractor-scoped drawings; documents section (contracts/BOQ/permits/NOC/insurance) with expiry pills; upload→supersede flow; per-row version history reveal; filename/metadata search. **DoD:** upload a drawing → register; publish new version → old stays reachable (append-only); expiry warn/risk pills (colour + icon + word). Backend: extend publish model/endpoints to contractor scope + a lightweight `Document` concept (or generalize `PublishedDrawing` with a `kind`), expiry field, list/version endpoints; alembic migration round-tripped.
- **Slice 3 — Remaining exports + OCR**: Payroll CSV (attendance-derived, OTP-gated) · email delivery of generated reports (`POST /api/v1/reports/{id}/email` or send-on-generate) · **OCR full-text search** over the document register, reusing `app/extraction/ocr.py` to index uploaded docs into a searchable store (pgvector/embedding or full-text). **DoD:** search finds a document by its *contents*, not just filename; payroll CSV reproducible behind OTP; email send logged append-only. OCR may ship as its own sub-slice after register search lands.

### W6 (polish + spine-hardening consistency)
- **Slice 4 — Accessibility & consistency**: WCAG 2.2 AA audit + fixes in both modes (contrast, visible focus, ARIA roles/labels, keyboard reachability, screen-reader names). Fold in the audit's debts: i18n the two orphan screens (`SpecDesk`, Settings "Appearance"); remove emoji icons in `More.tsx` (use the SVG icon set, per AppShell's own rule); consolidate the `qk` query-key factory so `/auth/me` et al. share one cache (kill the `['me']` vs `['auth','me']` split via a shared `useMeRole()`); gate or remove the dead CRUD on read-only Payments/Permits; fix the procurement `"orders"` dead-landing (redirect to `/reconcile`, their real workhome, or build a minimal surface — redirect chosen unless told otherwise).
- **Slice 5 — Perf & four-state sweep**: verify virtualization/perf at real density (100s of rows, 60fps); audit every screen for the four-state contract (loading skeleton / honest empty / inline-retry error / data); keyboard parity across cockpit surfaces. Fix the uneven mock coverage (Permits/Search/Attendance/Mukadam have no `USE_MOCKS` branch) so the demo story is honest, and correct the README's overclaim.
- **Slice 6 — E2E**: Playwright suite covering the win-conditions — WC1 owner brief → ≤3 decisions; WC2 accountant reconcile (keyboard) → Tally export behind OTP; WC4 PM proposes & assigns, never approves money; plus RBAC landing journeys per role. Wire into CI.

---

## 4. Slice 1 detailed design — Reports + PDF

### 4.1 Surface
New lazy-loaded route **`/reports`** (own bundle chunk to protect the ≤250KB-gz budget; entry currently ~126KB). Visible to **owner + accountant** (`exports.run`); the **DPR-pack** template is additionally available to **PM**. Reachable from the AppShell shared nav ("Reports / Exports").

Layout (per vault `03 §9`): a template list (left) → scope/range controls → a preview pane (right) → Generate/Download. Four templates in slice 1:
1. **Weekly / Site progress** — scope (all-sites or single-site) · range (last 7d / month) · **PDF**
2. **DPR pack** — scope (single-site) · range (date / month) · **PDF**
3. **Tally export** — range (month) · **CSV** · OTP step-up (surfaced from existing reconcile endpoint)
4. *(Payroll CSV row visible but disabled "coming in slice 3", honestly labelled — no dead control)*

States: loading = time-bar + stage labels (not a %-spinner); empty = "No data in range."; error = inline retry. Full en + hi, light/dark.

### 4.2 Backend — new `app/reports/` module
- **`router.py`** → `/api/v1/reports/*`:
  - `GET /reports/progress.pdf?site_id=&from=&to=` → `StreamingResponse(media_type="application/pdf")`.
  - `GET /reports/dpr.pdf?site_id=&date=` → DPR-pack PDF.
  - Tally CSV stays at its existing reconcile route; the frontend calls it directly (OTP flow already built).
  - Role-gated via existing `require_*`/capability deps; same-company scoping via `effective_visible_site_ids`.
- **`builders.py`** → pure functions assembling a typed data dict per report from existing sources (DPR draft/sent data; `dashboard/home` facts; `reconcile`/`SiteFinancials`; `site_events`; attendance summary). **Asserts no number is recomputed here** — it reads what upstream already computed. Unit-testable in isolation.
- **`pdf.py`** + **`templates/*.html`** (Jinja2) → renders the data dict to a branded PDF.
- **`audit.py`** (or a row written inline) → append-only **export-audit record** (actor, company, report kind, scope, range, format, timestamp) on every generation. Doubles as the seed for the future Audit-log admin section. New table `report_exports` (alembic migration, round-tripped on pgvector Docker).

### 4.3 PDF engine — WeasyPrint (decision)
Server-side **WeasyPrint** (HTML/CSS → PDF) + **Jinja2** templates. Rationale: branded/warm output reusing CSS + design tokens + fonts with minimal layout code; server-side keeps numbers authoritative, reproducible, and OTP-gateable; matches the vault's "time-bar/stages" (a real server operation). Cost: system libs (pango/cairo/gdk-pixbuf) added to the backend Dockerfile — acceptable on Container Apps. Alternative on record: ReportLab (pure-pip, no system deps, clunkier layouts) if container deps prove painful. New deps: `weasyprint`, `jinja2` in `pyproject.toml`.

Branding: warm paper canvas, ink text, marigold accent, **mono numerals with Indian digit grouping (₹1,20,000)**, company letterhead (name/GSTIN/address from `Company`), report scope+range header, generated-at + actor footer, and on financial reports an explicit **"Tracking record — no payment is processed here."** No %-rings.

### 4.4 Frontend — new `features/reports/`
- `ReportsPage.tsx` (template rows → controls → preview → Generate/Download), `ReportRow`, scope/range controls reusing existing site-switcher + date primitives.
- `api/reports.ts` with `qk.reports(...)`; `VITE_USE_MOCKS` branch (so the demo renders offline); PDF fetched as a blob → object URL → download/preview.
- Reuse the existing **OTP step-up** flow (`StepUpRequiredError` → inline OTP → `authApi.stepUpVerify` → retry with `X-Step-Up-Token`) from `TallyExportButton` for the CSV row.
- i18n keys `reports.*` (en + hi, full parity), light/dark, four-state.

### 4.5 Data flow
User picks template + scope + range → Generate → (CSV: OTP gate if needed) → backend builder assembles deterministic dict → WeasyPrint renders branded PDF (or existing CSV) → streamed back → append-only export row written → client previews/downloads the blob.

### 4.6 Testing (TDD)
- Backend pytest: each builder returns the expected deterministic dict from fixture data; `pdf.render()` returns valid non-empty bytes starting `%PDF`; role-gating (non-owner/accountant → 403; PM allowed for DPR only); CSV path still demands OTP; `report_exports` row written per generation; migration up/down/up on pgvector Docker.
- Frontend vitest: template select → generate → download; OTP flow on CSV; four-states; mock branch renders offline; bundle-budget check (`npm run budget`).
- Real-browser smoke (light + dark): generate DPR PDF, generate progress PDF, Tally CSV blocked → OTP `000000` → downloads.

---

## 5. Execution model

Per slice: `writing-plans` → `subagent-driven-development` (independent backend + frontend tasks dispatched to subagents, integrated and reviewed by the lead) → verify (backend `uv run ruff check` + `pytest`; web `npm run build` + `npm test` + `npm run typecheck` + `npm run budget`; browser smoke) → commit on `feat/web-w5-w6`. Backend migrations branched off clean `origin/main`, round-tripped on pgvector Docker. Implementation plans copied into the Obsidian vault per project convention.

---

## 6. Risks & deferred

- **WeasyPrint container deps** — mitigated by Dockerfile install; ReportLab fallback documented.
- **Media-resolution for proof thumbnails** — still absent; proofs in PDFs degrade to an honest "proof attached" reference until that endpoint ships (does not block slice 1).
- **OCR search scale** — start with filename/metadata search; OCR indexing layered in slice 3, reusing existing OCR providers.
- **Deferred entirely (not this program):** schedule/Gantt, BOQ/estimation, procurement/PO, inventory, RFI, commercial change orders, the marketing-site↔console entry wiring, real-time SSE for the dashboard, and the security-for-public hardening (dev OTP/JWT/allowlist) — tracked separately.
