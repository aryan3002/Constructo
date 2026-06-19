# W5 Slice 1 — Reports + PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/reports` screen with a server-side PDF pipeline that generates two branded, evidence-anchored PDFs (DPR pack + Site progress) and surfaces the existing Tally CSV export, all tracking-only and deterministic.

**Architecture:** New backend `app/reports/` module = `builders.py` (assemble deterministic dicts from existing DPR/dashboard/financials data — no new math) → `pdf.py` + Jinja2 HTML templates → WeasyPrint renders branded PDF bytes → `router.py` streams `application/pdf` and writes an append-only `report_exports` audit row. New frontend `features/reports/` lazy route reuses the existing OTP step-up flow for the CSV row.

**Tech Stack:** FastAPI, async SQLAlchemy, Alembic, WeasyPrint + Jinja2 (new), Postgres/pgvector; React 18, Vite, TanStack Query, vitest.

**Verification commands (exact):**
- Backend (run from `constructo/backend`): `uv run ruff check` · `uv run pytest -q`
- Web (run from `constructo/web`): `npm run build` · `npm test` · `npm run lint` (tsc --noEmit; **there is no `typecheck` script**) · `npm run budget`
- Migration round-trip: against a throwaway `pgvector/pgvector:pg16` Docker postgres (plain postgres fails — chain needs `CREATE EXTENSION vector`).

**Key reused interfaces (verified 2026-06-14):**
- Step-up dep: `Depends(require_step_up)` (`app/auth/deps.py:69`), header `X-Step-Up-Token`; verify `POST /api/v1/auth/step-up/verify {otp} → {step_up_token, expires_in}`; missing → `403 {"error":{"code":"step_up_required"}}`.
- Tally CSV: `GET /api/v1/reconcile/export/tally?site_id=&window_days=` (`reconcile/router.py:617`), gated by `require_step_up` + site-scope.
- DPR sections dict shape (`app/dpr/draft.py:219`): keys `labor, materials, work_done, blockers, next, summary` (see Task 3 for full shape).
- Dashboard home: `GET /api/v1/dashboard/home?date=` → `HomeOut.sites[] : SiteCardOut{site_id,name,status,expected_headcount,top_risks[],pulse[PulseTileOut{kind,status,value,facts}]}` (`app/dashboard/schemas.py`).
- Financials: `GET /api/v1/payments/financials/{site_id}` → `{quotation,billed,received,outstanding,currency}` (`app/payments/schemas.py:82`).
- Role gate: `Depends(require_role(UserRole.owner, UserRole.accountant, ...))` (`app/auth/deps.py:39`).
- Module template: `app/vendors/` (`__init__.py`, `router.py`, `schemas.py`); router mounted in `app/main.py:108-148`.
- Frontend: lazy route in `App.tsx:36` wrapped in `<Guarded>`; nav in `ui/AppShell.tsx` `ROLE_TABS` (per-role arrays); `StepUpRequiredError` in `api/errors.ts:11`; `authApi.stepUpVerify(otp)→{token,expiresIn}` (`api/auth.ts:252`); OTP UI state machine in `features/reconcile/TallyExportButton.tsx:24`; `qk` in `api/queryKeys.ts:10`; states in `components/states` (`Spinner,ErrorState,EmptyState`); `useT()` from `i18n`; caps in `auth/permissions.ts` (`export_tally`); `useCan`/`useMeRole` in `auth/useCan.ts`.

---

## File Structure

**Backend (create):**
- `app/reports/__init__.py`
- `app/reports/builders.py` — `build_dpr_pack(...)`, `build_progress(...)` → plain dicts.
- `app/reports/pdf.py` — `render(template_name, data) -> bytes` (WeasyPrint).
- `app/reports/templates/base.html`, `dpr_pack.html`, `progress.html` — branded Jinja2.
- `app/reports/router.py` — `/api/v1/reports/*` endpoints + audit write.
- `app/models/report_export.py` — `ReportExport` append-only audit model.
- `app/migrations/versions/<rev>_report_exports.py` — alembic migration.
- `tests/test_reports_builders.py`, `tests/test_reports_pdf.py`, `tests/test_reports_api.py`

