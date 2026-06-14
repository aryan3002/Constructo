import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import type { DrawingRegisterRow } from '../../../api/drawings'

// ---------------------------------------------------------------------------
// Network-free mocks — declared BEFORE the dynamic import of the SUT.
// ---------------------------------------------------------------------------

const mockListRegister = vi.fn()
const mockPresign = vi.fn()
const mockPutToR2 = vi.fn()
const mockPublish = vi.fn()

vi.mock('../../../api/drawings', () => ({
  drawingsApi: {
    listRegister: (...a: unknown[]) => mockListRegister(...a),
    presign: (...a: unknown[]) => mockPresign(...a),
    putToR2: (...a: unknown[]) => mockPutToR2(...a),
    publish: (...a: unknown[]) => mockPublish(...a),
  },
}))

// Mock useMeRole → 'owner' so the gate passes.
vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => 'owner',
  useCan: (cap: string) => cap === 'manage_settings',
}))

// Suppress AppShell chrome (no router tab-bar needed in tests).
vi.mock('../../../ui', async (orig) => {
  const actual = await orig<typeof import('../../../ui')>()
  return {
    ...actual,
    AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useRoleTabs: () => [],
  }
})

// Mock useSites with two sites.
const mockSitesData = {
  items: [
    {
      id: 'site-1',
      name: 'Tripathi Residence',
      status: 'active',
      location: 'Delhi',
      type: 'residential',
      company_id: 'co-1',
      created_at: '2026-01-01',
    },
    {
      id: 'site-2',
      name: 'Green Valley',
      status: 'active',
      location: 'Noida',
      type: 'commercial',
      company_id: 'co-1',
      created_at: '2026-02-01',
    },
  ],
  next_cursor: null,
}
vi.mock('../../../api/hooks', () => ({
  useSites: () => ({ data: mockSitesData, isLoading: false, isError: false, error: null }),
}))

// Mock approvals (AppShell side-effect).
vi.mock('../../../api/approvals', () => ({
  approvalsApi: { unreadCount: () => Promise.resolve(0) },
}))

// Stub URL.createObjectURL (not present in jsdom).
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
})

// ---------------------------------------------------------------------------
// Mock drawing rows
// ---------------------------------------------------------------------------

const rowV1: DrawingRegisterRow = {
  id: 'drw-mock-1',
  site_id: 'site-1',
  title: 'Ground Floor Plan',
  version: 'v1',
  kind: 'plan',
  change_note: 'Initial issue',
  published_at: '2026-05-15T10:00:00Z',
  supersedes_id: null,
  site_name: 'Tripathi Residence',
  is_current: false,
  file_url: 'https://r2/ground-v1.pdf',
}

const rowV2: DrawingRegisterRow = {
  id: 'drw-mock-2',
  site_id: 'site-1',
  title: 'Ground Floor Plan',
  version: 'v2',
  kind: 'plan',
  change_note: 'Kitchen enlarged',
  published_at: '2026-06-01T14:30:00Z',
  supersedes_id: 'drw-mock-1',
  site_name: 'Tripathi Residence',
  is_current: true,
  file_url: 'https://r2/ground-v2.pdf',
}

const rowElevation: DrawingRegisterRow = {
  id: 'drw-mock-3',
  site_id: 'site-1',
  title: 'North Elevation',
  version: 'v1',
  kind: 'elevation',
  change_note: null,
  published_at: '2026-06-10T09:15:00Z',
  supersedes_id: null,
  site_name: 'Tripathi Residence',
  is_current: true,
  file_url: 'https://r2/north-elevation-v1.pdf',
}

// Dynamic import AFTER mocks.
const { DocumentsPage } = await import('../DocumentsPage')
import React from 'react'

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

