# Control Plane: Branded Reports + Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner upload a company logo that brands every generated report PDF, and clean up the Settings → Control plane (remove the stale Drawings tile, hide the empty "Soon" tiles, group sections).

**Architecture:** Additive `Company.logo_key` (R2 key) set via a presign-upload endpoint that mirrors the chat-media flow; the report builder resolves it to a presigned GET URL and the shared letterhead template renders an `<img>`. The web Company section gets a logo uploader + letterhead preview, and the AdminConsole section registry is pruned + grouped.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (Mapped) + Alembic + Pydantic v2 + WeasyPrint/Jinja2 (backend); React + TanStack Query + RHF/Zod + Tailwind semantic tokens (web).

## Global Constraints

- **Branding scope = logo only.** No footer line, signatory, accent color, or app white-label. PNG/JPEG only (no SVG in v1).
- **Additive + reversible.** New column is nullable; new endpoint + template block are additive. No existing endpoint signature changes except adding optional fields.
- **Owner-only writes.** Logo presign + company PATCH require `require_role(UserRole.owner)` (backend) / `manage_settings` cap (web). Reads (`logo_url`) are any authenticated member.
- **Reuse, don't reinvent.** Mirror the chat-media presign (`app/chat/router.py:902`, `ChatComposer.processFile` `src/features/chat/ChatComposer.tsx:241`) and the existing `Storage` protocol (`presigned_put` / `url_for`).
- **i18n parity:** every new key in BOTH `src/i18n/en.ts` and `src/i18n/hi.ts`.
- **Semantic tokens only** in web UI (works neev light + dark; no hardcoded hex). No emoji.
- **Deployment caveat:** the logo reaches PDFs only after the **Azure backend** is redeployed (PDFs render server-side). The web upload UI + cleanup deploy via Vercel.
- **Gate:** web `npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build` (from `constructo/web`); backend `uv run ruff check . && uv run pytest` (from `constructo/backend`).

## File Structure

**Backend**
- Modify `constructo/backend/app/models/company.py` — add `logo_key` column.
- Create `constructo/backend/alembic/versions/<id>_company_logo_key.py` — additive migration.
- Modify `constructo/backend/app/auth/router.py` — `CompanyOut.logo_url`, `CompanyUpdateIn.logo_key`, a `_company_out()` helper, and the `POST /company/logo/presign` endpoint.
- Modify `constructo/backend/app/reports/builders.py` — `_load_company_dict` resolves `logo_url`.
- Modify `constructo/backend/app/reports/templates/base.html` — letterhead `<img>` + `.letterhead__logo` CSS.
- Tests: `constructo/backend/tests/test_company_logo.py` (new), extend a reports render test.

**Web**
- Modify `constructo/web/src/api/auth.ts` — `Company.logo_url`, `CompanyUpdate.logo_key`, `authApi.presignCompanyLogo()`.
- Modify `constructo/web/src/features/admin/CompanyProfile.tsx` — logo block + letterhead preview.
- Modify `constructo/web/src/features/admin/AdminConsole.tsx` — prune + group `SECTIONS`.
- Modify `constructo/web/src/i18n/en.ts` + `hi.ts` — logo + group keys, rename company label.
- Tests: extend `CompanyProfile` + `AdminConsole` test files.

---

### Task 1: Backend — `Company.logo_key` + migration + schema

**Files:**
- Modify: `constructo/backend/app/models/company.py`
- Create: `constructo/backend/alembic/versions/<id>_company_logo_key.py`
- Modify: `constructo/backend/app/auth/router.py` (CompanyOut, CompanyUpdateIn, GET/PATCH handlers)
- Test: `constructo/backend/tests/test_company_logo.py`

**Interfaces:**
- Produces: `Company.logo_key: str | None`; `CompanyOut.logo_url: str | None` (a presigned GET resolved from `logo_key`, else None); `CompanyUpdateIn.logo_key: str | None`; helper `_company_out(company, storage) -> CompanyOut`.

- [ ] **Step 1: Add the column** to `app/models/company.py` after `currency` (line 23):
```python
    logo_key: Mapped[str | None] = mapped_column(String, nullable=True)
```