**Backend (modify):**
- `pyproject.toml` — add `weasyprint`, `jinja2`.
- `Dockerfile` — system libs before `uv sync`.
- `.github/workflows/ci.yml` — system libs in the backend test job.
- `app/main.py` — mount `reports_router`.
- `app/models/__init__.py` — register `ReportExport`.

**Frontend (create):**
- `src/api/reports.ts` — `reportsApi` (PDF blobs) + mock branch.
- `src/features/reports/ReportsPage.tsx` — the screen.
- `src/features/reports/templates.ts` — the 4 template definitions.
- `src/features/reports/__tests__/ReportsPage.test.tsx`, `src/api/__tests__/reports.test.ts`

**Frontend (modify):**
- `src/api/queryKeys.ts` — `qk.reports`.
- `src/App.tsx` — lazy `/reports` route.
- `src/ui/AppShell.tsx` — `/reports` nav tab for owner/accountant/pm.
- `src/i18n/en.ts` + `src/i18n/hi.ts` — `reports.*` + `nav.reports` keys (parity).

---

## Task 1: Backend PDF deps + smoke test

**Files:**
- Modify: `constructo/backend/pyproject.toml`
- Modify: `constructo/backend/Dockerfile`
- Modify: `.github/workflows/ci.yml`
- Test: `constructo/backend/tests/test_reports_pdf.py` (smoke part)

- [ ] **Step 1: Add deps.** In `pyproject.toml` `dependencies`, add `"weasyprint>=62"` and `"jinja2>=3.1"`. Run `cd constructo/backend && uv lock && uv sync`.

- [ ] **Step 2: Dockerfile system libs.** In `constructo/backend/Dockerfile`, immediately BEFORE the `RUN uv sync ...` line, insert:
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libcairo2 libffi8 \
    && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 3: CI system libs.** In `.github/workflows/ci.yml`, in the backend/pytest job, add a step BEFORE the pytest step:
```yaml
      - name: Install WeasyPrint system libs
        run: sudo apt-get update && sudo apt-get install -y --no-install-recommends libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 libcairo2 libffi8
```
(Read the file first to match the existing job name/indentation.)

- [ ] **Step 4: Write the failing smoke test.** `tests/test_reports_pdf.py`:
```python
def test_weasyprint_renders_minimal_pdf():
    from weasyprint import HTML
    pdf = HTML(string="<h1>hello</h1>").write_pdf()
    assert pdf[:5] == b"%PDF-"
    assert len(pdf) > 500
```

- [ ] **Step 5: Run it.** `cd constructo/backend && uv run pytest tests/test_reports_pdf.py::test_weasyprint_renders_minimal_pdf -v` → PASS (after `uv sync` + local system libs; if your local box lacks pango, install via brew: `brew install pango gdk-pixbuf libffi`).

- [ ] **Step 6: Commit.**
```bash
git add constructo/backend/pyproject.toml constructo/backend/uv.lock constructo/backend/Dockerfile .github/workflows/ci.yml constructo/backend/tests/test_reports_pdf.py
git commit -m "build(reports): add WeasyPrint+Jinja2 deps and PDF smoke test"
```

---

## Task 2: `report_exports` audit model + migration

**Files:**
- Create: `constructo/backend/app/models/report_export.py`
- Modify: `constructo/backend/app/models/__init__.py`
- Create: `constructo/backend/app/migrations/versions/<rev>_report_exports.py`
- Test: `constructo/backend/tests/test_reports_api.py` (model part)

- [ ] **Step 1: Write the model.** `app/models/report_export.py` (mirror an existing model e.g. `app/models/vendor.py` for Base/column idioms):
```python
from __future__ import annotations
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

class ReportExport(Base):
    __tablename__ = "report_exports"
    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), index=True, nullable=False)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    report_kind: Mapped[str] = mapped_column(String(40), nullable=False)   # dpr_pack|progress|tally
    fmt: Mapped[str] = mapped_column(String(10), nullable=False)            # pdf|csv
    scope: Mapped[str] = mapped_column(String(200), nullable=False)        # site_id or "all"
    date_range: Mapped[str] = mapped_column(String(60), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```
Confirm `Base` import path matches the other models (likely `from app.db import Base`).

