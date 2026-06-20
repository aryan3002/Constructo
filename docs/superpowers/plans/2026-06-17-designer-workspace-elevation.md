# Designer Workspace Elevation (Elev-C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevate designer workspace cohesion so the three tabs (Selections, Site Changes, Intake) feel like ONE product — consistent width, clickable drawing cross-links, materialize→Selections one-click jump, and localized status enum in the register drawer.

**Architecture:** Four atomic commits, each self-contained. Item 1 fixes layout divergence at the `DesignerWorkspace` panel wrapper level and removes duplicate chrome from `SiteChanges`. Items 2–4 are surgical edits to `SiteChangeDrawer`, `Intake`, and `DrawingDetailDrawer` respectively with matching i18n additions.

**Tech Stack:** React 18, Vite, React Router v6 (`useSearchParams`, `<Link>`), react-i18next-style custom `useT()`, Vitest + React Testing Library, TypeScript, Tailwind/Blueprint tokens.

---

## File Map

| File | Item | What changes |
|---|---|---|
| `src/features/designer/SiteChanges.tsx` | 1 | Remove own `<H1>` + internal `<select>` when `externalSiteId` is present; change outer `<div>` from `max-w-2xl mx-auto px-4 py-6` to `space-y-6` (shell controls width). Keep standalone fallback. |
| `src/features/designer/Selections.tsx` | 1 | Already full-bleed `space-y-5` — add `data-testid="selections-panel"` so test can confirm no H1 duplicate. No other layout change needed (it already skips internal header when `propSiteId` is set). |
| `src/features/designer/Intake.tsx` | 1+3 | Item 1: top-level wrapper already `py-2` — add `data-testid="intake-panel"`. Item 3: after `materializeMutation.onSuccess`, call a passed-in `onViewSelections?` callback (or use `useSearchParams` directly to navigate to `?tab=selections`). |
| `src/features/designer/DesignerWorkspace.tsx` | 1 | Wrap each tabpanel content with a shared `className="max-w-3xl"` div (the cockpit width). Pass `onViewSelections` callback to `<Intake>`. |
| `src/features/designer/SiteChangeDrawer.tsx` | 2 | Replace inert `<p>` title/version with `<Link to="/settings/documents">` chip in the resolved linked-drawing block. Import `Link` from react-router-dom. |
| `src/features/documents/DrawingDetailDrawer.tsx` | 4 | Replace raw `label={sc.status}` on `<StatusPill>` with `t(\`sitechanges.badge.${sc.status}\`)`. |
| `src/i18n/en.ts` | 3+4 | Add `'intake.materialize.view_selections'` key. No new keys needed for Item 4 (already uses `sitechanges.badge.*`). |
| `src/i18n/hi.ts` | 3+4 | Mirror `'intake.materialize.view_selections'` in Hindi. |
| `src/features/designer/__tests__/SiteChanges.test.tsx` | 1 | Update/add assertion: when `siteId` prop is provided, the internal H1 ("Site Changes") heading and internal `site-select` are NOT rendered. |
| `src/features/designer/__tests__/DesignerWorkspace.test.tsx` | 1 | No change needed (mocked surfaces; existing tests still pass). |
| `src/features/designer/__tests__/Intake.test.tsx` | 3 | Add test: after materialize succeeds, a "View in Selections" button appears; clicking it sets `?tab=selections`. |
| `src/features/documents/__tests__/DrawingsD6.test.tsx` | 4 | Update the "status pill and room" test to assert the localized label (e.g. `'Linked'`) from `sitechanges.badge.linked` instead of the raw `'linked'` lowercase string. |
| `src/features/designer/__tests__/SiteChangeDrawer.test.tsx` | 2 | NEW file: focused test — resolved change with linked drawing renders a `<Link>` to `/settings/documents` with the drawing title. |

---

## Task 1 — Consistent content width + remove duplicate chrome

**Files:**
- Modify: `src/features/designer/SiteChanges.tsx` (outer div classname + conditional H1 block removal)
- Modify: `src/features/designer/DesignerWorkspace.tsx` (add panel width wrapper)
- Modify: `src/features/designer/__tests__/SiteChanges.test.tsx` (add/update assertion)

### Step 1.1 — Write the failing test

Add a test in `SiteChanges.test.tsx` that asserts: when `siteId` prop is provided (workspace mode), neither the standalone `<H1>` with text "Site Changes" nor the `data-testid="site-select"` dropdown appears in the rendered output.

The existing test `renderSiteChanges('site-1')` already passes `siteId`, so add this at the end of the describe block:

