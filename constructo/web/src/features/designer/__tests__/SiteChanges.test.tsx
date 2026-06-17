/**
 * D3 Site Changes surface tests.
 *
 * Covers:
 *  1. Feed renders with status pills and the "N new" badge
 *  2. Status filter changes the query options
 *  3. Card click opens Drawer with the field note + actions
 *  4. Save impact → siteChangesApi.update(id, {impact}) called + toast
 *  5. Link to drawing → picker shows drawings → choice → update called (status promotes)
 *  6. Resolve → ConfirmDialog → confirm → update(id, {status:'resolved'}) called + toast
 *  7. Non-reviewer role (supervisor) sees read-only notice, no actions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import { ToastProvider } from '../../../ui/Toast'

// ---------------------------------------------------------------------------
// Mock siteChangesApi BEFORE importing the SUT (vi.mock is hoisted)
// ---------------------------------------------------------------------------

const mockUpdate = vi.fn()
const mockList = vi.fn()

const MOCK_CHANGES = [
  {
    id: 'sc-1',
    company_id: 'co-1',
    site_id: 'site-1',
    room: 'Master Bedroom',
    title: 'Beam shifted 200mm east',
    note: 'Structural beam at grid C-3 is 200mm east of the drawing. Ceiling and AC duct routing affected.',
    impact: null,
    photo_url: 'https://example.com/photo.jpg',
    reported_by: 'aaaaaaaa-0000-0000-0000-000000000001',
    reported_by_name: 'Rajan',
    status: 'new' as const,
    linked_drawing_id: null,
    created_at: '2026-06-13T09:15:00Z',
    resolved_at: null,
  },
  {
    id: 'sc-2',
    company_id: 'co-1',
    site_id: 'site-1',
    room: 'Kitchen',
    title: 'Window sill at 800mm instead of 900mm',
    note: 'Owner requested window sill height at 800mm. Tile layout needs revision.',
    impact: 'Kitchen tile layout revised.',
    photo_url: null,
    reported_by: 'aaaaaaaa-0000-0000-0000-000000000002',
    reported_by_name: 'Supervisor Mukesh',
    status: 'linked' as const,
    linked_drawing_id: 'drw-1',
    created_at: '2026-06-10T14:30:00Z',
    resolved_at: null,
  },
  {
    id: 'sc-3',
    company_id: 'co-1',
    site_id: 'site-1',
    room: 'Living Room',
    title: 'False ceiling dropped — column clash',
    note: 'False ceiling at 2750mm clashes with existing column on grid A-2.',
    impact: 'False ceiling notched around column. Light cove FL-07 updated.',
    photo_url: null,
    reported_by: 'aaaaaaaa-0000-0000-0000-000000000001',
    reported_by_name: 'Rajan',
    status: 'resolved' as const,
    linked_drawing_id: 'drw-2',
    created_at: '2026-06-08T11:00:00Z',
    resolved_at: '2026-06-11T16:45:00Z',
  },
]

vi.mock('../../../api/siteChanges', () => ({
  siteChangesApi: {
    list: (...a: unknown[]) => mockList(...a),
    get: vi.fn(),
    update: (...a: unknown[]) => mockUpdate(...a),
  },
}))

// ---------------------------------------------------------------------------
// Mock drawingsApi for the link picker
// ---------------------------------------------------------------------------

const MOCK_DRAWINGS = [
  {
    id: 'drw-1',
    site_id: 'site-1',
    title: 'Ground Floor Plan',
    version: 'v2',
    kind: 'plan' as const,
    change_note: 'Kitchen enlarged',
    published_at: '2026-06-01T14:30:00Z',
    supersedes_id: 'drw-old-1',
    site_name: 'Tripathi Residence',
    is_current: true,
    file_url: 'mock-key/ground-floor-plan-v2.pdf',
  },
  {
    id: 'drw-2',
    site_id: 'site-1',
    title: 'North Elevation',
    version: 'v1',
    kind: 'elevation' as const,
    change_note: null,
    published_at: '2026-06-10T09:15:00Z',
    supersedes_id: null,
    site_name: 'Tripathi Residence',
    is_current: true,
    file_url: 'mock-key/north-elevation-v1.pdf',
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

// ---------------------------------------------------------------------------
// Mock useMeRole
// ---------------------------------------------------------------------------

const mockUseMeRole = vi.fn().mockReturnValue('architect' as string | undefined)

vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => mockUseMeRole(),
  useCan: () => false,
}))

// ---------------------------------------------------------------------------
// Mock useSites
// ---------------------------------------------------------------------------

vi.mock('../../../api/hooks', () => ({
  useSites: () => ({
    data: {
      items: [{ id: 'site-1', name: 'Tripathi Residence', status: 'active' }],
      next_cursor: null,
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Lazy import AFTER mocks
// ---------------------------------------------------------------------------

const { SiteChanges } = await import('../SiteChanges')

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderSiteChanges(siteId?: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { role: mockUseMeRole() })

  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <ToastProvider>
            <SiteChanges siteId={siteId} />
          </ToastProvider>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SiteChanges surface (D3)', () => {
  beforeEach(() => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    // Return all changes by default
    mockList.mockResolvedValue(MOCK_CHANGES)
    mockUpdate.mockResolvedValue({ ...MOCK_CHANGES[0], impact: 'Updated impact' })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Feed renders with status pills and "N new" badge
  // ─────────────────────────────────────────────────────────────────────────

  it('renders the feed with status pills for each change', async () => {
    renderSiteChanges()

    // Title renders
    expect(await screen.findByText('Beam shifted 200mm east')).toBeInTheDocument()
    expect(screen.getByText('Window sill at 800mm instead of 900mm')).toBeInTheDocument()
    expect(screen.getByText('False ceiling dropped — column clash')).toBeInTheDocument()

    // Status pills (New / Linked / Resolved)
    expect(screen.getAllByText('New').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Linked').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Resolved').length).toBeGreaterThan(0)
  })

  it('shows the "N new" needs-you badge in the header', async () => {
    // newCount computed from all changes (not filtered): 1 new
    renderSiteChanges(undefined)  // standalone mode — no siteId prop, badge renders

    // Wait for data to load
    await screen.findByText('Beam shifted 200mm east')

    // The badge shows "1 new"
    const badge = await screen.findByTestId('new-count-badge')
    expect(badge).toBeInTheDocument()
    expect(badge.textContent).toMatch(/1/)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Status filter tabs change the query
  // ─────────────────────────────────────────────────────────────────────────

  it('status filter tabs trigger the correct query options', async () => {
    mockList.mockResolvedValue(MOCK_CHANGES)
    renderSiteChanges()

    // Wait for initial load
    await screen.findByText('Beam shifted 200mm east')

    // Click the "New" tab
    const newTab = screen.getByRole('tab', { name: /^New$/i })
    await userEvent.click(newTab)
    expect(newTab).toHaveAttribute('aria-selected', 'true')

    // siteChangesApi.list should have been called with status: 'new' at some point
    await waitFor(() => {
      const calls = mockList.mock.calls
      const filteredCall = calls.find(
        (c) => c[0]?.status === 'new' && c[0]?.siteId === 'site-1',
      )
      expect(filteredCall).toBeDefined()
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Card click → Drawer opens with note + actions
  // ─────────────────────────────────────────────────────────────────────────

  it('clicking a card opens the Drawer with the field note and actions', async () => {
    renderSiteChanges()

    await screen.findByText('Beam shifted 200mm east')

    // Click the first card (sc-1)
    await userEvent.click(screen.getByTestId('sc-card-sc-1'))

    // Drawer opens
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Full note visible in the drawer
    expect(within(dialog).getByText(/Structural beam at grid C-3/i)).toBeInTheDocument()

    // Impact textarea visible (architect role)
    expect(within(dialog).getByTestId('impact-textarea')).toBeInTheDocument()

    // Save impact button
    expect(within(dialog).getByTestId('save-impact-btn')).toBeInTheDocument()

    // Resolve button
    expect(within(dialog).getByTestId('resolve-btn')).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Save impact → update(id, {impact}) + toast
  // ─────────────────────────────────────────────────────────────────────────

  it('saves an impact note and shows a toast', async () => {
    mockUpdate.mockResolvedValue({ ...MOCK_CHANGES[0], impact: 'Ceiling shifted north.' })
    renderSiteChanges()

    await screen.findByText('Beam shifted 200mm east')
    await userEvent.click(screen.getByTestId('sc-card-sc-1'))
    await screen.findByRole('dialog')

    // Type in the impact textarea
    const textarea = screen.getByTestId('impact-textarea')
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Ceiling shifted north.')

    // Click Save
    await userEvent.click(screen.getByTestId('save-impact-btn'))

    // update called with impact
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('sc-1', { impact: 'Ceiling shifted north.' }),
    )

    // Toast: "Impact note saved."
    await waitFor(() =>
      expect(screen.getByText(/Impact note saved/i)).toBeInTheDocument(),
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Link to drawing → picker shows drawings → pick → update called + status promote
  // ─────────────────────────────────────────────────────────────────────────

  it('link-to-drawing picker shows drawings and calls update with linked_drawing_id', async () => {
    mockUpdate.mockResolvedValue({
      ...MOCK_CHANGES[0],
      status: 'linked' as const,
      linked_drawing_id: 'drw-1',
    })
    renderSiteChanges()

    await screen.findByText('Beam shifted 200mm east')
    // Open sc-1 (status: new, no linked drawing)
    await userEvent.click(screen.getByTestId('sc-card-sc-1'))
    await screen.findByRole('dialog')

    // Drawing select is visible in the drawer
    const drawingSelect = await screen.findByTestId('drawing-link-select')
    expect(drawingSelect).toBeInTheDocument()

    // Options: Ground Floor Plan v2 + North Elevation v1
    expect(within(drawingSelect).getByText(/Ground Floor Plan v2/i)).toBeInTheDocument()
    expect(within(drawingSelect).getByText(/North Elevation v1/i)).toBeInTheDocument()

    // Select "Ground Floor Plan v2"
    fireEvent.change(drawingSelect, { target: { value: 'drw-1' } })

    // Click Link drawing
    const linkBtn = screen.getByTestId('link-drawing-btn')
    await userEvent.click(linkBtn)

    // update called with linked_drawing_id
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('sc-1', { linked_drawing_id: 'drw-1' }),
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Resolve → ConfirmDialog → confirm → update called + toast
  // ─────────────────────────────────────────────────────────────────────────

  it('resolve flow: ConfirmDialog → confirm → update(id, {status:"resolved"}) + toast', async () => {
    mockUpdate.mockResolvedValue({
      ...MOCK_CHANGES[0],
      status: 'resolved' as const,
      resolved_at: '2026-06-14T10:00:00Z',
    })
    renderSiteChanges()

    await screen.findByText('Beam shifted 200mm east')
    await userEvent.click(screen.getByTestId('sc-card-sc-1'))
    await screen.findByRole('dialog')

    // Click Resolve
    await userEvent.click(screen.getByTestId('resolve-btn'))

    // ConfirmDialog appears
    const confirmDialog = await screen.findByRole('dialog', {
      name: /Resolve this change/i,
    })
    expect(confirmDialog).toBeInTheDocument()

    // Click the confirm CTA "Resolve"
    await userEvent.click(
      within(confirmDialog).getByRole('button', { name: /^Resolve$/i }),
    )

    // update called with status: 'resolved'
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('sc-1', { status: 'resolved' }),
    )

    // Toast: "Site change resolved."
    await waitFor(() =>
      expect(screen.getByText(/Site change resolved/i)).toBeInTheDocument(),
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Non-reviewer role (supervisor) — read-only notice, no actions
  // ─────────────────────────────────────────────────────────────────────────

  it('supervisor (non-reviewer) sees read-only notice, no impact/link/resolve actions', async () => {
    mockUseMeRole.mockReturnValue('supervisor' as string | undefined)
    renderSiteChanges()

    await screen.findByText('Beam shifted 200mm east')
    await userEvent.click(screen.getByTestId('sc-card-sc-1'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Read-only notice visible
    expect(
      within(dialog).getByText(/View only — only the architect/i),
    ).toBeInTheDocument()

    // No impact textarea
    expect(within(dialog).queryByTestId('impact-textarea')).not.toBeInTheDocument()

    // No save impact button
    expect(within(dialog).queryByTestId('save-impact-btn')).not.toBeInTheDocument()

    // No resolve button
    expect(within(dialog).queryByTestId('resolve-btn')).not.toBeInTheDocument()

    // No drawing link picker
    expect(within(dialog).queryByTestId('drawing-link-select')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Resolved change — no further actions, shows resolved state
  // ─────────────────────────────────────────────────────────────────────────

  it('resolved change shows done state (no resolve button, no impact editor)', async () => {
    renderSiteChanges()

    await screen.findByText('False ceiling dropped — column clash')
    // sc-3 is resolved
    await userEvent.click(screen.getByTestId('sc-card-sc-3'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Resolved state card visible
    expect(within(dialog).getByText(/This change has been resolved/i)).toBeInTheDocument()

    // No resolve button
    expect(within(dialog).queryByTestId('resolve-btn')).not.toBeInTheDocument()

    // No impact textarea
    expect(within(dialog).queryByTestId('impact-textarea')).not.toBeInTheDocument()

    // Impact text still visible (read-only)
    expect(within(dialog).getByText(/False ceiling notched around column/i)).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Resolved change with linked_drawing_id shows drawing title, not raw UUID
  // ─────────────────────────────────────────────────────────────────────────

  it('resolved change with linked_drawing_id shows the drawing title+version, not the raw UUID', async () => {
    renderSiteChanges()

    // Wait for the feed to load
    await screen.findByText('False ceiling dropped — column clash')

    // sc-3 is resolved with linked_drawing_id: 'drw-2' (North Elevation v1 in MOCK_DRAWINGS)
    await userEvent.click(screen.getByTestId('sc-card-sc-3'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // The resolved-linked-drawing widget should show the drawing title, not the raw id
    const linkedDrawingWidget = await screen.findByTestId('resolved-linked-drawing')
    expect(linkedDrawingWidget).toBeInTheDocument()

    // Title is visible
    expect(within(linkedDrawingWidget).getByText('North Elevation')).toBeInTheDocument()

    // Raw UUID is NOT visible anywhere in the drawer
    expect(within(dialog).queryByText('drw-2')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Empty state when no changes
  // ─────────────────────────────────────────────────────────────────────────

  it('shows an honest empty state when there are no changes', async () => {
    mockList.mockResolvedValue([])
    renderSiteChanges()

    await waitFor(() =>
      expect(screen.getByText('No site changes')).toBeInTheDocument(),
    )
    expect(
      screen.getByText(/When a site engineer reports a condition change/i),
    ).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 11. reported_by_name: card shows name, never raw UUID
  // ─────────────────────────────────────────────────────────────────────────

  it('card shows reported_by_name ("Rajan"), not the raw UUID', async () => {
    renderSiteChanges()
    await screen.findByText('Beam shifted 200mm east')

    // "Reported by Rajan" appears on one or more cards
    expect(screen.getAllByText(/Reported by Rajan/i).length).toBeGreaterThan(0)

    // The raw UUID must NOT appear anywhere
    expect(screen.queryByText('aaaaaaaa-0000-0000-0000-000000000001')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 12. reported_by_name: drawer shows name, never raw UUID
  // ─────────────────────────────────────────────────────────────────────────

  it('drawer shows reported_by_name ("Rajan"), not the raw UUID', async () => {
    renderSiteChanges()
    await screen.findByText('Beam shifted 200mm east')
    await userEvent.click(screen.getByTestId('sc-card-sc-1'))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Name appears in the meta row
    expect(within(dialog).getByText('Rajan')).toBeInTheDocument()

    // Raw UUID must NOT appear
    expect(within(dialog).queryByText('aaaaaaaa-0000-0000-0000-000000000001')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 13. reported_by_name null → fallback label "Site team" (never renders UUID)
  // ─────────────────────────────────────────────────────────────────────────

  it('null reported_by_name shows fallback label "Site team", never a UUID', async () => {
    const withNullReporter = [
      {
        ...MOCK_CHANGES[0],
        id: 'sc-null',
        reported_by: 'bbbbbbbb-0000-0000-0000-000000000099',
        reported_by_name: null,
      },
    ]
    mockList.mockResolvedValue(withNullReporter)
    renderSiteChanges()

    await screen.findByText('Beam shifted 200mm east')

    // Fallback label appears on the card
    expect(screen.getByText(/Site team/i)).toBeInTheDocument()

    // The raw UUID must NOT appear anywhere
    expect(screen.queryByText('bbbbbbbb-0000-0000-0000-000000000099')).not.toBeInTheDocument()

    // Open the drawer and check there too
    await userEvent.click(screen.getByTestId('sc-card-sc-null'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Site team/i)).toBeInTheDocument()
    expect(within(dialog).queryByText('bbbbbbbb-0000-0000-0000-000000000099')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 14. Workspace mode (siteId prop) — no internal H1 or site-select
  // ─────────────────────────────────────────────────────────────────────────

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
})
