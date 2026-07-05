/**
 * D4 DesignerWorkspace tests.
 *
 * Covers:
 *   1. Renders three workspace tabs (Selections / Site changes / Intake)
 *   2. Default tab is Selections — Selections panel is shown
 *   3. Clicking "Site changes" switches panel + updates ?tab URL param
 *   4. Clicking "Intake" shows the placeholder
 *   5. Tab a11y: role="tablist", aria-selected on active tab, role="tabpanel"
 *   6. siteId flows down to child surfaces (Selections receives the site id)
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import { ToastProvider } from '../../../ui/Toast'

// ---------------------------------------------------------------------------
// Mock child surfaces so the test stays focused on the shell
// ---------------------------------------------------------------------------

const MOCK_SITE_ID_RECEIVED: string[] = []

vi.mock('../Selections', () => ({
  Selections: ({ siteId }: { siteId?: string }) => {
    if (siteId) MOCK_SITE_ID_RECEIVED.push(siteId)
    return <div data-testid="selections-surface">Selections (siteId={siteId})</div>
  },
}))

vi.mock('../SiteChanges', () => ({
  SiteChanges: ({ siteId }: { siteId?: string }) => (
    <div data-testid="site-changes-surface">Site Changes (siteId={siteId})</div>
  ),
}))

vi.mock('../Intake', () => ({
  Intake: ({ siteId }: { siteId?: string }) => (
    <div data-testid="intake-surface">Intake (siteId={siteId})</div>
  ),
}))

// ---------------------------------------------------------------------------
// Mock useMeRole → architect
// ---------------------------------------------------------------------------

vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => 'architect' as string | undefined,
  useCan: () => false,
}))

// ---------------------------------------------------------------------------
// Mock useSites
// ---------------------------------------------------------------------------

const MOCK_SITES = {
  items: [
    { id: 'site-abc', name: 'Tripathi Residence', status: 'active' },
    { id: 'site-xyz', name: 'Green Valley', status: 'active' },
  ],
  next_cursor: null,
}

vi.mock('../../../api/hooks', () => ({
  useSites: () => ({
    data: MOCK_SITES,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Mock useUnreadCount (AppShell needs it)
// ---------------------------------------------------------------------------

vi.mock('../../../features/notifications/useUnreadCount', () => ({
  useUnreadCount: () => ({ data: 0 }),
}))

// ---------------------------------------------------------------------------
// Mock designApi.inboxSummary — default: reject (endpoint unavailable → no
// badge, so the exact-name 'Intake' assertions above stay valid). The badge
// test overrides with a resolved summary before rendering.
// ---------------------------------------------------------------------------

const inboxSummaryMock = vi.fn().mockRejectedValue(new Error('unavailable'))
vi.mock('../../../api/design', () => ({
  designApi: { inboxSummary: (...a: unknown[]) => inboxSummaryMock(...a) },
}))

// ---------------------------------------------------------------------------
// Dynamic import after mocks
// ---------------------------------------------------------------------------

const { DesignerWorkspace } = await import('../DesignerWorkspace')

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderWorkspace(initialSearch = '') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { role: 'architect' })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter initialEntries={[`/designer${initialSearch}`]}>
          <ToastProvider>
            <DesignerWorkspace />
          </ToastProvider>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DesignerWorkspace (D4)', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Renders three workspace tabs
  // ─────────────────────────────────────────────────────────────────────────

  it('renders the three workspace tabs', () => {
    renderWorkspace()
    const tablist = screen.getByRole('tablist', { name: 'Designer' })
    expect(tablist).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Selections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Site changes' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Intake' })).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Default tab is Selections — Selections panel is shown
  // ─────────────────────────────────────────────────────────────────────────

  it('defaults to the Selections tab and shows the Selections panel', () => {
    renderWorkspace()
    // Selections tab is aria-selected=true
    expect(screen.getByRole('tab', { name: 'Selections' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // Selections surface is rendered
    expect(screen.getByTestId('selections-surface')).toBeInTheDocument()
    // Site-changes panel is hidden (not rendered in default tab)
    expect(screen.queryByTestId('site-changes-surface')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Clicking "Site changes" switches panel
  // ─────────────────────────────────────────────────────────────────────────

  it('clicking "Site changes" tab renders the SiteChanges panel', async () => {
    renderWorkspace()

    await userEvent.click(screen.getByRole('tab', { name: 'Site changes' }))

    // aria-selected updated
    expect(screen.getByRole('tab', { name: 'Site changes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Selections' })).toHaveAttribute(
      'aria-selected',
      'false',
    )

    // SiteChanges surface rendered
    expect(screen.getByTestId('site-changes-surface')).toBeInTheDocument()
    // Selections surface no longer rendered
    expect(screen.queryByTestId('selections-surface')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Clicking "Intake" shows the placeholder
  // ─────────────────────────────────────────────────────────────────────────

  it('clicking "Intake" shows the Intake surface', async () => {
    renderWorkspace()

    await userEvent.click(screen.getByRole('tab', { name: 'Intake' }))

    expect(screen.getByRole('tab', { name: 'Intake' })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // Intake surface rendered (mocked)
    expect(screen.getByTestId('intake-surface')).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Tab a11y: role="tablist", aria-selected, role="tabpanel"
  // ─────────────────────────────────────────────────────────────────────────

  it('has correct WAI-ARIA structure (tablist, tabs, tabpanels)', () => {
    renderWorkspace()

    // tablist
    expect(screen.getByRole('tablist')).toBeInTheDocument()

    // tabs — all three
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)

    // Only the active tab is aria-selected=true
    const selectedTabs = tabs.filter((t) => t.getAttribute('aria-selected') === 'true')
    expect(selectedTabs).toHaveLength(1)
    expect(selectedTabs[0]).toHaveTextContent('Selections')

    // tabpanel present (only the active panel is rendered)
    const panels = screen.getAllByRole('tabpanel')
    expect(panels.length).toBeGreaterThanOrEqual(1)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 6. siteId flows down to Selections surface
  // ─────────────────────────────────────────────────────────────────────────

  it('passes the first site id to the Selections surface by default', () => {
    renderWorkspace()
    // The mock Selections renders "Selections (siteId=<id>)"
    expect(screen.getByTestId('selections-surface')).toHaveTextContent('site-abc')
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 7. ?tab=site-changes initial URL renders the SiteChanges panel directly
  // ─────────────────────────────────────────────────────────────────────────

  it('respects ?tab= URL param: ?tab=site-changes renders SiteChanges on load', () => {
    renderWorkspace('?tab=site-changes')

    expect(screen.getByRole('tab', { name: 'Site changes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByTestId('site-changes-surface')).toBeInTheDocument()
    expect(screen.queryByTestId('selections-surface')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Arrow-key navigation works on the TabBar inside the workspace
  // ─────────────────────────────────────────────────────────────────────────

  it('ArrowRight moves from Selections to Site-changes tab', async () => {
    // Use default render — then navigate with arrow key on the active tab
    renderWorkspace()

    const selectionsTab = screen.getByRole('tab', { name: 'Selections' })
    selectionsTab.focus()

    await userEvent.keyboard('{ArrowRight}')

    // After ArrowRight, Site changes should be activated
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Site changes' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Invalid ?tab= falls back to selections
  // ─────────────────────────────────────────────────────────────────────────

  it('falls back to Selections for an unknown ?tab= value', () => {
    renderWorkspace('?tab=garbage')

    expect(screen.getByRole('tab', { name: 'Selections' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByTestId('selections-surface')).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Inbox badge: Intake tab label carries the summed count when > 0
  // ─────────────────────────────────────────────────────────────────────────

  it('suffixes the Intake tab with the inbox count when something waits', async () => {
    inboxSummaryMock.mockResolvedValueOnce({
      briefs_awaiting_signoff: 1,
      answered_clarifications: 2,
      deferred_conflicts: 0,
    })
    renderWorkspace()
    expect(await screen.findByRole('tab', { name: 'Intake (3)' })).toBeInTheDocument()
  })

  it('keeps the plain Intake label when the inbox fetch fails', async () => {
    // default mock rejects — the label must stay un-suffixed
    renderWorkspace()
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Intake' })).toBeInTheDocument(),
    )
  })
})