```tsx
// In src/features/designer/__tests__/SiteChanges.test.tsx
// Add inside describe('SiteChanges surface (D3)', () => { ... })

it('workspace mode (siteId prop): no internal H1 or site-select rendered', async () => {
  mockList.mockResolvedValue(MOCK_CHANGES)
  renderSiteChanges('site-1')  // siteId provided = workspace mode

  // Wait for data to ensure the component has fully rendered
  await screen.findByText('Beam shifted 200mm east')

  // The standalone H1 ("Site Changes") must NOT appear —
  // the workspace shell owns the title
  expect(screen.queryByRole('heading', { name: /^Site Changes$/i })).not.toBeInTheDocument()

  // The internal site <select> must NOT appear when siteId is provided
  expect(screen.queryByTestId('site-select')).not.toBeInTheDocument()
})
```

- [ ] **Step 1.1:** Add the test above to `src/features/designer/__tests__/SiteChanges.test.tsx` at the end of the describe block (before the closing `}`).

- [ ] **Step 1.2: Run test to confirm it FAILS**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/__tests__/SiteChanges.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — the `queryByRole('heading', { name: /^Site Changes$/i })` will find the H1 that `SiteChanges` currently always renders.

### Step 1.3 — Implement: remove duplicate H1 + normalize width in SiteChanges

Edit `src/features/designer/SiteChanges.tsx`:

1. Change the outer container from `max-w-2xl mx-auto px-4 py-6` to `flex flex-col gap-6` (the workspace shell now owns max-width; standalone mode gets it from the page).

2. Gate the `<div>` containing `<H1>` and the new-count badge behind `!externalSiteId`. The badge info is still useful standalone. When in workspace mode, the shell's `<header>` already shows the page title.

The existing `showSiteSelector = !externalSiteId` pattern already handles the `<select>` — that's already gated. We only need to additionally gate the H1 block.

```tsx
// src/features/designer/SiteChanges.tsx
// Change line 158:
// OLD:
//   <div className="flex flex-col gap-6 max-w-2xl mx-auto px-4 py-6">
// NEW:
//   <div className="flex flex-col gap-6">

// Change the header block (lines 159-173): gate it behind !externalSiteId
// OLD:
//   {/* ── Page header ── */}
//   <div>
//     <div className="flex items-baseline gap-3">
//       <H1 as="h1">{t('sitechanges.title')}</H1>
//       {newCount > 0 && (
//         <span ...>{t('sitechanges.count.needs_you', { n: newCount })}</span>
//       )}
//     </div>
//     <Small className="mt-1">{t('sitechanges.subtitle')}</Small>
//   </div>
//
// NEW:
//   {/* ── Page header (standalone only — workspace shell owns the title) ── */}
//   {!externalSiteId && (
//     <div>
//       <div className="flex items-baseline gap-3">
//         <H1 as="h1">{t('sitechanges.title')}</H1>
//         {newCount > 0 && (
//           <span
//             data-testid="new-count-badge"
//             className="inline-flex items-center gap-1 rounded-pill bg-warn/15 border border-warn/30 px-2 py-0.5 font-body text-micro font-semibold text-warn"
//           >
//             {t('sitechanges.count.needs_you', { n: newCount })}
//           </span>
//         )}
//       </div>
//       <Small className="mt-1">{t('sitechanges.subtitle')}</Small>
//     </div>
//   )}
```

Note: the `data-testid="new-count-badge"` moves inside the `!externalSiteId` block. The existing test `renderSiteChanges('site-1')` already passes `siteId='site-1'`, which means `externalSiteId` will be `'site-1'` (truthy), so the badge won't render in workspace mode. **The existing test "shows the N new needs-you badge in the header" will break** — we need to update it to use `renderSiteChanges()` without args (standalone mode). See Step 1.4.

- [ ] **Step 1.3:** Apply the two edits to `SiteChanges.tsx` as described above. The full updated render section:

```tsx
  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header (standalone only — workspace shell owns the title) ── */}
      {!externalSiteId && (
        <div>
          <div className="flex items-baseline gap-3">
            <H1 as="h1">{t('sitechanges.title')}</H1>
            {newCount > 0 && (
              <span
                data-testid="new-count-badge"
                className="inline-flex items-center gap-1 rounded-pill bg-warn/15 border border-warn/30 px-2 py-0.5 font-body text-micro font-semibold text-warn"
              >
                {t('sitechanges.count.needs_you', { n: newCount })}
              </span>
            )}
          </div>
          <Small className="mt-1">{t('sitechanges.subtitle')}</Small>
        </div>
      )}

      {/* ── Site selector (standalone) ── */}
      {showSiteSelector && (
        // ... rest unchanged
      )}
      // ... rest unchanged
    </div>
  )
```