- [ ] **Step 2: Write the migration.** Find the current head: `cd constructo/backend && uv run alembic heads` → use that id as `down_revision`. Create `alembic/versions/c1d2e3f4a5b6_company_logo_key.py` (pick any unique 12-hex `revision`):
```python
"""company logo_key

Revision ID: c1d2e3f4a5b6
Revises: <CURRENT_HEAD_ID>
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "<CURRENT_HEAD_ID>"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("companies")}
    if "logo_key" not in cols:
        op.add_column("companies", sa.Column("logo_key", sa.String(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)
    cols = {c["name"] for c in insp.get_columns("companies")}
    if "logo_key" in cols:
        op.drop_column("companies", "logo_key")
```
(Idempotent guard mirrors `alembic/versions/b5667a6814f3_decision_spec_link.py`.)

- [ ] **Step 3: Schema + handler changes** in `app/auth/router.py`. Add to `CompanyOut` (after `currency`, ~line 95):
```python
    logo_url: str | None = None
```
Add to `CompanyUpdateIn` (after `currency`, ~line 84):
```python
    logo_key: str | None = None
```
Add a helper near the schemas (so GET + PATCH share it). It needs storage — import `from app.storage import get_storage` at the top of the file if not present:
```python
def _company_out(company: Company) -> CompanyOut:
    out = CompanyOut.model_validate(company)
    out.logo_url = get_storage().url_for(company.logo_key)
    return out
```
Replace the two `return CompanyOut.model_validate(company)` lines (GET handler ~line 224, PATCH handler ~line 243) with `return _company_out(company)`.

- [ ] **Step 4: Write the failing test** `constructo/backend/tests/test_company_logo.py`. Use the existing async client + owner-auth fixtures from `tests/conftest.py` (mirror the auth setup in `tests/test_publish_register.py`). Monkeypatch storage so `url_for` is deterministic:
```python
import pytest
from app.storage import get_storage

@pytest.mark.asyncio
async def test_company_out_includes_logo_url(client, owner_headers, monkeypatch):
    # Storage resolves a bare key to a presigned GET URL.
    monkeypatch.setattr(type(get_storage()), "url_for",
                        lambda self, ref: f"https://r2.example/{ref}" if ref else None)
    # Unset → logo_url is null
    r = await client.get("/api/v1/auth/company", headers=owner_headers)
    assert r.status_code == 200
    assert r.json()["logo_url"] is None
    # Set the key via PATCH → logo_url resolves
    r = await client.patch("/api/v1/auth/company", headers=owner_headers,
                           json={"logo_key": "branding/x/logo-abc.png"})
    assert r.status_code == 200
    assert r.json()["logo_url"] == "https://r2.example/branding/x/logo-abc.png"
    # Clear it
    r = await client.patch("/api/v1/auth/company", headers=owner_headers,
                           json={"logo_key": None})
    assert r.json()["logo_url"] is None
```

- [ ] **Step 5: Run migration + test.** `cd constructo/backend && uv run alembic upgrade head && uv run pytest tests/test_company_logo.py -v` → PASS. Then `uv run ruff check .`.

- [ ] **Step 6: Commit** `feat(backend): company logo_key + logo_url on CompanyOut`.

---

### Task 2: Backend — company-logo presign endpoint

**Files:**
- Modify: `constructo/backend/app/auth/router.py` (add the endpoint + its in/out models)
- Test: `constructo/backend/tests/test_company_logo.py` (extend)

**Interfaces:**
- Consumes: `get_storage()`, `require_role(UserRole.owner)` (already imported in this router).
- Produces: `POST /api/v1/auth/company/logo/presign` body `{content_type: str}` → `{key: str, put_url: str | None, upload_mode: "presigned" | "unavailable"}`. Key = `branding/{company_id}/logo-{uuid4().hex}.{ext}`.

