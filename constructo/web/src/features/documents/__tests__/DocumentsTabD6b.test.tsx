/**
 * D6b — Documents-tab elevation tests.
 *
 * Tests:
 *   A. D6a: pressing `u` on a selected drawing opens the drawer with upload form visible.
 *   B. Expiry dashboard: strip shows "1 expired" + "1 expiring"; clicking "expired"
 *      filters to that doc; clicking again clears. Zero/zero → "All documents current".
 *   C. Empty-state CTA opens the add form.
 *   D. Drag-drop: the drop zone exists + file input fallback works.
 *
 * Uses vi.setSystemTime('2026-06-14T12:00:00') — same clock as DocumentsTab.test.tsx.
 */

import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import React from 'react'

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

vi.setSystemTime(new Date('2026-06-14T12:00:00'))
afterAll(() => vi.useRealTimers())

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
})

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListDocuments = vi.fn()
const mockPresign = vi.fn()
const mockPutToR2 = vi.fn()
const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('../../../api/documents', () => ({
  documentsApi: {
    listDocuments: (...a: unknown[]) => mockListDocuments(...a),
    presign: (...a: unknown[]) => mockPresign(...a),
    create: (...a: unknown[]) => mockCreate(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
  },
  putToR2: (...a: unknown[]) => mockPutToR2(...a),
}))

const mockListRegister = vi.fn()
const mockDrawingsPresign = vi.fn()
const mockDrawingsPutToR2 = vi.fn()
const mockPublish = vi.fn()

vi.mock('../../../api/drawings', async (orig) => {
  const actual = await orig<typeof import('../../../api/drawings')>()
  return {
    ...actual, // keep real DRAWING_KINDS + describeUploadError
    drawingsApi: {
      listRegister: (...a: unknown[]) => mockListRegister(...a),
      presign: (...a: unknown[]) => mockDrawingsPresign(...a),
      putToR2: (...a: unknown[]) => mockDrawingsPutToR2(...a),
      publish: (...a: unknown[]) => mockPublish(...a),
    },
  }
})

vi.mock('../../../api/siteChanges', () => ({
  siteChangesApi: {
    list: () => Promise.resolve([]),
  },
}))

vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => 'owner',
  useCan: (cap: string) => cap === 'manage_settings',
}))

vi.mock('../../../ui', async (orig) => {
  const actual = await orig<typeof import('../../../ui')>()
  return {
    ...actual,
    AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useRoleTabs: () => [],
  }
})