### Step 1.4 — Fix the badge test to use standalone mode

The test "shows the N new needs-you badge in the header" calls `renderSiteChanges()` which passes `siteId='site-1'` (workspace mode). The badge is now only in standalone mode. Update that one test to call `renderSiteChanges()` with no args so it goes through standalone flow. However the standalone flow requires `useSites` to supply the site — which the mock already does. So just change `renderSiteChanges('site-1')` to `renderSiteChanges()` (no arg) in that specific test.

Wait — looking at the helper:
```ts
function renderSiteChanges(siteId = 'site-1') { ... <SiteChanges siteId={siteId} /> ... }
```

If we call `renderSiteChanges()` it still passes `siteId='site-1'` by default. We need to either:
- Add an overload: `renderSiteChanges(undefined)` so `siteId` is undefined
- Or change the test helper to accept `siteId?: string`

Update the test helper signature and the badge test:

```tsx
// Change helper signature:
function renderSiteChanges(siteId?: string) {
  // ...
  return render(
    // ...
    <SiteChanges siteId={siteId} />
    // ...
  )
}

// Badge test: call renderSiteChanges() with no args (standalone mode)
it('shows the "N new" needs-you badge in the header', async () => {
  // newCount computed from all changes (not filtered): 1 new
  renderSiteChanges()  // standalone mode — no siteId prop, badge renders

  // Wait for data to load
  await screen.findByText('Beam shifted 200mm east')

  // The badge shows "1 new"
  const badge = await screen.findByTestId('new-count-badge')
  expect(badge).toBeInTheDocument()
  expect(badge.textContent).toMatch(/1/)
})
```

- [ ] **Step 1.4:** Update `SiteChanges.test.tsx`: change the `renderSiteChanges` helper to `siteId?: string` and update the badge test to call `renderSiteChanges()` with no argument.

### Step 1.5 — Add uniform width wrapper in DesignerWorkspace

Each tabpanel in `DesignerWorkspace.tsx` should constrain content to a consistent width. The cockpit uses `max-w-3xl mx-auto` as the reading-column target — apply that inside each panel `<div>`:

```tsx
// In src/features/designer/DesignerWorkspace.tsx
// Wrap each surface inside its tabpanel div with a width container:

<div
  id={`panel-${TAB_SELECTIONS}`}
  role="tabpanel"
  aria-labelledby={`tab-${TAB_SELECTIONS}`}
  tabIndex={0}
  hidden={activeTab !== TAB_SELECTIONS}
  className="focus-visible:outline-none"
>
  {activeTab === TAB_SELECTIONS && (
    <div className="max-w-3xl mx-auto">
      <Selections siteId={effectiveSiteId} />
    </div>
  )}
</div>

<div
  id={`panel-${TAB_SITE_CHANGES}`}
  role="tabpanel"
  aria-labelledby={`tab-${TAB_SITE_CHANGES}`}
  tabIndex={0}
  hidden={activeTab !== TAB_SITE_CHANGES}
  className="focus-visible:outline-none"
>
  {activeTab === TAB_SITE_CHANGES && (
    <div className="max-w-3xl mx-auto">
      <SiteChanges siteId={effectiveSiteId} />
    </div>
  )}
</div>

<div
  id={`panel-${TAB_INTAKE}`}
  role="tabpanel"
  aria-labelledby={`tab-${TAB_INTAKE}`}
  tabIndex={0}
  hidden={activeTab !== TAB_INTAKE}
  className="focus-visible:outline-none"
>
  {activeTab === TAB_INTAKE && (
    <div className="max-w-3xl mx-auto">
      <Intake siteId={effectiveSiteId} />
    </div>
  )}
</div>
```

- [ ] **Step 1.5:** Apply the wrapper divs in `DesignerWorkspace.tsx`.

- [ ] **Step 1.6: Run the new test — confirm it passes**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/__tests__/SiteChanges.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: ALL tests PASS including the new workspace-mode test.

