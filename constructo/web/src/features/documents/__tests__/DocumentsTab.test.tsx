/**
 * DocumentsTab tests (W5 Slice 2b — S2b-E3).
 *
 * Uses vi.setSystemTime('2026-06-14') so expiry-pill assertions are
 * deterministic against the hardcoded mock dates:
 *   doc-mock-1  expiry_on: '2026-05-01'  → expired  → risk pill
 *   doc-mock-2  expiry_on: '2026-06-20'  → 6 days   → warn pill
 *   doc-mock-3  expiry_on: null           → no pill
 */
import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import React from 'react'

// ---------------------------------------------------------------------------
// Pin system clock
// ---------------------------------------------------------------------------

// Use noon local time to avoid UTC midnight rolling back to Jun 13 in negative-offset TZs.
vi.setSystemTime(new Date('2026-06-14T12:00:00'))
afterAll(() => vi.useRealTimers())

// ---------------------------------------------------------------------------
// Mock URL.createObjectURL (not present in jsdom)
// ---------------------------------------------------------------------------

vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
})

// ---------------------------------------------------------------------------
// Network-free mocks — declared BEFORE dynamic import of the SUT.
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
  // putToR2 is a named export (not on documentsApi).
  putToR2: (...a: unknown[]) => mockPutToR2(...a),
}))

// Mock drawingsApi as well (DocumentsPage imports it for the Drawings tab).
vi.mock('../../../api/drawings', async (orig) => {
  const actual = await orig<typeof import('../../../api/drawings')>()
  return {
    ...actual, // keep real DRAWING_KINDS + describeUploadError
    drawingsApi: {
      listRegister: () => Promise.resolve([]),
      presign: vi.fn(),
      putToR2: vi.fn(),
      publish: vi.fn(),
    },
  }
})

// useMeRole → 'owner' so the gate passes.
vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => 'owner',
  useCan: (cap: string) => cap === 'manage_settings',
}))

// Suppress AppShell chrome.
vi.mock('../../../ui', async (orig) => {
  const actual = await orig<typeof import('../../../ui')>()
  return {
    ...actual,
    AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useRoleTabs: () => [],
  }
})

// useSites — matches the spec's mock roster.
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

// Mock approvals (AppShell side-effect).
vi.mock('../../../api/approvals', () => ({
  approvalsApi: { unreadCount: () => Promise.resolve(0) },
}))

// ---------------------------------------------------------------------------
// Mock document roster (must mirror api/documents.ts mock data exactly).
// ---------------------------------------------------------------------------

import type { CompanyDocument } from '../../../api/documents'

const docInsurance: CompanyDocument = {
  id: 'doc-mock-1',
  company_id: 'mock-company-1',
  site_id: null,
  doc_type: 'insurance',
  title: 'Contractor All-Risk Insurance Policy',
  file_url: 'mock-key/insurance-policy-2026.pdf',
  expiry_on: '2026-05-01',
  notes: 'Annual renewal — contact Bajaj Allianz',
  is_active: true,
  created_by: 'mock-user-1',
  created_at: '2026-01-15T09:00:00Z',
}

const docNoc: CompanyDocument = {
  id: 'doc-mock-2',
  company_id: 'mock-company-1',
  site_id: 'mock-site-1',
  doc_type: 'noc',
  title: 'Municipal NOC – Tripathi Residence',
  file_url: 'mock-key/municipal-noc-site1.pdf',
  expiry_on: '2026-06-20',
  notes: null,
  is_active: true,
  created_by: 'mock-user-1',
  created_at: '2026-03-10T11:30:00Z',
}

const docContract: CompanyDocument = {
  id: 'doc-mock-3',
  company_id: 'mock-company-1',
  site_id: 'mock-site-1',
  doc_type: 'contract',
  title: 'Main Construction Agreement – Tripathi Residence',
  file_url: 'mock-key/main-contract-site1.pdf',
  expiry_on: null,
  notes: 'Signed copy; original with PM',
  is_active: true,
  created_by: 'mock-user-1',
  created_at: '2026-02-20T14:00:00Z',
}

// Dynamic import AFTER mocks.
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

