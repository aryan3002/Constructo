/**
 * D2 Selections cockpit tests.
 *
 * Covers:
 *   1. Room-grouped rendering + correct lifecycle pills
 *   2. Summary chips (grand total, awaiting-owner count, ready-to-release, unpriced)
 *   3. Row click opens the Drawer with spec detail
 *   4. Role-shaping:
 *        as architect — draft shows "Route to owner", out_for_approval shows
 *                       "Awaiting owner sign-off" (no Approve button)
 *        as owner     — out_for_approval shows Approve form + Return button
 *   5. Route action: click Route → confirm → specsApi.route called → toast
 *   6. Approve action (owner): enter client_final_code + Approve →
 *        specsApi.approve(id, {status:'approved', client_final_code}) called
 *   7. Keyboard: ↑/↓ moves selection, Enter opens drawer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import { ToastProvider } from '../../../ui/Toast'
// React import required for JSX in the vi.mock factory
import type {} from 'react'

// ---------------------------------------------------------------------------
// Mock specsApi BEFORE importing the SUT (vi.mock is hoisted)
// ---------------------------------------------------------------------------

const mockRoute   = vi.fn()
const mockApprove = vi.fn()
const mockRelease = vi.fn()
const mockUpdate  = vi.fn()

/**
 * desk() returns a roster with one line in each of the 5 lifecycle states
 * and one unpriced line (no unit_rate). Groups:
 *   Living Room:     s1 (draft), s2 (out_for_approval)
 *   Master Bedroom:  s3 (approved), s4 (released)
 *   Kitchen:         s5 (returned), s6 (unpriced draft)
 */
const MOCK_DESK = {
  grand_total: '99660',
  excluded_total: 1,
  rooms: [
    {
      room: 'Living Room',
      total: '73260',
      excluded: 0,
      lines: [
        {
          id: 's1',
          element: 'Vitrified Tile',
          location: 'Floor',
          category: 'Floor',
          brand: 'Kajaria',
          sku: 'KJR-001',
          colour: 'Ivory',
          finish: 'Matt',
          qty: '450',
          unit: 'Sq Ft',
          wastage_pct: '10',
          unit_rate: '120',
          line_total: '59400',
          approval_status: 'pending' as const,
          client_final_code: null,
          routing_status: 'draft' as const,
          sent_at: null,
          released_at: null,
          notes: null,
          material_id: 'mat1',
        },
        {
          id: 's2',
          element: 'Decorative Panel',
          location: 'Feature Wall',
          category: 'Wall',
          brand: 'Merino',
          sku: 'MER-002',
          colour: 'Charcoal',
          finish: 'Gloss',
          qty: '120',
          unit: 'Sq Ft',
          wastage_pct: '10',
          unit_rate: '120',
          line_total: '15840',
          approval_status: 'pending' as const,
          client_final_code: null,
          routing_status: 'out_for_approval' as const,
          sent_at: '2026-06-10T08:00:00Z',
          released_at: null,
          notes: 'Match reference image #4',
          material_id: 'mat2',
        },
      ],
    },
    {
      room: 'Master Bedroom',
      total: '24750',
      excluded: 0,
      lines: [
        {
          id: 's3',
          element: 'Laminate',
          location: 'Wardrobe Shutter',
          category: 'Joinery',
          brand: 'Greenlam',
          sku: 'GL-9006-02',
          colour: 'Walnut',
          finish: 'Texture',
          qty: '180',
          unit: 'Sq Ft',
          wastage_pct: '10',
          unit_rate: '95',
          line_total: '18810',
          approval_status: 'approved' as const,
          client_final_code: 'OS-9006-02',
          routing_status: 'approved' as const,
          sent_at: '2026-06-08T09:00:00Z',
          released_at: null,
          notes: null,
          material_id: 'mat3',
        },
        {
          id: 's4',
          element: 'Paint',
          location: 'Wall General',
          category: 'Finish',
          brand: 'Asian Paints',
          sku: 'AP-W-7002',
          colour: 'Almond White',
          finish: 'Emulsion',
          qty: '780',
          unit: 'Sq Ft',
          wastage_pct: '10',
          unit_rate: '18',
          line_total: '15444',
          approval_status: 'approved' as const,
          client_final_code: 'AP-W-7002',
          routing_status: 'released' as const,
          sent_at: '2026-06-07T09:00:00Z',
          released_at: '2026-06-11T12:00:00Z',
          notes: null,
          material_id: 'mat4',
        },
      ],
    },
    {
      room: 'Kitchen',
      total: '21000',
      excluded: 1,
      lines: [
        {
          id: 's5',
          element: 'Granite',
          location: 'Counter',
          category: 'Stone',
          brand: 'Granite World',
          sku: 'GW-BLK-01',
          colour: 'Black Galaxy',
          finish: 'Polished',
          qty: '60',
          unit: 'Sq Ft',
          wastage_pct: '5',
          unit_rate: '350',
          line_total: '22050',
          approval_status: 'rejected' as const,
          client_final_code: null,
          routing_status: 'returned' as const,
          sent_at: '2026-06-09T09:00:00Z',
          released_at: null,
          notes: 'Client wants a warmer tone — revise',
          material_id: 'mat5',
        },
        {
          id: 's6',
          element: 'Backsplash Tile',
          location: null,
          category: 'Wall',
          brand: null,
          sku: null,
          colour: null,
          finish: null,
          qty: '45',
          unit: 'Sq Ft',
          wastage_pct: null,
          unit_rate: null,        // unpriced
          line_total: null,
          approval_status: 'pending' as const,
          client_final_code: null,
          routing_status: 'draft' as const,
          sent_at: null,
          released_at: null,
          notes: null,
          material_id: null,
        },
      ],
    },
  ],
}