- [ ] **Step 1.7: Run full designer test suite**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/ --reporter=verbose 2>&1 | tail -40
```

Expected: all green.

- [ ] **Step 1.8: Commit**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/designer/SiteChanges.tsx src/features/designer/DesignerWorkspace.tsx src/features/designer/__tests__/SiteChanges.test.tsx && git commit -m "$(cat <<'EOF'
feat(designer): uniform content width + remove duplicate chrome from SiteChanges

SiteChanges no longer renders its own <H1> or internal site-selector
when rendered inside the workspace shell (siteId prop present).
All three tab panels now share max-w-3xl mx-auto wrapper so tab-switch
no longer snaps width. Standalone SiteChanges retains full header + picker.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Clickable linked-drawing chip

**Files:**
- Modify: `src/features/designer/SiteChangeDrawer.tsx`
- Create: `src/features/designer/__tests__/SiteChangeDrawer.test.tsx`

### Step 2.1 — Write the failing test

Create a new test file `src/features/designer/__tests__/SiteChangeDrawer.test.tsx` with a focused test that asserts the resolved linked-drawing block renders a `<Link>` (i.e. an `<a>` element) pointing to `/settings/documents`:

```tsx
// src/features/designer/__tests__/SiteChangeDrawer.test.tsx
/**
 * SiteChangeDrawer — focused tests for the linked-drawing chip (Item 2).
 *
 * Asserts: when a change is resolved and has a linked_drawing_id,
 * the linked-drawing block renders an accessible <a> link to /settings/documents,
 * not inert text.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import { ToastProvider } from '../../../ui/Toast'
import type { SiteChange } from '../../../api/siteChanges'

// ---------------------------------------------------------------------------
// Mock drawingsApi
// ---------------------------------------------------------------------------

const MOCK_DRAWINGS = [
  {
    id: 'drw-1',
    site_id: 'site-1',
    title: 'Ground Floor Plan',
    version: 'v2',
    kind: 'plan' as const,
    change_note: null,
    published_at: '2026-06-01T14:30:00Z',
    supersedes_id: null,
    site_name: 'Tripathi Residence',
    is_current: true,
    file_url: 'mock-key/ground-floor-plan-v2.pdf',
  },
]

vi.mock('../../../api/drawings', () => ({
  drawingsApi: {
    listRegister: vi.fn().mockResolvedValue(MOCK_DRAWINGS),
    presign: vi.fn(),
    publish: vi.fn(),
    putToR2: vi.fn(),
  },
}))

vi.mock('../../../api/siteChanges', () => ({
  siteChangesApi: {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => 'architect' as string | undefined,
  useCan: () => false,
}))

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

import { SiteChangeDrawer } from '../SiteChangeDrawer'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const RESOLVED_CHANGE: SiteChange = {
  id: 'sc-resolved',
  company_id: 'co-1',
  site_id: 'site-1',
  room: 'Living Room',
  title: 'False ceiling clash resolved',
  note: 'Ceiling notched around column.',
  impact: 'False ceiling revised.',
  photo_url: null,
  reported_by: 'user-1',
  reported_by_name: 'Rajan',
  status: 'resolved',
  linked_drawing_id: 'drw-1',
  created_at: '2026-06-08T11:00:00Z',
  resolved_at: '2026-06-11T16:45:00Z',
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderDrawer(change: SiteChange, open = true) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <ToastProvider>
            <SiteChangeDrawer
              change={change}
              open={open}
              onClose={vi.fn()}
            />
          </ToastProvider>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SiteChangeDrawer — linked-drawing chip (Item 2)', () => {
  it('resolved change with linked drawing: renders an <a> link to /settings/documents', async () => {
    renderDrawer(RESOLVED_CHANGE)

    // Wait for the drawing title to appear
    await waitFor(() =>
      expect(screen.getByText('Ground Floor Plan')).toBeInTheDocument(),
    )

    // The linked-drawing chip must be an anchor (not inert <p>)
    const chip = screen.getByTestId('linked-drawing-chip')
    expect(chip.tagName.toLowerCase()).toBe('a')
    expect(chip).toHaveAttribute('href', '/settings/documents')
  })

  it('linked-drawing chip has accessible focus ring class and visible text', async () => {
    renderDrawer(RESOLVED_CHANGE)

    await waitFor(() =>
      expect(screen.getByText('Ground Floor Plan')).toBeInTheDocument(),
    )

    const chip = screen.getByTestId('linked-drawing-chip')
    // Has focus ring styling (contains focus-visible class)
    expect(chip.className).toMatch(/focus-visible/)
    // Shows drawing title
    expect(chip).toHaveTextContent('Ground Floor Plan')
    // Shows version
    expect(chip).toHaveTextContent('v2')
  })
})
```

- [ ] **Step 2.1:** Create `src/features/designer/__tests__/SiteChangeDrawer.test.tsx` with the content above.

- [ ] **Step 2.2: Run test to confirm it FAILS**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/__tests__/SiteChangeDrawer.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `getByTestId('linked-drawing-chip')` not found, element is a `<p>` not `<a>`.

### Step 2.3 — Implement: make the chip a Link

In `SiteChangeDrawer.tsx`, find the resolved linked-drawing block (lines 351–372) and replace the inert `<div>/<p>` chip with a `<Link>` from react-router-dom.

Add import at top of file:
```tsx
import { Link } from 'react-router-dom'
```

Replace the resolved-linked-drawing block:

```tsx
{/* Linked drawing (read-only, resolved state) — shows title+version as a link to the register */}
{isResolved && change.linked_drawing_id && (
  <div className="mb-2">
    <Small className="mb-1 uppercase tracking-wide font-semibold">
      {t('sitechanges.drawer.linked_drawing')}
    </Small>
    {linkedDrawing ? (
      <Link
        to="/settings/documents"
        data-testid="linked-drawing-chip"
        className={[
          'inline-flex items-center gap-1.5 rounded-card border border-info/30 bg-info/10 px-3 py-2',
          'font-body text-small font-semibold text-info',
          'hover:bg-info/15 hover:border-info/50 transition cstk-animate',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        ].join(' ')}
        aria-label={t('sitechanges.drawer.view_drawing_register')}
      >
        {linkedDrawing.title}
        <span className="ml-1 font-normal text-text-mute">{linkedDrawing.version}</span>
        {/* External link icon */}
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="ml-1 shrink-0 opacity-60"
        >
          <path d="M6 3H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3M10 2h4m0 0v4m0-4L7 9" />
        </svg>
      </Link>
    ) : (
      <p className="font-body text-small text-text-mute">
        {t('sitechanges.drawer.linked_drawing')}
      </p>
    )}
  </div>
)}
```

This introduces one new i18n key: `'sitechanges.drawer.view_drawing_register'`. Add it in Step 2.4.

- [ ] **Step 2.3:** Apply the edit to `SiteChangeDrawer.tsx` — add `import { Link }` at top, replace the resolved-linked-drawing block.

### Step 2.4 — Add i18n key in en.ts and hi.ts

In `src/i18n/en.ts`, after `'sitechanges.drawer.linked_drawing': 'Linked drawing',` add:
```ts
'sitechanges.drawer.view_drawing_register': 'View in drawings register',
```

In `src/i18n/hi.ts`, mirror it after the same Hindi key:
```ts
'sitechanges.drawer.view_drawing_register': 'ड्राइंग रजिस्टर में देखें',
```

- [ ] **Step 2.4:** Add the i18n key to both `en.ts` and `hi.ts`.

- [ ] **Step 2.5: Run the new tests — confirm they pass**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/__tests__/SiteChangeDrawer.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: both chip tests PASS.

- [ ] **Step 2.6: Run the full SiteChanges test suite (includes existing drawer tests via SiteChanges.test.tsx)**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/__tests__/SiteChanges.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: all 13 existing tests PASS (the "resolved-linked-drawing" test now finds a chip that is an `<a>`, and the `within(linkedDrawingWidget).getByText('North Elevation')` still works because the `<Link>` contains that text node).

- [ ] **Step 2.7: Commit**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/designer/SiteChangeDrawer.tsx src/features/designer/__tests__/SiteChangeDrawer.test.tsx src/i18n/en.ts src/i18n/hi.ts && git commit -m "$(cat <<'EOF'
feat(designer): linked-drawing chip is now a navigable link to the drawings register

Resolved site-changes previously showed the linked drawing title as inert
text. Now renders a <Link to="/settings/documents"> chip with title+version
and a focus ring, so the designer can jump from a change to the register.
New i18n key: sitechanges.drawer.view_drawing_register (en+hi).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Materialize → "View in Selections" affordance

**Files:**
- Modify: `src/features/designer/Intake.tsx`
- Modify: `src/features/designer/DesignerWorkspace.tsx`
- Modify: `src/i18n/en.ts`
- Modify: `src/i18n/hi.ts`
- Modify: `src/features/designer/__tests__/Intake.test.tsx`

### Step 3.1 — Write the failing test

Add a new test in `Intake.test.tsx`:

```tsx
// Add after the existing test 5 (materialize) in describe('Intake', () => { ... })