describe('DocumentsTab', () => {
  beforeEach(() => {
    mockListDocuments.mockReset()
    mockPresign.mockReset()
    mockPutToR2.mockReset()
    mockCreate.mockReset()
    mockUpdate.mockReset()
  })

  // -------------------------------------------------------------------------
  // Tab switcher
  // -------------------------------------------------------------------------

  it('renders a "Drawings" and a "Documents" tab button', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    renderPage()
    expect(await screen.findByRole('tab', { name: /drawings/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /documents/i })).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Switching to Documents tab lists all 3 mock docs
  // -------------------------------------------------------------------------

  it('switching to Documents tab lists all 3 mock documents', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    renderPage()

    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))

    // All three titles must be visible.
    expect(await screen.findByText(/Contractor All-Risk Insurance Policy/i)).toBeInTheDocument()
    expect(screen.getByText(/Municipal NOC – Tripathi Residence/i)).toBeInTheDocument()
    expect(screen.getByText(/Main Construction Agreement – Tripathi Residence/i)).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Expiry pills
  // -------------------------------------------------------------------------

  it('expired doc (2026-05-01) shows a risk "Expired" pill', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
    await screen.findByText(/Contractor All-Risk Insurance Policy/i)

    // The risk pill text contains "Expired" and a days count.
    const expiredPills = screen.getAllByText(/Expired \d+ days ago/i)
    expect(expiredPills.length).toBeGreaterThan(0)
  })

  it('soon-expiring doc (2026-06-20) shows a warn "Expires in 6 days" pill', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
    await screen.findByText(/Municipal NOC – Tripathi Residence/i)

    expect(screen.getByText(/Expires in 6 days/i)).toBeInTheDocument()
  })

  it('null-expiry doc shows "No expiry" text, no expiry pill', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
    await screen.findByText(/Main Construction Agreement/i)

    // "No expiry" should be present.
    expect(screen.getByText(/no expiry/i)).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Site / company-wide mapping
  // -------------------------------------------------------------------------

  it('company-wide doc (site_id null) shows "Company-wide"', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
    await screen.findByText(/Contractor All-Risk Insurance Policy/i)
    expect(screen.getAllByText(/company-wide/i).length).toBeGreaterThan(0)
  })

  it('site doc shows the site name "Sunrise Villa"', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
    await screen.findByText(/Municipal NOC/i)
    expect(screen.getAllByText(/Sunrise Villa/i).length).toBeGreaterThan(0)
  })

  // -------------------------------------------------------------------------
  // Add document: presign(presigned) → putToR2 → create → invalidate
  // -------------------------------------------------------------------------

  it('add document: presign → putToR2 → create called in order', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    mockPresign.mockResolvedValue({ key: 'mock-key/new.pdf', put_url: 'https://r2/put', mode: 'presigned' })
    mockPutToR2.mockResolvedValue(undefined)
    mockCreate.mockResolvedValue({
      id: 'doc-mock-4',
      company_id: 'mock-company-1',
      site_id: null,
      doc_type: 'license',
      title: 'Test License',
      file_url: 'mock-key/new.pdf',
      expiry_on: '2027-01-01',
      notes: null,
      is_active: true,
      created_by: 'mock-user-1',
      created_at: '2026-06-14T00:00:00Z',
    })

    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))

    // Open the add form.
    await userEvent.click(await screen.findByRole('button', { name: /add document/i }))

    // Fill in the form.
    const titleInput = await screen.findByLabelText(/document title/i)
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Test License')

    // Select doc_type.
    const typeSelect = screen.getByLabelText(/type/i)
    await userEvent.selectOptions(typeSelect, 'license')

    // Attach a file.
    const fileInput = screen.getByLabelText(/^file$/i)
    const fakeFile = new File(['pdf'], 'test-license.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput, fakeFile)

    // Click Save.
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    // presign called (file name, content type; siteId null/undefined = company-wide).
    await waitFor(() => {
      expect(mockPresign).toHaveBeenCalledWith(
        'test-license.pdf',
        'application/pdf',
        undefined,
      )
    })

    // putToR2 called with the presigned URL and the file.
    await waitFor(() => {
      expect(mockPutToR2).toHaveBeenCalledWith('https://r2/put', fakeFile)
    })

    // create called with correct body.
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          doc_type: 'license',
          title: 'Test License',
          file_url: 'mock-key/new.pdf',
        }),
      )
    })

    // Strict call order: presign → putToR2 → create (no interleaving allowed).
    expect(mockPresign.mock.invocationCallOrder[0]).toBeLessThan(
      mockPutToR2.mock.invocationCallOrder[0],
    )
    expect(mockPutToR2.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreate.mock.invocationCallOrder[0],
    )
  })

  // -------------------------------------------------------------------------
  // Add document: upload unavailable → shows note, no putToR2/create
  // -------------------------------------------------------------------------

  it('upload unavailable: shows note, does NOT call putToR2 or create', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    mockPresign.mockResolvedValue({ key: 'mock-key', put_url: null, mode: 'unavailable' })

    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))

    // Open add form.
    await userEvent.click(await screen.findByRole('button', { name: /add document/i }))

    const titleInput = await screen.findByLabelText(/document title/i)
    await userEvent.type(titleInput, 'Some doc')

    const fileInput = screen.getByLabelText(/^file$/i)
    const fakeFile = new File(['pdf'], 'some.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput, fakeFile)

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    // Presign should be called.
    await waitFor(() => expect(mockPresign).toHaveBeenCalled())

    // upload_unavailable note should appear.
    await waitFor(() => {
      expect(
        screen.getByText(/file storage is not configured/i),
      ).toBeInTheDocument()
    })

    // putToR2 and create must NOT have been called.
    expect(mockPutToR2).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Archive: clicking Archive calls update(id, { is_active: false })
  // -------------------------------------------------------------------------

  it('Archive button calls update(id, { is_active: false })', async () => {
    mockListDocuments.mockResolvedValue([docInsurance, docNoc, docContract])
    mockUpdate.mockResolvedValue({ ...docInsurance, is_active: false })

    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /documents/i }))
    await screen.findByText(/Contractor All-Risk Insurance Policy/i)

    // Click the Archive button for the first document.
    const archiveButtons = screen.getAllByRole('button', { name: /^archive$/i })
    await userEvent.click(archiveButtons[0])

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith('doc-mock-1', { is_active: false })
    })
  })
})