- [ ] **Step 2: Register it.** Add `from app.models.report_export import ReportExport` to `app/models/__init__.py` and include `"ReportExport"` in `__all__` if present.

- [ ] **Step 3: Generate migration.** `cd constructo/backend && uv run alembic revision --autogenerate -m "report_exports"`. Open the generated file; verify it only `create_table("report_exports", ...)` + the `company_id` index, no unintended drops.

- [ ] **Step 4: Round-trip test the migration.**
```bash
docker run -d --rm --name pgtmp -e POSTGRES_PASSWORD=pw -p 55432:5432 pgvector/pgvector:pg16
# wait for ready, set DATABASE_URL to postgresql+asyncpg://postgres:pw@localhost:55432/postgres
uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head
docker stop pgtmp
```
Expected: all three succeed (up/down/up).

- [ ] **Step 5: Commit.**
```bash
git add constructo/backend/app/models/report_export.py constructo/backend/app/models/__init__.py constructo/backend/app/migrations/versions/
git commit -m "feat(reports): report_exports append-only audit model + migration"
```

---

## Task 3: Deterministic builders

**Files:**
- Create: `constructo/backend/app/reports/__init__.py` (empty)
- Create: `constructo/backend/app/reports/builders.py`
- Test: `constructo/backend/tests/test_reports_builders.py`