- [ ] **Step 1: Add the models + handler** in `app/auth/router.py` (mirror `app/chat/router.py:902` presign). Ensure `from uuid import uuid4` and `from app.storage import get_storage` are imported:
```python
_LOGO_EXT = {"image/png": "png", "image/jpeg": "jpg"}


class LogoPresignIn(BaseModel):
    content_type: str


class LogoPresignOut(BaseModel):
    key: str
    put_url: str | None
    upload_mode: str  # "presigned" | "unavailable"


@router.post("/company/logo/presign", response_model=LogoPresignOut)
async def presign_company_logo(
    body: LogoPresignIn,
    owner: User = Depends(require_role(UserRole.owner)),
) -> LogoPresignOut:
    """Direct-to-R2 upload ticket for the company logo (owner-only). Local/dev
    storage has no presigned PUT (NotImplementedError) → upload_mode=unavailable;
    the UI shows an honest note (there is no multipart fallback for the logo)."""
    ext = _LOGO_EXT.get(body.content_type)
    if ext is None:
        raise AppError(422, "bad_type", "Logo must be a PNG or JPEG image")
    key = f"branding/{owner.company_id}/logo-{uuid4().hex}.{ext}"
    put_url: str | None = None
    try:
        ticket = get_storage().presigned_put(key, body.content_type)
        put_url = ticket["url"]
    except NotImplementedError:
        put_url = None
    return LogoPresignOut(
        key=key, put_url=put_url, upload_mode="presigned" if put_url else "unavailable"
    )
```