// -------------------------------------------------------------------------
// 5b. Materialize → View in Selections affordance
// -------------------------------------------------------------------------

it('after materialize succeeds, a "View in Selections" button appears', async () => {
  mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
  mockBrief.mockResolvedValue(MOCK_BRIEF)
  mockThemesForArea.mockResolvedValue([])
  const onViewSelections = vi.fn()

  const qc = makeQC()
  render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter>
            <Intake siteId="site-1" onViewSelections={onViewSelections} />
          </MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  )

  await screen.findByText('A warm, nature-rooted home')

  // Click Materialize
  await userEvent.click(screen.getByTestId('materialize-btn'))
  await screen.findByRole('dialog')
  await userEvent.click(screen.getByRole('button', { name: /Create specs/i }))

  // Wait for success toast and the View in Selections button
  await screen.findByText(/Proposed 5 spec line/i)

  const viewBtn = await screen.findByRole('button', { name: /View in Selections/i })
  expect(viewBtn).toBeInTheDocument()

  // Clicking it calls onViewSelections
  await userEvent.click(viewBtn)
  expect(onViewSelections).toHaveBeenCalledOnce()
})
```

- [ ] **Step 3.1:** Add the test above to `src/features/designer/__tests__/Intake.test.tsx`.

- [ ] **Step 3.2: Run to confirm it FAILS**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/__tests__/Intake.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `Intake` doesn't accept `onViewSelections` prop, no "View in Selections" button appears.

### Step 3.3 — Add i18n key

In `src/i18n/en.ts`, after `'intake.materialize.toast.error'` add:
```ts
'intake.materialize.view_selections': 'View in Selections',
```

In `src/i18n/hi.ts`, mirror:
```ts
'intake.materialize.view_selections': 'Selections में देखें',
```

- [ ] **Step 3.3:** Add the key to both `en.ts` and `hi.ts`.

### Step 3.4 — Implement in Intake.tsx

1. Add `onViewSelections?: () => void` to `IntakeProps`.
2. Thread it through to `BriefBody`.
3. In `BriefBody`'s `materializeMutation.onSuccess`, set a `materializedCount` state piece.
4. After materialize succeeds and the success state is active, render a "View in Selections" button that calls `onViewSelections?.()`.

The cleanest approach: add `materializedCount: number | null` state to `BriefBody`. On success, set it. Render the button when it's non-null.

```tsx
// In Intake.tsx — BriefBodyProps, add:
interface BriefBodyProps {
  // ... existing props ...
  onViewSelections?: () => void  // NEW
}