The builders MUST NOT compute domain numbers — they read what existing code already computed. Reuse: the DPR draft path (`app/dpr/draft.py` — find the function the DPR router's `GET /sites/{id}` / `draft` uses and call it), the dashboard home builder (`app/dashboard/` — the function behind `GET /dashboard/home`), and the financials loader (`app/payments/` — behind `GET /payments/financials/{site_id}`), plus the `Company` row for letterhead.

- [ ] **Step 1: Write the failing tests.** `tests/test_reports_builders.py` (use the repo's existing async session + seed fixtures; mirror `tests/test_dpr_*.py` setup):
```python
import pytest

@pytest.mark.asyncio
async def test_build_dpr_pack_shape(session, seeded_site, seeded_company):
    from app.reports.builders import build_dpr_pack
    data = await build_dpr_pack(session, site_id=seeded_site.id, on_date="2026-06-10")
    assert data["company"]["name"]
    assert data["site"]["name"] == seeded_site.name
    assert data["date"] == "2026-06-10"
    assert set(data["sections"]).issuperset({"labor", "materials", "work_done", "blockers", "summary"})

@pytest.mark.asyncio
async def test_build_progress_shape(session, seeded_site, seeded_company):
    from app.reports.builders import build_progress
    data = await build_progress(session, company_id=seeded_company.id, site_id=seeded_site.id,
                                date_from="2026-06-01", date_to="2026-06-10")
    assert data["company"]["name"]
    assert isinstance(data["sites"], list) and data["sites"]
    s0 = data["sites"][0]
    assert "name" in s0 and "stage" in s0 and "money" in s0  # money tracking-only
```

- [ ] **Step 2: Run → fail** (`ModuleNotFoundError: app.reports.builders`).

- [ ] **Step 3: Implement `builders.py`.** Assemble dicts; load the existing computed values. Skeleton (the subagent fills loader calls by reading the referenced files):
```python
from __future__ import annotations
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Company  # adjust to actual import

async def _company_dict(session: AsyncSession, company_id: UUID) -> dict:
    c = await session.get(Company, company_id)
    return {"name": c.name, "gstin": getattr(c, "gstin", None),
            "address": getattr(c, "address", None)}

async def build_dpr_pack(session: AsyncSession, site_id: UUID, on_date: str) -> dict:
    # Reuse the SAME draft logic the DPR router uses (app/dpr/draft.py). Do NOT re-extract.
    dpr = await _load_or_build_dpr(session, site_id, on_date)   # returns object w/ .sections, .site, .company_id, .status
    return {
        "company": await _company_dict(session, dpr.company_id),
        "site": {"name": dpr.site_name, "id": str(site_id)},
        "date": on_date,
        "status": dpr.status,
        "sections": dpr.sections,      # the labor/materials/work_done/blockers/next/summary dict, verbatim
    }

async def build_progress(session: AsyncSession, company_id: UUID, site_id: UUID | None,
                         date_from: str, date_to: str) -> dict:
    home = await _load_home_facts(session, company_id, date_to)   # the dashboard-home builder
    cards = [c for c in home.sites if site_id is None or str(c.site_id) == str(site_id)]
    sites = []
    for c in cards:
        progress = next((p for p in c.pulse if p.kind == "progress"), None)
        fin = await _load_financials(session, c.site_id)  # behind /payments/financials
        sites.append({
            "name": c.name, "status": c.status,
            "stage": (progress.facts if progress else {}),     # stage_index/stage_total/variance_days when present
            "expected_headcount": c.expected_headcount,
            "risks": [{"kind": r.kind, "severity": r.severity, "message": r.message} for r in c.top_risks],
            "money": {"quotation": str(fin.quotation), "billed": str(fin.billed),
                      "received": str(fin.received), "outstanding": str(fin.outstanding),
                      "currency": fin.currency},  # tracking-only
        })
    return {"company": await _company_dict(session, company_id),
            "range": {"from": date_from, "to": date_to}, "sites": sites}
```
Helper `_load_or_build_dpr`, `_load_home_facts`, `_load_financials` must call the existing functions (read `app/dpr/router.py`, `app/dashboard/router.py`, `app/payments/router.py` to find them). No number is recomputed here.

- [ ] **Step 4: Run → pass.** `uv run pytest tests/test_reports_builders.py -v`.

- [ ] **Step 5: Commit.** `git add app/reports/ tests/test_reports_builders.py && git commit -m "feat(reports): deterministic DPR-pack + progress builders"`

---

## Task 4: Branded PDF rendering

**Files:**
- Create: `constructo/backend/app/reports/templates/base.html`, `dpr_pack.html`, `progress.html`
- Create: `constructo/backend/app/reports/pdf.py`
- Test: `constructo/backend/tests/test_reports_pdf.py` (render part)

- [ ] **Step 1: Write the failing tests** (append to `test_reports_pdf.py`):
```python
def test_render_dpr_pack_returns_pdf():
    from app.reports.pdf import render
    data = {"company": {"name": "Acme Build", "gstin": None, "address": None},
            "site": {"name": "Sunrise Villa", "id": "x"}, "date": "2026-06-10", "status": "draft",
            "sections": {"labor": {"headcount": 30, "entries": []}, "materials": {"deliveries": []},
                         "work_done": {"items": []}, "blockers": {"items": []}, "next": {"items": []},
                         "summary": "Slab work progressed."}}
    pdf = render("dpr_pack.html", data)
    assert pdf[:5] == b"%PDF-" and len(pdf) > 800

def test_render_progress_returns_pdf():
    from app.reports.pdf import render
    data = {"company": {"name": "Acme", "gstin": None, "address": None},
            "range": {"from": "2026-06-01", "to": "2026-06-10"},
            "sites": [{"name": "Sunrise", "status": "active", "stage": {}, "expected_headcount": 25,
                       "risks": [], "money": {"quotation": "1200000", "billed": "800000",
                       "received": "600000", "outstanding": "200000", "currency": "INR"}}]}
    pdf = render("progress.html", data)
    assert pdf[:5] == b"%PDF-"
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement `pdf.py`.**
```python
from __future__ import annotations
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATES = Path(__file__).parent / "templates"
_env = Environment(loader=FileSystemLoader(str(_TEMPLATES)), autoescape=select_autoescape(["html"]))

def _inr(value) -> str:
    # Indian digit grouping, e.g. 1200000 -> 1,20,000
    try: n = int(round(float(value)))
    except (TypeError, ValueError): return "—"
    s = str(abs(n)); 
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        import re
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    return ("-" if n < 0 else "") + s

_env.filters["inr"] = _inr

def render(template_name: str, data: dict) -> bytes:
    from weasyprint import HTML  # lazy import so non-render code doesn't need system libs
    html = _env.get_template(template_name).render(**data)
    return HTML(string=html, base_url=str(_TEMPLATES)).write_pdf()
```

- [ ] **Step 4: Implement templates.** `base.html` — branded shell (warm canvas, ink text, marigold rule, mono numerals; letterhead block; footer with generated-at + "Tracking record — no payment is processed here." for money sections). `dpr_pack.html` and `progress.html` extend it. Minimal `base.html`:
```html
<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 18mm 16mm; }
body { font-family: 'Helvetica','Arial',sans-serif; color:#1B1916; }
.canvas { background:#F3EFE6; }
h1 { font-size: 20px; margin:0 0 2mm; }
.rule { height:2px; background:#F0A21F; margin:3mm 0; }
.muted { color:#7A7368; font-size:11px; }
.mono { font-variant-numeric: tabular-nums; font-family:'Courier New',monospace; }
table { width:100%; border-collapse:collapse; font-size:12px; }
td,th { text-align:left; padding:2mm 1mm; border-bottom:1px solid #E5DFD2; }
.foot { position: fixed; bottom: 0; font-size:10px; color:#7A7368; }
</style></head><body class="canvas">
  <div class="letterhead"><h1>{{ company.name }}</h1>
    <div class="muted">{% if company.gstin %}GSTIN {{ company.gstin }} · {% endif %}{{ company.address or '' }}</div>
  </div><div class="rule"></div>
  {% block content %}{% endblock %}
  <div class="foot">Generated by Constructo · {% block footnote %}{% endblock %}</div>
</body></html>
```
`dpr_pack.html`: `{% extends "base.html" %}{% block content %}` → site name + date + status badge + a section per `sections.labor/materials/work_done/blockers/next` (tables) + the `summary` prose. `progress.html`: range header + a card/table per site (name, status, stage if `stage.stage_index` present else "stages not set", headcount, risks, and a money row using `{{ s.money.received|inr }}` etc.) + the tracking-only footnote.

- [ ] **Step 5: Run → pass.** `uv run pytest tests/test_reports_pdf.py -v`.

- [ ] **Step 6: Commit.** `git add app/reports/pdf.py app/reports/templates/ tests/test_reports_pdf.py && git commit -m "feat(reports): branded WeasyPrint templates + render()"`

---

## Task 5: Reports router + audit + mount

**Files:**
- Create: `constructo/backend/app/reports/router.py`
- Modify: `constructo/backend/app/main.py`
- Test: `constructo/backend/tests/test_reports_api.py`

- [ ] **Step 1: Write failing API tests** (mirror `tests/test_dpr_*` client/auth fixtures):
```python
@pytest.mark.asyncio
async def test_dpr_pdf_owner_ok_and_audited(client, owner_token, seeded_site, session):
    r = await client.get(f"/api/v1/reports/dpr.pdf?site_id={seeded_site.id}&date=2026-06-10",
                         headers={"Authorization": f"Bearer {owner_token}"})
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"
    from sqlalchemy import select; from app.models import ReportExport
    rows = (await session.execute(select(ReportExport))).scalars().all()
    assert any(x.report_kind == "dpr_pack" for x in rows)

@pytest.mark.asyncio
async def test_progress_pdf_forbidden_for_supervisor(client, supervisor_token, seeded_site):
    r = await client.get(f"/api/v1/reports/progress.pdf?site_id={seeded_site.id}&date_from=2026-06-01&date_to=2026-06-10",
                         headers={"Authorization": f"Bearer {supervisor_token}"})
    assert r.status_code == 403
```

- [ ] **Step 2: Run → fail** (404, route not mounted).

- [ ] **Step 3: Implement `router.py`.**
```python
from __future__ import annotations
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.auth.deps import get_current_user, require_role
from app.db import get_session
from app.models import User, UserRole, ReportExport
from app.reports import builders, pdf

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

async def _audit(session, *, company_id, actor, kind, fmt, scope, date_range):
    session.add(ReportExport(company_id=company_id, actor_user_id=actor,
                             report_kind=kind, fmt=fmt, scope=scope, date_range=date_range))
    await session.commit()

@router.get("/dpr.pdf")
async def dpr_pdf(site_id: UUID, date: str,
                  user: User = Depends(require_role(UserRole.owner, UserRole.accountant, UserRole.pm)),
                  session: AsyncSession = Depends(get_session)) -> Response:
    # site-scope check: reuse effective_visible_site_ids / _require_site_in_scope pattern from dpr/reconcile
    data = await builders.build_dpr_pack(session, site_id=site_id, on_date=date)
    bytes_ = pdf.render("dpr_pack.html", data)
    await _audit(session, company_id=user.company_id, actor=user.id, kind="dpr_pack",
                 fmt="pdf", scope=str(site_id), date_range=date)
    return Response(content=bytes_, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="dpr-{site_id}-{date}.pdf"'})

@router.get("/progress.pdf")
async def progress_pdf(date_from: str, date_to: str, site_id: UUID | None = Query(default=None),
                       user: User = Depends(require_role(UserRole.owner, UserRole.accountant)),
                       session: AsyncSession = Depends(get_session)) -> Response:
    data = await builders.build_progress(session, company_id=user.company_id, site_id=site_id,
                                         date_from=date_from, date_to=date_to)
    bytes_ = pdf.render("progress.html", data)
    await _audit(session, company_id=user.company_id, actor=user.id, kind="progress",
                 fmt="pdf", scope=str(site_id or "all"), date_range=f"{date_from}..{date_to}")
    return Response(content=bytes_, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="progress.pdf"'})
```
Add the site-in-scope guard for `dpr_pdf` (copy `_require_site_in_scope` usage from `app/dpr/router.py`) so a user can't export a site outside their company/visibility.

- [ ] **Step 4: Mount in `main.py`.** Add `from app.reports.router import router as reports_router` with the other imports and `app.include_router(reports_router)` (NOT inside the `enable_labs` block — reports is core).

- [ ] **Step 5: Run → pass.** `uv run pytest tests/test_reports_api.py -v` then `uv run ruff check`.

- [ ] **Step 6: Commit.** `git add app/reports/router.py app/main.py tests/test_reports_api.py && git commit -m "feat(reports): /api/v1/reports PDF endpoints + export audit"`

---

## Task 6: Frontend reports API client

**Files:**
- Create: `constructo/web/src/api/reports.ts`
- Modify: `constructo/web/src/api/queryKeys.ts`
- Test: `constructo/web/src/api/__tests__/reports.test.ts`

- [ ] **Step 1: Add `qk.reports`.** In `api/queryKeys.ts` `qk` object: `reports: () => ['reports'] as const,`.

- [ ] **Step 2: Write failing test.** `api/__tests__/reports.test.ts` (mock `fetch`, mirror existing api tests):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportsApi } from '../reports'

beforeEach(() => { localStorage.setItem('constructo.token', 'dev') })

describe('reportsApi', () => {
  it('dprPackPdf returns a Blob', async () => {
    const blob = new Blob([new Uint8Array([0x25,0x50,0x44,0x46])], { type: 'application/pdf' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(blob, { status: 200, headers: { 'Content-Type': 'application/pdf' } })))
    const out = await reportsApi.dprPackPdf('site-1', '2026-06-10')
    expect(out.type).toBe('application/pdf')
  })
})
```

- [ ] **Step 2b: Run → fail** (no module).

- [ ] **Step 3: Implement `api/reports.ts`.**
```ts
import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'
import { ApiError } from './client'

// 1x1 minimal valid PDF for mock mode
const MOCK_PDF = Uint8Array.from(atob(
  'JVBERi0xLjEKJcKlwrEKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCAyMDAgMjAwXT4+CmVuZG9iagp0cmFpbGVyPDwvUm9vdCAxIDAgUj4+Cg=='
), c => c.charCodeAt(0))

async function getPdf(path: string): Promise<Blob> {
  if (USE_MOCKS) return new Blob([MOCK_PDF], { type: 'application/pdf' })
  const headers = new Headers()
  const token = getToken(); if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { headers })
  if (!res.ok) throw new ApiError(res.status, res.statusText)
  return res.blob()
}

export const reportsApi = {
  dprPackPdf: (siteId: string, date: string) =>
    getPdf(`/api/v1/reports/dpr.pdf?site_id=${encodeURIComponent(siteId)}&date=${date}`),
  progressPdf: (siteId: string | null, from: string, to: string) =>
    getPdf(`/api/v1/reports/progress.pdf?${siteId ? `site_id=${encodeURIComponent(siteId)}&` : ''}date_from=${from}&date_to=${to}`),
}
```
(Confirm `getToken` is exported from `api/auth.ts`; if not, read the token via the same helper `client.ts` uses.)

- [ ] **Step 4: Run → pass.** `npm test -- reports`.

- [ ] **Step 5: Commit.** `git add src/api/reports.ts src/api/queryKeys.ts src/api/__tests__/reports.test.ts && git commit -m "feat(reports): web reports API client + mock"`

---

## Task 7: i18n keys + nav tab + route

**Files:**
- Modify: `src/i18n/en.ts`, `src/i18n/hi.ts`
- Modify: `src/ui/AppShell.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add i18n keys** to `en.ts` (flat dotted), then identical keys in `hi.ts` with Hindi values:
```
'nav.reports': 'Reports',
'reports.title': 'Reports & exports',
'reports.tpl.progress': 'Site progress', 'reports.tpl.dpr': 'DPR pack',
'reports.tpl.tally': 'Tally export', 'reports.tpl.payroll': 'Payroll',
'reports.scope.all': 'All sites', 'reports.range.label': 'Range',
'reports.generate': 'Generate', 'reports.download': 'Download', 'reports.preview': 'Preview',
'reports.payroll_soon': 'Coming soon', 'reports.empty': 'No data in range.',
'reports.generating': 'Generating…', 'reports.otp_required': 'Enter OTP to export',
```
hi.ts values e.g. `'nav.reports': 'रिपोर्ट'`, `'reports.title': 'रिपोर्ट और निर्यात'`, etc. (parity is required — every en key present in hi).

- [ ] **Step 2: Add nav tab.** In `ui/AppShell.tsx` `ROLE_TABS`, append to the `owner`, `accountant`, and `pm` arrays: `{ to: '/reports', labelKey: 'nav.reports', label: 'Reports', icon: <DocIcon /> }` (import `DocIcon` from `ui/icons` — verify it exists, else use `ListIcon`).

- [ ] **Step 3: Add route.** In `App.tsx`: `const ReportsPage = lazy(() => import('./features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })))` and inside `<Routes>`: `<Route path="/reports" element={<Guarded><ReportsPage /></Guarded>} />`.

- [ ] **Step 4: Verify build + lint.** `npm run build && npm run lint` → pass (ReportsPage stub may not exist yet — create a 1-line placeholder export to compile, replaced in Task 8, OR do Task 8 before building).

- [ ] **Step 5: Commit.** `git add src/i18n/ src/ui/AppShell.tsx src/App.tsx && git commit -m "feat(reports): nav tab, route, i18n (en+hi)"`

---

## Task 8: ReportsPage screen

**Files:**
- Create: `src/features/reports/templates.ts`
- Create: `src/features/reports/ReportsPage.tsx`
- Test: `src/features/reports/__tests__/ReportsPage.test.tsx`

- [ ] **Step 1: Template defs.** `templates.ts`:
```ts
export type TemplateId = 'progress' | 'dpr' | 'tally' | 'payroll'
export interface TemplateDef { id: TemplateId; labelKey: string; fmt: 'pdf' | 'csv'; needsSite: boolean; otp: boolean; enabled: boolean }
export const TEMPLATES: TemplateDef[] = [
  { id: 'progress', labelKey: 'reports.tpl.progress', fmt: 'pdf', needsSite: false, otp: false, enabled: true },
  { id: 'dpr',      labelKey: 'reports.tpl.dpr',      fmt: 'pdf', needsSite: true,  otp: false, enabled: true },
  { id: 'tally',    labelKey: 'reports.tpl.tally',    fmt: 'csv', needsSite: true,  otp: true,  enabled: true },
  { id: 'payroll',  labelKey: 'reports.tpl.payroll',  fmt: 'csv', needsSite: true,  otp: true,  enabled: false }, // slice 3
]
```

- [ ] **Step 2: Write failing test.** `__tests__/ReportsPage.test.tsx` (mirror `FinancialTracking`/reconcile tests: wrap in `QueryClientProvider` + i18n; mock `reportsApi`):
```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
// ...providers wrapper...
it('generates a DPR pack and offers download', async () => {
  vi.spyOn(reportsApi, 'dprPackPdf').mockResolvedValue(new Blob([new Uint8Array([37,80,68,70])], { type: 'application/pdf' }))
  renderWithProviders(<ReportsPage />)
  fireEvent.click(screen.getByText('DPR pack'))
  fireEvent.click(screen.getByText('Generate'))
  await waitFor(() => expect(screen.getByText('Download')).toBeInTheDocument())
})
it('payroll row is disabled (coming soon)', () => {
  renderWithProviders(<ReportsPage />)
  expect(screen.getByText('Payroll').closest('button')).toBeDisabled()
})
```

- [ ] **Step 2b: Run → fail.**

- [ ] **Step 3: Implement `ReportsPage.tsx`.** Build: `AppShell` wrapper (role from `useMeRole()`); left template list from `TEMPLATES` (disabled row for payroll, label via `useT`); a site selector (reuse the existing site-switcher/site query used by FinancialTracking) shown when `needsSite`; a date input (DPR) / range inputs (progress); a `Generate` button. On generate:
  - `progress`/`dpr` → call `reportsApi.*` → get Blob → `URL.createObjectURL` → set preview (`<iframe>`/`<object>`) + a `Download` link (`<a download>`); four-states (`Spinner` while generating, `ErrorState` on throw, `EmptyState` for none).
  - `tally` → mirror `TallyExportButton`'s OTP state machine (`reconcileApi.exportTally` → catch `StepUpRequiredError` → OTP input → `authApi.stepUpVerify` → retry → `downloadCsv`).
  Use only `qk`, `useT`, `components/states`, `lib/money`. No raw hex, no emoji icons. Loading uses a stage/time label, not a percent.

- [ ] **Step 4: Run → pass.** `npm test -- ReportsPage`.

- [ ] **Step 5: Build + budget.** `npm run build && npm run lint && npm run budget` → reports route lands in its own lazy chunk; entry stays under budget.

- [ ] **Step 6: Commit.** `git add src/features/reports/ && git commit -m "feat(reports): ReportsPage with PDF generate/preview + OTP Tally export"`

---

## Task 9: Verify + browser smoke

- [ ] **Step 1: Full backend gate.** `cd constructo/backend && uv run ruff check && uv run pytest -q` → all pass.
- [ ] **Step 2: Full web gate.** `cd constructo/web && npm run build && npm test && npm run lint && npm run budget` → all pass.
- [ ] **Step 3: Browser smoke (light + dark).** With backend up + a seeded owner (`+919810000001` / OTP `000000`), or with `VITE_USE_MOCKS=true`: open `/reports`, generate DPR pack (PDF previews + downloads), generate Site progress, then Tally export → blocked → OTP `000000` → CSV downloads. Repeat in dark mode. Capture a screenshot of each.
- [ ] **Step 4: Final commit / ready for PR.** Confirm branch `feat/web-w5-w6` is green; open PR when the user asks.

---

## Self-Review (completed)

- **Spec coverage:** §4.1 surface → Tasks 7,8. §4.2 backend module → Tasks 2–5. §4.3 WeasyPrint → Tasks 1,4. §4.4 frontend → Tasks 6–8. §4.5 data flow → Tasks 3,5,8. §4.6 testing → every task is TDD; Task 9 is the gate. Invariants: tracking-only footnote (Task 4), deterministic builders assert-no-recompute (Task 3), OTP on CSV only (Task 8), append-only audit (Tasks 2,5), en+hi parity (Task 7), no fake % (Task 4/8 loading copy). ✅
- **Placeholder scan:** no TBD/TODO; the only "coming soon" is the intentionally-disabled Payroll row (slice 3), honestly labelled with no dead control. ✅
- **Type/name consistency:** `reportsApi.dprPackPdf/progressPdf`, `render(template_name, data)`, `build_dpr_pack/build_progress`, `ReportExport`, `qk.reports`, `TemplateId/TemplateDef/TEMPLATES`, `StepUpRequiredError`, `authApi.stepUpVerify` used consistently across tasks. ✅
- **Known adaptation points flagged for the executor:** exact loader function names in `app/dpr/draft.py`, `app/dashboard/`, `app/payments/` (Task 3); `getToken` export location (Task 6); `DocIcon` existence (Task 7) — each task tells the subagent to read the referenced file and adapt.