vi.mock('../../../api/specs', () => ({
  specsApi: {
    desk:    vi.fn().mockResolvedValue(MOCK_DESK),
    route:   (...a: unknown[]) => mockRoute(...a),
    approve: (...a: unknown[]) => mockApprove(...a),
    release: (...a: unknown[]) => mockRelease(...a),
    update:  (...a: unknown[]) => mockUpdate(...a),
  },
}))

// ---------------------------------------------------------------------------
// Mock useMeRole so tests can control role without an auth server
// ---------------------------------------------------------------------------

const mockUseMeRole = vi.fn().mockReturnValue('architect' as string | undefined)

vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => mockUseMeRole(),
  useCan: () => false,
}))

// ---------------------------------------------------------------------------
// Mock useSites (not the focus but must not throw)
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
// Dynamic import AFTER mocks
// ---------------------------------------------------------------------------

const { Selections } = await import('../Selections')

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderSelections(siteId = 'site-1') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  // Pre-seed the me query so useMeRole hook doesn't hit network
  qc.setQueryData(['me'], { role: mockUseMeRole() })

  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <ToastProvider>
            <Selections siteId={siteId} />
          </ToastProvider>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

// Simulate a keyboard event on the window
function press(key: string, opts: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Selections cockpit (D2)', () => {
  beforeEach(() => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    mockRoute.mockResolvedValue({ id: 's1', routing_status: 'out_for_approval' })
    mockApprove.mockResolvedValue({ id: 's2', routing_status: 'approved' })
    mockRelease.mockResolvedValue({ id: 's3', routing_status: 'released' })
    mockUpdate.mockResolvedValue({ id: 's1' })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Room grouping + lifecycle pills
  // ─────────────────────────────────────────────────────────────────────────

  it('renders room sections with correct lifecycle status pills', async () => {
    renderSelections()

    // Rooms are rendered as section headings
    expect(await screen.findByText('Living Room')).toBeInTheDocument()
    expect(screen.getByText('Master Bedroom')).toBeInTheDocument()
    expect(screen.getByText('Kitchen')).toBeInTheDocument()

    // Lines are rendered
    expect(screen.getByText('Vitrified Tile')).toBeInTheDocument()   // s1 draft
    expect(screen.getByText('Decorative Panel')).toBeInTheDocument() // s2 out_for_approval
    expect(screen.getByText('Laminate')).toBeInTheDocument()         // s3 approved
    expect(screen.getByText('Paint')).toBeInTheDocument()            // s4 released
    expect(screen.getByText('Granite')).toBeInTheDocument()          // s5 returned

    // Lifecycle pills — check each mapping
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Awaiting owner').length).toBeGreaterThan(0)
    // "Approved" pill appears for s3
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0)
    // "Released" pill for s4
    expect(screen.getAllByText('Released').length).toBeGreaterThan(0)
    // "Returned" pill for s5
    expect(screen.getAllByText('Returned').length).toBeGreaterThan(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Summary chips — deterministic computation
  // ─────────────────────────────────────────────────────────────────────────

  it('computes summary chips correctly from desk data', async () => {
    renderSelections()
    await screen.findByText('Living Room')

    // Grand total chip should show the formatted number
    // The mock has grand_total = '99660' → ₹99,660
    expect(screen.getByText(/Grand total/i)).toBeInTheDocument()
    expect(screen.getByText(/₹99,660/i)).toBeInTheDocument()

    // Awaiting owner: s2 is out_for_approval → 1 awaiting
    expect(screen.getByText(/1 awaiting owner/i)).toBeInTheDocument()

    // Ready to release: s3 is approved → 1 ready
    expect(screen.getByText(/1 ready to release/i)).toBeInTheDocument()

    // Unpriced: s6 has null unit_rate → 1 unpriced (chip in rollup + room header)
    expect(screen.getAllByText(/1 unpriced/i).length).toBeGreaterThan(0)
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Row click opens the Drawer with spec detail
  // ─────────────────────────────────────────────────────────────────────────

  it('clicking a row opens the Drawer with the spec detail', async () => {
    renderSelections()
    await screen.findByText('Vitrified Tile')

    // Click s1 row (Vitrified Tile)
    await userEvent.click(screen.getByTestId('spec-row-s1'))

    // Drawer title = element + room
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Vitrified Tile/i, { selector: 'h2' })).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 4a. Role-shaping: architect + draft → "Route to owner" visible
  // ─────────────────────────────────────────────────────────────────────────

  it('architect sees "Route to owner" for a draft spec', async () => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    renderSelections()
    await screen.findByText('Vitrified Tile')

    // Open s1 (draft)
    await userEvent.click(screen.getByTestId('spec-row-s1'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('button', { name: /Route to owner/i })).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 4b. Role-shaping: architect + out_for_approval → "Awaiting sign-off", NO Approve
  // ─────────────────────────────────────────────────────────────────────────

  it('architect sees "Awaiting owner sign-off" for an out_for_approval spec (no Approve button)', async () => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    renderSelections()
    await screen.findByText('Decorative Panel')

    // Open s2 (out_for_approval)
    await userEvent.click(screen.getByTestId('spec-row-s2'))
    const dialog = await screen.findByRole('dialog')

    // Awaiting text visible
    expect(within(dialog).getByText(/Awaiting owner sign-off/i)).toBeInTheDocument()

    // No Approve button
    expect(within(dialog).queryByRole('button', { name: /^Approve$/i })).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 4c. Role-shaping: owner + out_for_approval → Approve form + Return button
  // ─────────────────────────────────────────────────────────────────────────

  it('owner sees Approve form (with code input) + Return button for out_for_approval spec', async () => {
    mockUseMeRole.mockReturnValue('owner' as string | undefined)
    renderSelections()
    await screen.findByText('Decorative Panel')

    // Open s2 (out_for_approval)
    await userEvent.click(screen.getByTestId('spec-row-s2'))
    const dialog = await screen.findByRole('dialog')

    // Approve button visible
    expect(within(dialog).getByRole('button', { name: /^Approve$/i })).toBeInTheDocument()
    // Code input visible
    expect(within(dialog).getByTestId('approve-code-input')).toBeInTheDocument()
    // Return button visible
    expect(within(dialog).getByRole('button', { name: /^Return$/i })).toBeInTheDocument()
    // No "Awaiting owner sign-off" text (owner doesn't see that)
    expect(within(dialog).queryByText(/Awaiting owner sign-off/i)).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Route action: click Route → confirm → specsApi.route called → toast
  // ─────────────────────────────────────────────────────────────────────────

  it('architect can route a draft spec to owner (Route → confirm → toast)', async () => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    renderSelections()
    await screen.findByText('Vitrified Tile')

    // Open s1 (draft)
    await userEvent.click(screen.getByTestId('spec-row-s1'))
    await screen.findByRole('dialog')

    // Click "Route to owner" in the drawer footer
    await userEvent.click(screen.getByRole('button', { name: /Route to owner/i }))

    // Confirm dialog appears
    const confirmDialog = await screen.findByRole('dialog', { name: /Route to owner/i })
    expect(confirmDialog).toBeInTheDocument()

    // Click the confirm CTA
    await userEvent.click(within(confirmDialog).getByRole('button', { name: /Send for approval/i }))

    // specsApi.route called with 's1'
    await waitFor(() => expect(mockRoute).toHaveBeenCalledWith('s1'))

    // Toast message visible
    await waitFor(() =>
      expect(screen.getByText(/Selection sent to owner for sign-off/i)).toBeInTheDocument(),
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Approve action (owner): code + Approve → specsApi.approve called
  // ─────────────────────────────────────────────────────────────────────────

  it('owner approves a selection with a client_final_code', async () => {
    mockUseMeRole.mockReturnValue('owner' as string | undefined)
    renderSelections()
    await screen.findByText('Decorative Panel')

    // Open s2 (out_for_approval)
    await userEvent.click(screen.getByTestId('spec-row-s2'))
    await screen.findByRole('dialog')

    // Enter a code
    const codeInput = screen.getByTestId('approve-code-input')
    await userEvent.clear(codeInput)
    await userEvent.type(codeInput, 'MER-WALL-CHR-02')

    // Click Approve
    await userEvent.click(screen.getByRole('button', { name: /^Approve$/i }))

    // specsApi.approve called with correct args
    await waitFor(() =>
      expect(mockApprove).toHaveBeenCalledWith('s2', {
        status: 'approved',
        client_final_code: 'MER-WALL-CHR-02',
      }),
    )

    // Toast
    await waitFor(() =>
      expect(screen.getByText(/Selection approved/i)).toBeInTheDocument(),
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Keyboard: ↑/↓ moves selection, Enter opens drawer
  // ─────────────────────────────────────────────────────────────────────────

  it('↓ moves selection, Enter opens drawer', async () => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    renderSelections()
    await screen.findByText('Vitrified Tile')

    // ↓ should move to first line (s1 selected)
    await act(async () => { press('ArrowDown') })

    // The first row (s1) should get aria-selected="true"
    await waitFor(() => {
      const row = screen.getByTestId('spec-row-s1')
      expect(row).toHaveAttribute('aria-selected', 'true')
    })

    // ↓ again → s2 selected
    await act(async () => { press('ArrowDown') })
    await waitFor(() => {
      const row = screen.getByTestId('spec-row-s2')
      expect(row).toHaveAttribute('aria-selected', 'true')
    })

    // ↑ back to s1
    await act(async () => { press('ArrowUp') })
    await waitFor(() => {
      const row = screen.getByTestId('spec-row-s1')
      expect(row).toHaveAttribute('aria-selected', 'true')
    })

    // Enter → open drawer for s1
    await act(async () => { press('Enter') })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Vitrified Tile/i, { selector: 'h2' })).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 8. Released state: drawer shows done state, no actions
  // ─────────────────────────────────────────────────────────────────────────

  it('released spec shows "Released to site" done state with no action buttons', async () => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    renderSelections()
    await screen.findByText('Paint')

    // Open s4 (released)
    await userEvent.click(screen.getByTestId('spec-row-s4'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getAllByText(/Released to site/i).length).toBeGreaterThan(0)
    // No route, approve, or release buttons
    expect(within(dialog).queryByRole('button', { name: /Route to owner/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Release to site/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /Approve/i })).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 9. Approved + architect → "Release to site" button visible
  // ─────────────────────────────────────────────────────────────────────────

  it('architect sees "Release to site" for an approved spec', async () => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    renderSelections()
    await screen.findByText('Laminate')

    // Open s3 (approved)
    await userEvent.click(screen.getByTestId('spec-row-s3'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('button', { name: /Release to site/i })).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 10. Returned + architect → "Route to owner" visible (re-propose)
  // ─────────────────────────────────────────────────────────────────────────

  it('architect sees "Route to owner" for a returned spec (re-propose flow)', async () => {
    mockUseMeRole.mockReturnValue('architect' as string | undefined)
    renderSelections()
    await screen.findByText('Granite')

    // Open s5 (returned)
    await userEvent.click(screen.getByTestId('spec-row-s5'))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByRole('button', { name: /Route to owner/i })).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 11. Return action (owner): open drawer → Return → confirm → specsApi.approve({status:'rejected'}) + toast
  // ─────────────────────────────────────────────────────────────────────────

  it('owner can return an out_for_approval spec (Return → confirm → toast)', async () => {
    mockUseMeRole.mockReturnValue('owner' as string | undefined)
    mockApprove.mockResolvedValue({ id: 's2', routing_status: 'returned' })
    renderSelections()
    await screen.findByText('Decorative Panel')

    // Open s2 (out_for_approval)
    await userEvent.click(screen.getByTestId('spec-row-s2'))
    const dialog = await screen.findByRole('dialog')

    // Click the Return button
    await userEvent.click(within(dialog).getByRole('button', { name: /^Return$/i }))

    // Confirm dialog appears (title: "Return to designer")
    const confirmDialog = await screen.findByRole('dialog', { name: /Return to designer/i })
    expect(confirmDialog).toBeInTheDocument()

    // Confirm the return (CTA: "Return for revision")
    await userEvent.click(within(confirmDialog).getByRole('button', { name: /Return for revision/i }))

    // specsApi.approve called with { status: 'rejected' }
    await waitFor(() =>
      expect(mockApprove).toHaveBeenCalledWith('s2', { status: 'rejected' }),
    )

    // Toast message visible
    await waitFor(() =>
      expect(screen.getByText(/Selection returned for revision/i)).toBeInTheDocument(),
    )
  })

  // ─────────────────────────────────────────────────────────────────────────
  // 12. pm-role: out_for_approval → "Awaiting owner" calm state, NO Approve button (WC4 invariant)
  // ─────────────────────────────────────────────────────────────────────────

  it('pm sees "Awaiting owner sign-off" for an out_for_approval spec (no Approve button)', async () => {
    mockUseMeRole.mockReturnValue('pm' as string | undefined)
    renderSelections()
    await screen.findByText('Decorative Panel')

    // Open s2 (out_for_approval)
    await userEvent.click(screen.getByTestId('spec-row-s2'))
    const dialog = await screen.findByRole('dialog')

    // Awaiting text visible
    expect(within(dialog).getByText(/Awaiting owner sign-off/i)).toBeInTheDocument()

    // No Approve button
    expect(within(dialog).queryByRole('button', { name: /^Approve$/i })).not.toBeInTheDocument()
  })
})