// In BriefBody — add state:
const [materializedCount, setMaterializedCount] = useState<number | null>(null)

// In materializeMutation.onSuccess:
onSuccess: (result) => {
  setShowMaterialize(false)
  setMaterializedCount(result.specs_created)   // NEW
  show({
    message: t('intake.materialize.toast.success', { count: result.specs_created }),
    status: 'ok' as const,
  })
  qc.invalidateQueries({ queryKey: qk.specs(siteId) })
  qc.invalidateQueries({ queryKey: qk.specDesk(siteId) })
},

// In BriefBody render — after the Materialize CTA block, add:
{materializedCount !== null && onViewSelections && (
  <div className="mt-3">
    <Button
      variant="secondary"
      onClick={onViewSelections}
    >
      {t('intake.materialize.view_selections')}
    </Button>
  </div>
)}
```

Also update `IntakeProps` and pass the callback through from the main `Intake` export to `BriefBody`:

```tsx
// IntakeProps:
export interface IntakeProps {
  siteId?: string
  onViewSelections?: () => void  // NEW
}

// In Intake function:
export function Intake({ siteId, onViewSelections }: IntakeProps) {
  // ...
  // In the BriefBody call (State 8):
  return (
    <div className="py-2">
      <BriefBody
        profile={profile}
        briefId={brief.brief_id}
        siteId={siteId}
        narrative={brief.narrative}
        version={brief.version}
        canDecide={canDecide}
        onViewSelections={onViewSelections}  // NEW
      />
    </div>
  )
}
```

- [ ] **Step 3.4:** Apply the changes to `src/features/designer/Intake.tsx`.

### Step 3.5 — Wire onViewSelections in DesignerWorkspace

In `DesignerWorkspace.tsx`, pass a callback that sets `?tab=selections`:

```tsx
// In DesignerWorkspace:
function handleViewSelections() {
  setActiveTab(TAB_SELECTIONS)
}

// In the Intake panel:
<Intake siteId={effectiveSiteId} onViewSelections={handleViewSelections} />
```

- [ ] **Step 3.5:** Add `handleViewSelections` function and pass it to `<Intake>` in `DesignerWorkspace.tsx`.

- [ ] **Step 3.6: Run the new test**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/__tests__/Intake.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: all PASS including the new test.

- [ ] **Step 3.7: Run full designer suite**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/designer/ --reporter=verbose 2>&1 | tail -30
```

Expected: all green.

- [ ] **Step 3.8: Commit**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/designer/Intake.tsx src/features/designer/DesignerWorkspace.tsx src/features/designer/__tests__/Intake.test.tsx src/i18n/en.ts src/i18n/hi.ts && git commit -m "$(cat <<'EOF'
feat(intake): "View in Selections" button after materialize