describe('DocumentsPage', () => {
  beforeEach(() => {
    mockListRegister.mockReset()
    mockPresign.mockReset()
    mockPutToR2.mockReset()
    mockPublish.mockReset()
  })

  // -------------------------------------------------------------------------
  // Grouping + version history
  // -------------------------------------------------------------------------

  it('renders TWO drawing rows (the two current rows only)', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

    renderPage()

    // Both current drawing titles should appear exactly once as row headings.
    expect(await screen.findByRole('heading', { name: /Ground Floor Plan/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /North Elevation/i })).toBeInTheDocument()

    // The register should show the current version (v2) for Ground Floor Plan.
    expect(screen.getAllByText(/v2/i).length).toBeGreaterThan(0)
  })

  it('shows "Show versions" toggle on Ground Floor Plan but not on North Elevation', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

    renderPage()

    // Wait for data to load.
    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // Ground Floor Plan has a chain of 2, so toggle should appear.
    expect(screen.getByRole('button', { name: /show versions/i })).toBeInTheDocument()

    // North Elevation has only 1 version (no supersedes_id), so no toggle.
    // There should be exactly ONE "Show versions" button total.
    const toggles = screen.getAllByRole('button', { name: /show versions/i })
    expect(toggles).toHaveLength(1)
  })

  it('expanding "Show versions" reveals both v2 (current) and v1 (superseded)', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

    renderPage()

    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // Click "Show versions".
    await userEvent.click(screen.getByRole('button', { name: /show versions/i }))

    // Both v2 and v1 should now be visible in the version history.
    await waitFor(() => {
      expect(screen.getAllByText(/v2/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/v1/i).length).toBeGreaterThan(0)
    })

    // v1 should be labelled "Superseded".
    expect(screen.getByText(/superseded/i)).toBeInTheDocument()

    // Toggle should now read "Hide versions".
    expect(screen.getByRole('button', { name: /hide versions/i })).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Revision upload — presigned mode
  // -------------------------------------------------------------------------

  it('revision upload: presign → putToR2 → publish called with supersedes_id of current row', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
    mockPresign.mockResolvedValue({ key: 'new-key/ground-v3.pdf', put_url: 'https://r2/put', mode: 'presigned' })
    mockPutToR2.mockResolvedValue(undefined)
    mockPublish.mockResolvedValue({ ...rowV2, id: 'drw-mock-new', version: 'v3', is_current: true })

    renderPage()

    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // Find and click the "Upload new revision" button for Ground Floor Plan.
    const uploadButtons = screen.getAllByRole('button', { name: /upload new revision/i })
    await userEvent.click(uploadButtons[0])

    // Wait for the upload form to render, then fill in version.
    const versionInput = await screen.findByLabelText(/^version$/i)
    await userEvent.clear(versionInput)
    await userEvent.type(versionInput, 'v3')

    // Attach a fake file via the labelled file input.
    const fileInput = await screen.findByLabelText(/^file$/i)
    const fakeFile = new File(['pdf-content'], 'ground-floor-v3.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput, fakeFile)

    // Click Save.
    const saveButton = screen.getByRole('button', { name: /^save$/i })
    await userEvent.click(saveButton)

    // Verify call chain.
    await waitFor(() => {
      expect(mockPresign).toHaveBeenCalledWith('site-1', 'ground-floor-v3.pdf', 'application/pdf')
    })
    await waitFor(() => {
      expect(mockPutToR2).toHaveBeenCalledWith('https://r2/put', fakeFile)
    })
    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          site_id: 'site-1',
          title: 'Ground Floor Plan',
          version: 'v3',
          file_url: 'new-key/ground-v3.pdf',
          kind: 'plan',
          supersedes_id: 'drw-mock-2', // the current row's id
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Upload unavailable
  // -------------------------------------------------------------------------

  it('upload unavailable: shows note, does NOT call putToR2 or publish', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
    mockPresign.mockResolvedValue({ key: 'key', put_url: null, mode: 'unavailable' })

    renderPage()

    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // Open the upload form.
    const uploadButtons = screen.getAllByRole('button', { name: /upload new revision/i })
    await userEvent.click(uploadButtons[0])

    // Wait for the upload form, fill version + attach file.
    const versionInput = await screen.findByLabelText(/^version$/i)
    await userEvent.clear(versionInput)
    await userEvent.type(versionInput, 'v3')

    const fileInput = await screen.findByLabelText(/^file$/i)
    const fakeFile = new File(['pdf'], 'ground-v3.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput, fakeFile)

    // Click Save.
    const saveButton = screen.getByRole('button', { name: /^save$/i })
    await userEvent.click(saveButton)

    // Presign called.
    await waitFor(() => expect(mockPresign).toHaveBeenCalled())

    // Upload unavailable note should appear.
    await waitFor(() => {
      expect(
        screen.getByText(/file storage is not configured/i),
      ).toBeInTheDocument()
    })

    // putToR2 and publish must NOT have been called.
    expect(mockPutToR2).not.toHaveBeenCalled()
    expect(mockPublish).not.toHaveBeenCalled()
  })
})
