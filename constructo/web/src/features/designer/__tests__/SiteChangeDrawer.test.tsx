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

vi.mock('../../../api/drawings', () => ({
  drawingsApi: {
    listRegister: vi.fn().mockResolvedValue([
      {
        id: 'drw-1',
        site_id: 'site-1',
        title: 'Ground Floor Plan',
        version: 'v2',
        kind: 'plan',
        change_note: null,
        published_at: '2026-06-01T14:30:00Z',
        supersedes_id: null,
        site_name: 'Tripathi Residence',
        is_current: true,
        file_url: 'mock-key/ground-floor-plan-v2.pdf',
      },
    ]),
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