After materializing the brief into spec lines, a "View in Selections"
button appears so the designer can jump directly to the Selections tab
to review the proposed lines. New i18n key: intake.materialize.view_selections (en+hi).
Workspace wires onViewSelections → setActiveTab('selections').

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Localize leaked status enum in DrawingDetailDrawer

**Files:**
- Modify: `src/features/documents/DrawingDetailDrawer.tsx`
- Modify: `src/features/documents/__tests__/DrawingsD6.test.tsx`

The `DrawingDetailDrawer` currently renders `label={sc.status}` on the linked-change `<StatusPill>` (raw `'new'`/`'linked'`/`'resolved'` strings). We use the existing `sitechanges.badge.*` keys which are already in both `en.ts` and `hi.ts`.

### Step 4.1 — Write the failing test

The existing test "shows the status pill and room for a linked change" asserts:
```tsx
const linkedTexts = within(linkedSection).getAllByText(/^linked$/i)
```

This currently passes because `label="linked"` renders the string `linked` and the regex is case-insensitive. After localization, `label={t('sitechanges.badge.linked')}` will render `'Linked'` (capitalized) in English — the test still matches because `/^linked$/i` is case-insensitive. So the existing test continues to pass.

We need to add a more precise assertion that the displayed text matches the localized label (title-case "Linked", not lowercase "linked"):

```tsx
// Add in DrawingsD6.test.tsx in the '4. Shows the status pill and room' test:

it('linked-change status pill shows LOCALIZED label ("Linked" not raw "linked")', async () => {
  mockListRegister.mockResolvedValue([rowV1, rowV2])
  mockSiteChangesList.mockResolvedValue([linkedSiteChange])

  renderPage()

  await screen.findByRole('heading', { name: /Ground Floor Plan/i })
  await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))

  const dialog = await screen.findByRole('dialog')

  await waitFor(() => {
    expect(
      within(dialog).getByText(/Window sill height reduced to 800mm/i),
    ).toBeInTheDocument()
  })

  const linkedSection = within(dialog).getByText(/^Linked site changes$/i).closest('section')!

  // The localized label is title-case "Linked" from sitechanges.badge.linked
  // (raw label would be lowercase "linked" — assert the exact form)
  expect(within(linkedSection).getByText('Linked')).toBeInTheDocument()
  // Ensure there is NO raw lowercase "linked" standalone text node
  // (StatusPill renders its label in a span — it should be "Linked" not "linked")
  const allSpans = within(linkedSection).getAllByText('Linked')
  expect(allSpans.length).toBeGreaterThan(0)
})
```

- [ ] **Step 4.1:** Add the new test to the existing `'3. Linked site changes'` describe block in `src/features/documents/__tests__/DrawingsD6.test.tsx`.

- [ ] **Step 4.2: Run to confirm it FAILS**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/documents/__tests__/DrawingsD6.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — the raw `label={sc.status}` renders lowercase "linked", but our test looks for exact 'Linked'. Actually, `StatusPill` may or may not capitalize the label. Let's check — looking at `SiteChangeCard`, `pillLabel = t('sitechanges.badge.linked')` → returns `'Linked'` (capital). But in `DrawingDetailDrawer`, `label={sc.status}` → passes the raw enum `'linked'` (lowercase). So the new test checking for `'Linked'` (capital L) will FAIL when the component is passing raw `sc.status`. Good.

### Step 4.3 — Implement: localize the label in DrawingDetailDrawer

In `DrawingDetailDrawer.tsx`, the linked site changes section renders:

```tsx
<StatusPill
  status={sc.status === 'resolved' ? 'ok' : sc.status === 'linked' ? 'info' : 'warn'}
  label={sc.status}
  size="sm"
/>
```

Replace `label={sc.status}` with the localized key lookup:

```tsx
<StatusPill
  status={sc.status === 'resolved' ? 'ok' : sc.status === 'linked' ? 'info' : 'warn'}
  label={t(`sitechanges.badge.${sc.status}` as 'sitechanges.badge.new')}
  size="sm"
/>
```

The cast `as 'sitechanges.badge.new'` satisfies TypeScript's template literal key constraint (all three badge keys share the same type signature in `useT`). Alternatively use a lookup object for strict typing:

```tsx
const SC_STATUS_LABEL: Record<string, Parameters<typeof t>[0]> = {
  new: 'sitechanges.badge.new',
  linked: 'sitechanges.badge.linked',
  resolved: 'sitechanges.badge.resolved',
}

// ...in the JSX:
<StatusPill
  status={sc.status === 'resolved' ? 'ok' : sc.status === 'linked' ? 'info' : 'warn'}
  label={t(SC_STATUS_LABEL[sc.status] ?? 'sitechanges.badge.new')}
  size="sm"
/>
```