- [ ] **Step 2: Write the failing tests** (append to `tests/test_company_logo.py`):
```python
@pytest.mark.asyncio
async def test_logo_presign_owner_ok(client, owner_headers, monkeypatch):
    monkeypatch.setattr(type(get_storage()), "presigned_put",
                        lambda self, key, ct: {"key": key, "url": f"https://put/{key}",
                                               "method": "PUT", "headers": {}, "expires_in": 600})
    r = await client.post("/api/v1/auth/company/logo/presign",
                          headers=owner_headers, json={"content_type": "image/png"})
    assert r.status_code == 200
    body = r.json()
    assert body["upload_mode"] == "presigned"
    assert body["key"].startswith("branding/") and body["key"].endswith(".png")
    assert body["put_url"].startswith("https://put/")

@pytest.mark.asyncio
async def test_logo_presign_rejects_bad_type(client, owner_headers):
    r = await client.post("/api/v1/auth/company/logo/presign",
                          headers=owner_headers, json={"content_type": "image/gif"})
    assert r.status_code == 422

@pytest.mark.asyncio
async def test_logo_presign_unavailable_on_local(client, owner_headers, monkeypatch):
    def _raise(self, key, ct):
        raise NotImplementedError
    monkeypatch.setattr(type(get_storage()), "presigned_put", _raise)
    r = await client.post("/api/v1/auth/company/logo/presign",
                          headers=owner_headers, json={"content_type": "image/jpeg"})
    assert r.json()["upload_mode"] == "unavailable"
    assert r.json()["put_url"] is None

@pytest.mark.asyncio
async def test_logo_presign_non_owner_forbidden(client, member_headers):
    r = await client.post("/api/v1/auth/company/logo/presign",
                          headers=member_headers, json={"content_type": "image/png"})
    assert r.status_code in (401, 403)
```
(If a non-owner `member_headers` fixture doesn't exist, build a supervisor/accountant auth header the same way `owner_headers` is built in conftest.)

- [ ] **Step 3: Run** `uv run pytest tests/test_company_logo.py -v` → PASS. `uv run ruff check .`.

- [ ] **Step 4: Commit** `feat(backend): company logo presign endpoint (owner-only, PNG/JPEG)`.

---

### Task 3: Backend — logo on the report letterhead

**Files:**
- Modify: `constructo/backend/app/reports/builders.py` (`_load_company_dict`)
- Modify: `constructo/backend/app/reports/templates/base.html`
- Test: `constructo/backend/tests/test_reports_logo.py` (new, or extend an existing reports test)

**Interfaces:**
- Consumes: `Company.logo_key`, `get_storage().url_for()`.
- Produces: `_load_company_dict` result gains `"logo_url"`; `base.html` renders `<img class="letterhead__logo">` when `company.logo_url` is set.

- [ ] **Step 1: Resolve the logo URL** in `app/reports/builders.py`. Add `from app.storage import get_storage` at top. Change `_load_company_dict` (lines 113–121) to:
```python
async def _load_company_dict(session: AsyncSession, company_id: UUID) -> dict:
    company = await session.get(Company, company_id)
    if company is None:
        return {"name": "", "gstin": None, "address": None, "logo_url": None}
    return {
        "name": company.name,
        "gstin": company.gstin,
        "address": company.address,
        "logo_url": get_storage().url_for(company.logo_key),
    }
```

- [ ] **Step 2: Add the CSS** in `base.html` after `.letterhead__meta` (line 55):
```css
    .letterhead__logo {
      max-height: 48pt;
      max-width: 180pt;
      margin-bottom: 6pt;
    }
```

- [ ] **Step 3: Add the `<img>`** in the `.letterhead` block (line 187, immediately inside `<div class="letterhead">`, above `.letterhead__name`):
```html
  {% if company.logo_url %}
  <img class="letterhead__logo" src="{{ company.logo_url }}" alt="{{ company.name }}" />
  {% endif %}
```
(WeasyPrint fetches the absolute `https://` presigned URL at render — `base_url` in `pdf.py:74` only governs relative refs. If the fetch fails the `<img>` renders empty and the report still generates.)

- [ ] **Step 4: Write the failing test** `tests/test_reports_logo.py` — assert the rendered HTML (not the PDF bytes) carries the logo when set and omits it when not. Test the Jinja render directly to avoid WeasyPrint's network fetch:
```python
from app.reports.pdf import _env

def test_letterhead_renders_logo_when_present():
    html = _env.get_template("base.html").render(
        company={"name": "CivilArch", "gstin": None, "address": None,
                 "logo_url": "https://r2.example/branding/x/logo.png"},
        # minimal context other base.html blocks need — copy from an existing
        # reports test's render context (tests/test_reports*.py).
    )
    assert "letterhead__logo" in html
    assert "https://r2.example/branding/x/logo.png" in html

def test_letterhead_omits_logo_when_absent():
    html = _env.get_template("base.html").render(
        company={"name": "CivilArch", "gstin": None, "address": None, "logo_url": None},
    )
    assert "letterhead__logo" not in html
```
(If `base.html` `{% block %}`s require child-template context, render `dpr_pack.html` with a full builder-output dict instead — copy the context shape from the existing reports test.)

- [ ] **Step 5: Run** `uv run pytest tests/test_reports_logo.py -v` → PASS. `uv run ruff check .`.

- [ ] **Step 6: Commit** `feat(backend/reports): logo in the report letterhead`.

---

### Task 4: Web — company API client (logo)

**Files:**
- Modify: `constructo/web/src/api/auth.ts`
- Test: `constructo/web/src/api/__tests__/companyLogo.test.ts` (new)

**Interfaces:**
- Produces: `Company.logo_url: string | null`; `CompanyUpdate` accepts `logo_key?: string | null`; `authApi.presignCompanyLogo({ content_type }): Promise<LogoPresign>` where `LogoPresign = { key: string; put_url: string | null; upload_mode: 'presigned' | 'unavailable' }`.

- [ ] **Step 1: Types** in `src/api/auth.ts`. Add to the `Company` interface (after `currency`, line 164):
```typescript
  logo_url: string | null
```
Replace the `CompanyUpdate` type (lines 168–170) with:
```typescript
/** Fields the owner may patch (partial — only provided ones change). */
export type CompanyUpdate = Partial<
  Pick<Company, 'name' | 'gstin' | 'address' | 'timezone' | 'currency'>
> & { logo_key?: string | null }

/** Direct-to-R2 logo upload ticket. */
export interface LogoPresign {
  key: string
  put_url: string | null
  upload_mode: 'presigned' | 'unavailable'
}
```

- [ ] **Step 2: Presign method** — add to the `authApi` object near `updateCompany` (after line 350). Mirror the mock shape used by other methods (`mockCompany` exists in this file; give the mock an unavailable ticket):
```typescript
  /** Mint a direct-to-R2 upload ticket for the company logo (owner-only). */
  presignCompanyLogo(opts: { content_type: string }): Promise<LogoPresign> {
    if (USE_MOCKS) {
      return Promise.resolve({ key: 'branding/mock/logo.png', put_url: null, upload_mode: 'unavailable' })
    }
    return call('/api/v1/auth/company/logo/presign', {
      method: 'POST',
      body: JSON.stringify(opts),
    })
  },
```
Also update `mockCompany` (find its definition in this file) to include `logo_url: null`.

- [ ] **Step 3: Write the failing test** `src/api/__tests__/companyLogo.test.ts` (mock `fetch`, USE_MOCKS off — mirror an existing `src/api/__tests__/*.test.ts`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authApi } from '../auth'

describe('authApi.presignCompanyLogo', () => {
  beforeEach(() => vi.restoreAllMocks())
  it('POSTs the content_type to the logo presign endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ key: 'branding/c/logo.png', put_url: 'https://put/x', upload_mode: 'presigned' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const out = await authApi.presignCompanyLogo({ content_type: 'image/png' })
    expect(out.upload_mode).toBe('presigned')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/auth/company/logo/presign')
    expect(JSON.parse(String(init?.body))).toEqual({ content_type: 'image/png' })
  })
})
```
(If USE_MOCKS is compiled true in the test env, set it false in this test the same way other api tests do, or assert against the mock return instead.)

- [ ] **Step 4: Run** `npx vitest run src/api/__tests__/companyLogo.test.ts` → PASS. `npx tsc -b --noEmit`.

- [ ] **Step 5: Commit** `feat(web/api): company logo presign + logo_url type`.

---

### Task 5: Web — CompanyProfile logo uploader + letterhead preview

**Files:**
- Modify: `constructo/web/src/features/admin/CompanyProfile.tsx`
- Modify: `constructo/web/src/i18n/en.ts` + `hi.ts` (logo keys)
- Test: extend the CompanyProfile test (find it under `src/features/admin/__tests__/` or `CompanyProfile.test.tsx`; create if absent)

**Interfaces:**
- Consumes: `authApi.presignCompanyLogo`, `authApi.updateCompany({ logo_key })`, `company.data.logo_url`, `useCan('manage_settings')`.

- [ ] **Step 1: i18n keys** — add to BOTH `en.ts` and `hi.ts` (en values shown; provide Hindi equivalents):
```
'admin.company.logo_label': 'Company logo',
'admin.company.logo_hint': 'PNG or JPEG. Appears on the header of every report you generate.',
'admin.company.logo_upload': 'Upload logo',
'admin.company.logo_remove': 'Remove',
'admin.company.logo_uploading': 'Uploading…',
'admin.company.logo_unavailable': 'Logo upload isn’t available in this environment yet.',
'admin.company.logo_failed': 'Couldn’t upload the logo. Please try again.',
'admin.company.logo_preview_title': 'How your reports will look',
```

- [ ] **Step 2: Logo state + upload handler** — inside `CompanyProfile`, after the `save` mutation (line 113). Reuse the `ChatComposer.processFile` shape (`src/features/chat/ChatComposer.tsx:241`):
```tsx
  const canManage = useCan('manage_settings')
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoErr, setLogoErr] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  async function onLogoFile(file: File) {
    setLogoErr(null)
    setLogoBusy(true)
    try {
      const content_type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const ticket = await authApi.presignCompanyLogo({ content_type })
      if (ticket.upload_mode !== 'presigned' || !ticket.put_url) {
        setLogoErr(t('admin.company.logo_unavailable'))
        return
      }
      const put = await fetch(ticket.put_url, {
        method: 'PUT', body: file, headers: { 'Content-Type': content_type },
      })
      if (!put.ok) throw new Error(`R2 PUT ${put.status}`)
      const saved = await authApi.updateCompany({ logo_key: ticket.key })
      qc.setQueryData(qk.company(), saved)
    } catch {
      setLogoErr(t('admin.company.logo_failed'))
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function removeLogo() {
    const saved = await authApi.updateCompany({ logo_key: null })
    qc.setQueryData(qk.company(), saved)
  }
```
(`useState`, `useRef` already imported in this file? Add `useRef` to the React import if missing. `useCan`, `qc`, `qk`, `t`, `authApi` are already in scope.)

- [ ] **Step 3: Logo block + letterhead preview JSX** — render above the `<form>` (line 141), gated to owners (non-owners see just the preview, read-only). `company.data?.logo_url` is the current logo:
```tsx
  const logoUrl = company.data?.logo_url ?? null
  // ... inside the returned JSX, before the <form>:
  <section className="flex flex-col gap-2">
    <div className="font-body text-small font-semibold text-text">{t('admin.company.logo_label')}</div>
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-card border border-edge bg-surface-sunken">
        {logoUrl ? <img src={logoUrl} alt="" className="max-h-full max-w-full object-contain" /> : <span className="font-body text-micro text-text-mute">—</span>}
      </div>
      {canManage ? (
        <div className="flex items-center gap-2">
          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="hidden"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void onLogoFile(f) }} />
          <Button variant="ghost" disabled={logoBusy} onClick={() => logoInputRef.current?.click()}>
            {logoBusy ? t('admin.company.logo_uploading') : t('admin.company.logo_upload')}
          </Button>
          {logoUrl ? <Button variant="ghost" onClick={() => void removeLogo()}>{t('admin.company.logo_remove')}</Button> : null}
        </div>
      ) : null}
    </div>
    <Small className="!text-text-mute">{t('admin.company.logo_hint')}</Small>
    {logoErr ? <Small className="!text-risk" role="alert">{logoErr}</Small> : null}
    {/* letterhead preview — mirrors the PDF letterhead */}
    <div className="mt-2 rounded-card border border-edge p-4">
      <div className="font-body text-micro font-semibold uppercase tracking-wide text-text-mute">{t('admin.company.logo_preview_title')}</div>
      <div className="mt-2 border-b-2 border-celebrate pb-2">
        {logoUrl ? <img src={logoUrl} alt="" className="mb-1 max-h-10 object-contain" /> : null}
        <div className="font-heading text-h3 text-text">{company.data?.name}</div>
        {company.data?.gstin ? <div className="font-body text-micro text-text-mute">GSTIN: {company.data.gstin}</div> : null}
      </div>
    </div>
  </section>