vi.mock('../../../api/hooks', () => ({
  useSites: () => ({
    data: {
      items: [{ id: 'mock-site-1', name: 'Sunrise Villa', status: 'active' }],
      next_cursor: null,
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}))

vi.mock('../../../api/approvals', () => ({
  approvalsApi: { unreadCount: () => Promise.resolve(0) },
}))

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

import type { CompanyDocument } from '../../../api/documents'
import type { DrawingRegisterRow } from '../../../api/drawings'

// Clock is 2026-06-14. Expired = 2026-05-01 (44 days ago). Expiring = 2026-06-20 (6 days).
const docExpired: CompanyDocument = {
  id: 'doc-expired',
  company_id: 'c1',
  site_id: null,
  doc_type: 'insurance',
  title: 'Expired Insurance Policy',
  file_url: 'mock/expired.pdf',
  expiry_on: '2026-05-01',
  notes: null,
  is_active: true,
  created_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
}

const docExpiring: CompanyDocument = {
  id: 'doc-expiring',
  company_id: 'c1',
  site_id: null,
  doc_type: 'noc',
  title: 'Expiring NOC',
  file_url: 'mock/expiring.pdf',
  expiry_on: '2026-06-20',
  notes: null,
  is_active: true,
  created_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
}

const docNoExpiry: CompanyDocument = {
  id: 'doc-no-expiry',
  company_id: 'c1',
  site_id: null,
  doc_type: 'contract',
  title: 'Evergreen Contract',
  file_url: 'mock/contract.pdf',
  expiry_on: null,
  notes: null,
  is_active: true,
  created_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
}

const docFarFuture: CompanyDocument = {
  id: 'doc-future',
  company_id: 'c1',
  site_id: null,
  doc_type: 'license',
  title: 'Long-dated License',
  file_url: 'mock/license.pdf',
  expiry_on: '2027-12-31',
  notes: null,
  is_active: true,
  created_by: 'u1',
  created_at: '2026-01-01T00:00:00Z',
}

// A drawing row for the D6a `u` shortcut test.
const drawingRow: DrawingRegisterRow = {
  id: 'drw-1',
  site_id: 'mock-site-1',
  title: 'Ground Floor Plan',
  version: 'v1',
  kind: 'plan',
  change_note: null,
  published_at: '2026-06-01T10:00:00Z',
  supersedes_id: null,
  site_name: 'Sunrise Villa',
  is_current: true,
  file_url: 'https://r2/gfp-v1.pdf',
}

// Dynamic import AFTER mocks
const { DocumentsPage } = await import('../DocumentsPage')

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { role: 'owner' })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('D6b — Documents-tab elevation', () => {
  beforeEach(() => {
    mockListDocuments.mockReset()
    mockPresign.mockReset()
    mockPutToR2.mockReset()
    mockCreate.mockReset()
    mockUpdate.mockReset()
    mockListRegister.mockReset()
    mockListRegister.mockResolvedValue([])
  })

  // -------------------------------------------------------------------------
  // A. D6a — `u` keyboard shortcut opens drawer with upload form visible
  // -------------------------------------------------------------------------

  describe('A. D6a — `u` shortcut opens upload form in drawer', () => {
    it('pressing `u` on a selected drawing opens the drawer with the revision-upload panel visible', async () => {
      mockListRegister.mockResolvedValue([drawingRow])
      mockListDocuments.mockResolvedValue([])

      renderPage()

      // Wait for the drawing to appear (Drawings tab is active by default).
      const heading = await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // Step 1: Click the row heading — this selects it (selectedIdx=0) and opens the drawer.
      await userEvent.click(heading)
      await screen.findByRole('dialog')

      // Step 2: Close the drawer. The closeDrawer handler returns focus to rowRefs[0].
      await userEvent.click(screen.getByRole('button', { name: /close/i }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      // Step 3: Press `u` — it fires on the focused <li> and bubbles to the <ul>
      // handleListKeyDown. selectedIdx is still 0, so it opens the drawer with autoUpload=true.
      await userEvent.keyboard('u')

      // The drawer should now be open with the revision-upload panel already expanded.
      const dialog = await screen.findByRole('dialog')

      // The RevisionUploadPanel contains a "Version" labeled input (no need to click "Upload revision").
      await waitFor(() => {
        expect(within(dialog).getByLabelText(/^Version$/i)).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // B. Expiry dashboard
  // -------------------------------------------------------------------------

  describe('B. Expiry dashboard', () => {
    async function switchToDocuments() {
      await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
    }

    it('shows "1 expired" and "1 expiring" buttons in the strip', async () => {
      mockListDocuments.mockResolvedValue([docExpired, docExpiring, docNoExpiry])
      renderPage()
      await switchToDocuments()

      // Wait for the list to populate.
      await screen.findByText(/Expired Insurance Policy/i)

      expect(screen.getByRole('button', { name: /1 expired/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /1 expiring/i })).toBeInTheDocument()
    })

    it('clicking "expired" filters the list to only expired docs', async () => {
      mockListDocuments.mockResolvedValue([docExpired, docExpiring, docNoExpiry])
      renderPage()
      await switchToDocuments()
      await screen.findByText(/Expired Insurance Policy/i)

      await userEvent.click(screen.getByRole('button', { name: /1 expired/i }))

      // Only the expired doc should now be visible.
      await waitFor(() => {
        expect(screen.getByText(/Expired Insurance Policy/i)).toBeInTheDocument()
        expect(screen.queryByText(/Expiring NOC/i)).not.toBeInTheDocument()
        expect(screen.queryByText(/Evergreen Contract/i)).not.toBeInTheDocument()
      })
    })

    it('clicking "expired" again (toggle) clears the filter', async () => {
      mockListDocuments.mockResolvedValue([docExpired, docExpiring, docNoExpiry])
      renderPage()
      await switchToDocuments()
      await screen.findByText(/Expired Insurance Policy/i)

      // Activate.
      await userEvent.click(screen.getByRole('button', { name: /1 expired/i }))
      await waitFor(() => expect(screen.queryByText(/Expiring NOC/i)).not.toBeInTheDocument())

      // Deactivate (toggle off).
      await userEvent.click(screen.getByRole('button', { name: /1 expired/i }))
      await waitFor(() => {
        expect(screen.getByText(/Expiring NOC/i)).toBeInTheDocument()
        expect(screen.getByText(/Evergreen Contract/i)).toBeInTheDocument()
      })
    })

    it('shows "All documents current" when no docs have past or near expiry', async () => {
      mockListDocuments.mockResolvedValue([docNoExpiry, docFarFuture])
      renderPage()
      await switchToDocuments()
      await screen.findByText(/Evergreen Contract/i)

      expect(screen.getByText(/All documents current/i)).toBeInTheDocument()

      // The expired/expiring buttons should NOT be present.
      expect(screen.queryByRole('button', { name: /expired/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /expiring/i })).not.toBeInTheDocument()
    })

    it('shows "All documents current" when the list has no docs with any expiry', async () => {
      mockListDocuments.mockResolvedValue([docNoExpiry])
      renderPage()
      await switchToDocuments()
      await screen.findByText(/Evergreen Contract/i)

      expect(screen.getByText(/All documents current/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // C. Empty-state CTA opens the add form
  // -------------------------------------------------------------------------

  describe('C. Empty-state CTA', () => {
    it('clicking "Add a document" in the empty state opens the add form', async () => {
      mockListDocuments.mockResolvedValue([])
      renderPage()

      await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))

      // The EmptyState CTA button.
      const cta = await screen.findByRole('button', { name: /Add a document/i })
      await userEvent.click(cta)

      // The add form should appear.
      await waitFor(() => {
        expect(screen.getByLabelText(/document title/i)).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // D. Drag-drop: drop zone exists + file input fallback works
  // -------------------------------------------------------------------------

  describe('D. Drag-drop upload', () => {
    it('the add form has a file input (fallback) that accepts files', async () => {
      mockListDocuments.mockResolvedValue([docNoExpiry])
      renderPage()

      await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
      await screen.findByText(/Evergreen Contract/i)

      // Open add form.
      await userEvent.click(screen.getByRole('button', { name: /add document/i }))

      // File input must be present.
      const fileInput = await screen.findByLabelText(/^file$/i)
      expect(fileInput).toBeInTheDocument()
      expect(fileInput).toHaveAttribute('type', 'file')
    })

    it('the drop zone shows a drag hint text before a file is selected', async () => {
      mockListDocuments.mockResolvedValue([docNoExpiry])
      renderPage()

      await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
      await screen.findByText(/Evergreen Contract/i)

      await userEvent.click(screen.getByRole('button', { name: /add document/i }))

      // The drop hint text should appear.
      await waitFor(() => {
        expect(
          screen.getByText(/drop a file here, or click to select/i),
        ).toBeInTheDocument()
      })
    })

    it('uploading a file via the file input updates the filename display', async () => {
      mockListDocuments.mockResolvedValue([docNoExpiry])
      renderPage()

      await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
      await screen.findByText(/Evergreen Contract/i)

      await userEvent.click(screen.getByRole('button', { name: /add document/i }))

      const fileInput = await screen.findByLabelText(/^file$/i)
      const fakeFile = new File(['pdf'], 'my-document.pdf', { type: 'application/pdf' })
      await userEvent.upload(fileInput, fakeFile)

      // The filename should appear in place of the drop hint.
      await waitFor(() => {
        expect(screen.getByText('my-document.pdf')).toBeInTheDocument()
      })
    })
  })
})