The lookup-object approach is preferred — it's explicit and avoids template-literal casting.

The `t` function is already called at the top of `DrawingDetailDrawer` — no new import needed.

- [ ] **Step 4.3:** Apply the edit to `DrawingDetailDrawer.tsx`:
  1. After the existing `const KIND_CLASS` object, add the `SC_STATUS_LABEL` lookup.
  2. Replace `label={sc.status}` with `label={t(SC_STATUS_LABEL[sc.status] ?? 'sitechanges.badge.new')}`.

- [ ] **Step 4.4: Run the tests**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/documents/__tests__/DrawingsD6.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: all tests PASS including the new localized-label test.

- [ ] **Step 4.5: Run the full documents test suite**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/features/documents/ --reporter=verbose 2>&1 | tail -30
```

Expected: all green.

- [ ] **Step 4.6: Commit**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && git add src/features/documents/DrawingDetailDrawer.tsx src/features/documents/__tests__/DrawingsD6.test.tsx && git commit -m "$(cat <<'EOF'
fix(drawings): localize status enum in DrawingDetailDrawer linked-changes

DrawingDetailDrawer was passing raw sc.status ('new'/'linked'/'resolved')
as the StatusPill label, leaking the backend enum to the UI.
Now uses sitechanges.badge.* keys (en+hi) for consistent localization,
matching SiteChangeCard and SiteChangeDrawer.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Verify — Final gate

- [ ] **V1: Full test suite**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run --reporter=verbose 2>&1 | tail -50
```

Expected: all green.

- [ ] **V2: TypeScript build**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npm run typecheck 2>&1 | tail -30
```

Expected: no errors.

- [ ] **V3: Lint**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npm run lint 2>&1 | tail -20
```

Expected: no errors.

- [ ] **V4: Production build**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npm run build 2>&1 | tail -20
```

Expected: build completes, no errors.

- [ ] **V5: Budget check**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npm run budget 2>&1 | tail -20
```

Expected: OK.

- [ ] **V6: i18n parity check**

```bash
cd /Users/aryantripathi/Developer/contructionAI/constructo/web && npx vitest run src/i18n/i18n.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: all green (en and hi have the same keys).

---

## Self-review

**Spec coverage check:**

| Item | Covered? |
|---|---|
| 1. SiteChanges `max-w-2xl` removed in workspace mode | Task 1, Step 1.3 — outer div changed to `flex flex-col gap-6` |
| 1. All three panels get consistent `max-w-3xl mx-auto` wrapper | Task 1, Step 1.5 |
| 1. SiteChanges own H1 removed in workspace mode | Task 1, Step 1.3 — gated behind `!externalSiteId` |
| 1. SiteChanges own site-select removed in workspace mode | Already gated by `showSiteSelector = !externalSiteId` — no change needed |
| 1. Standalone fallback kept | Yes — H1 + select still render when `externalSiteId` is absent |
| 2. Linked drawing chip is a `<Link to="/settings/documents">` | Task 2, Step 2.3 |
| 2. Proper focus ring | Task 2, Step 2.3 — `focus-visible:ring-2 focus-visible:ring-primary` |
| 2. Accessible label | Task 2, Step 2.3 — `aria-label` using new i18n key |
| 3. "View in Selections" button after materialize | Task 3, Step 3.4 |
| 3. Clicking it switches to `?tab=selections` | Task 3, Step 3.5 — calls `setActiveTab(TAB_SELECTIONS)` |
| 4. DrawingDetailDrawer uses localized status labels | Task 4, Step 4.3 |
| 4. en+hi parity for new keys | Task 2 Step 2.4 + Task 3 Step 3.3 add keys in both |
| TDD (test before impl) | Each task has Step N.1/N.2 write+fail-confirm before implement |
| 4 commits (one per item) | Each task ends with a commit step |

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `SC_STATUS_LABEL` uses `Parameters<typeof t>[0]` which is `TranslationKey` — the same pattern used in `SiteChangeCard` and `Intake`. `onViewSelections?: () => void` is passed through cleanly.

**Test breakage check:**
- `SiteChanges.test.tsx` test 2 (badge in header): updated in Step 1.4 to use standalone mode — the badge is still tested, just in the correct mode.
- `DrawingsD6.test.tsx` test 3 (status pill): existing regex `/^linked$/i` still matches `'Linked'` (case-insensitive). New stricter test added. No regression.
- All existing `Intake.test.tsx` tests: `onViewSelections` is optional, so all existing render calls without it still work.