```
(Use whatever `Button`/`Small` props the file already imports. Match existing class tokens; `border-celebrate` mimics the report's marigold rule — substitute the nearest existing token if `celebrate` isn't a border token.)

- [ ] **Step 4: Write/extend the failing test** (CompanyProfile test): owner sees the "Upload logo" control; with a `logo_url` set, the `<img>` + "Remove" render; a successful upload calls `presignCompanyLogo` then `updateCompany` with the returned `logo_key`; `upload_mode='unavailable'` shows the note; a non-owner (`useCan` → false, mock it) does NOT see the upload control. Mock `authApi.presignCompanyLogo`/`updateCompany` and `fetch` for the PUT. Mirror the providers/mocks in the existing admin tests.

- [ ] **Step 5: Run** `npx vitest run src/features/admin` + `npx tsc -b --noEmit` → PASS.

- [ ] **Step 6: Commit** `feat(web/admin): company logo uploader + letterhead preview`.

---

### Task 6: Web — control-plane cleanup + grouping

**Files:**
- Modify: `constructo/web/src/features/admin/AdminConsole.tsx`
- Modify: `constructo/web/src/i18n/en.ts` + `hi.ts` (group labels + rename company label)
- Test: extend the AdminConsole test (`src/features/admin/__tests__/AdminConsole.test.tsx` or similar)

**Interfaces:**
- Consumes: nothing new. Produces: a pruned + grouped `SECTIONS`.

- [ ] **Step 1: i18n** — in `en.ts` change `'admin.section.company'` to `'Company & branding'` (hi: the Hindi equivalent). Add group labels to BOTH locales:
```
'admin.group.brand': 'Company & brand',
'admin.group.people': 'People',
'admin.group.site': 'Site setup',
'admin.group.comms': 'Comms',
'admin.group.account': 'Account',
```

- [ ] **Step 2: Prune + group the registry** in `AdminConsole.tsx`. Extend `SectionDef` (line 36) with `group: TranslationKey`. Replace `SECTIONS` (lines 39–52) with (note: `documents`, `integrations`, `audit`, `security` removed):
```typescript
const SECTIONS: SectionDef[] = [
  { key: 'company', labelKey: 'admin.section.company', group: 'admin.group.brand', built: true },
  { key: 'team', labelKey: 'admin.section.team', group: 'admin.group.people', built: true },
  { key: 'baselines', labelKey: 'admin.section.baselines', group: 'admin.group.site', built: true },
  { key: 'vendors', labelKey: 'admin.section.vendors', group: 'admin.group.site', built: true },
  { key: 'materials', labelKey: 'admin.section.materials', group: 'admin.group.site', built: true },
  { key: 'groups', labelKey: 'admin.section.groups', group: 'admin.group.comms', link: '/groups' },
  { key: 'notifications', labelKey: 'admin.section.notifications', group: 'admin.group.comms', built: true },
  { key: 'billing', labelKey: 'admin.section.billing', group: 'admin.group.account', built: true },
  // Hidden for the pilot (empty stubs / now in the sidebar) — restore by re-adding:
  //   { key: 'documents', labelKey: 'admin.section.documents', group: 'admin.group.site', link: '/settings/documents' },
  //   { key: 'integrations', labelKey: 'admin.section.integrations', group: 'admin.group.comms' },
  //   { key: 'audit', labelKey: 'admin.section.audit', group: 'admin.group.account' },
  //   { key: 'security', labelKey: 'admin.section.security', group: 'admin.group.account' },
]
```

- [ ] **Step 3: Render grouped subheadings.** Replace the `{SECTIONS.map(...)}` rail block (lines 93–116) so it iterates groups in order, emitting a subheading `<li>` per group then its sections. Derive the ordered group list from `SECTIONS` (first-seen order) to stay DRY:
```tsx
{Array.from(new Set(SECTIONS.map((s) => s.group))).map((group) => (
  <li key={group} className="shrink-0">
    <div className="px-3 pb-1 pt-3 font-body text-micro font-semibold uppercase tracking-wide text-text-mute">
      {t(group)}
    </div>
    <ul className="flex flex-col gap-0.5">
      {SECTIONS.filter((s) => s.group === group).map((s) => {
        const isActive = s.key === active.key
        return (
          <li key={s.key}>
            <button
              type="button"
              onClick={() => select(s.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-control px-3 py-2 text-left font-body text-small font-semibold cstk-animate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive ? 'bg-surface-selected text-text' : 'text-text-mute hover:bg-surface-hover hover:text-text'
              }`}
            >
              {t(s.labelKey)}
              {!s.built ? (
                <span className="rounded-pill bg-surface-sunken px-1.5 py-0.5 font-body text-micro font-semibold text-text-mute">
                  {t('admin.soon')}
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  </li>
))}
```
(Keep the surrounding `<ul>`/`<nav>` wrapper that exists today. The `active` fallback `SECTIONS.find(...) ?? SECTIONS[0]` still works.)

- [ ] **Step 4: Write/extend the failing test** (AdminConsole test): the rail no longer renders `documents`/`integrations`/`audit`/`security` labels; it DOES render the kept sections and the group subheadings (`Company & brand`, `Site setup`, etc.); the company label reads `Company & branding`; deep-link `?section=baselines` still selects baselines. Update any existing assertion that expected the old 12-item flat list.

- [ ] **Step 5: Run** `npx vitest run src/features/admin` + `npx tsc -b --noEmit` → PASS.

- [ ] **Step 6: Commit** `feat(web/admin): prune + group the control-plane sections`.

---

### Task 7: Verification + DoD

**Files:** none (gate only).

- [ ] **Step 1: Backend gate** — `cd constructo/backend && uv run ruff check . && uv run pytest` → all green (note any pre-existing WeasyPrint/env-skips).
- [ ] **Step 2: Web gate** — `cd constructo/web && npx tsc -b --noEmit && npx vitest run --retry=2 && npm run build` → all green.
- [ ] **Step 3: Manual trace** (mock owner, `VITE_USE_MOCKS+VITE_NEEV_OWNER`): Settings → "Company & branding" shows the logo block + letterhead preview; the section rail shows grouped subheadings with no Drawings/Integrations/Audit/Security tiles. (Logo PUT itself needs real R2 — mock shows the "unavailable" note, which is correct.)
- [ ] **Step 4: Commit** any doc/ledger updates. Note in the PR: **logo-on-PDF requires the Azure backend redeploy**.

---

## Self-Review

**Spec coverage:** logo column (T1) · presign endpoint (T2) · report letterhead (T3) · web api (T4) · upload UI + preview (T5) · cleanup + grouping (T6) · gate (T7). Branding scope = logo-only ✓ (no footer/accent/white-label). Cleanup = remove documents + hide integrations/audit/security + group + rename ✓. RBAC owner-only ✓. i18n parity called out ✓. Deployment caveat captured ✓.

**Type consistency:** `logo_key` (backend column + CompanyUpdateIn + web CompanyUpdate) and `logo_url` (CompanyOut + web Company) used consistently; `LogoPresign{key,put_url,upload_mode:'presigned'|'unavailable'}` matches backend `LogoPresignOut`. `_company_out` used by both GET/PATCH.

**Placeholder scan:** migration `down_revision`/`revision` are explicit lookups (the one true unknown — resolved by `alembic heads`), not vague TODOs. Test fixture names (`owner_headers`, `member_headers`, render context) point at concrete reference tests to copy.
