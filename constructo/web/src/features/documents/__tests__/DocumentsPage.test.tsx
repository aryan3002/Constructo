import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

vi.mock('../../../api/drawings', async (orig) => {
  const actual = await orig<typeof import('../../../api/drawings')>()
  return {
    ...actual, // keep real DRAWING_KINDS + describeUploadError + types
    drawingsApi: {
      listRegister: (...a: unknown[]) => mockListRegister(...a),
      presign: (...a: unknown[]) => mockPresign(...a),
      putToR2: (...a: unknown[]) => mockPutToR2(...a),
      publish: (...a: unknown[]) => mockPublish(...a),
    },
  }
})

// Mock useMeRole → 'owner'. The owner holds every capability, so useCan is true
// for all of them (view_documents, …) and this suite exercises the full page.
vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => 'owner',
  useCan: () => true,
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

// Mock siteChangesApi — used by DrawingDetailDrawer.
vi.mock('../../../api/siteChanges', () => ({
  siteChangesApi: {
    list: () => Promise.resolve([]),
  },
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

  // D6: "Show versions" toggle is replaced by clicking the row to open the Drawer.
  // Version history is now inside the DrawingDetailDrawer.
  it('clicking a drawing row opens the detail drawer showing the version timeline', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

    renderPage()

    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // Click the Ground Floor Plan row heading — opens the drawer.
    await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))

    // Drawer opens with a dialog containing the version history section.
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      // Both v2 and v1 should appear in the drawer's timeline.
      const versionTexts = within(dialog).getAllByText(/v[12]/i)
      const hasV2 = versionTexts.some((el) => el.textContent?.includes('v2'))
      const hasV1 = versionTexts.some((el) => el.textContent?.includes('v1'))
      expect(hasV2).toBe(true)
      expect(hasV1).toBe(true)
    })
  })

  it('drawing rows have no inline "Show versions" toggle — D6 moves this to the drawer', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

    renderPage()

    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // The old "Show versions" toggle is gone from the list.
    expect(screen.queryByRole('button', { name: /show versions/i })).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Revision upload — via drawer (D6)
  // -------------------------------------------------------------------------

  it('revision upload via drawer: presign → putToR2 → publish called with supersedes_id', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
    mockPresign.mockResolvedValue({ key: 'new-key/ground-v3.pdf', put_url: 'https://r2/put', mode: 'presigned' })
    mockPutToR2.mockResolvedValue(undefined)
    mockPublish.mockResolvedValue({ ...rowV2, id: 'drw-mock-new', version: 'v3', is_current: true })

    renderPage()

    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // Open the drawer by clicking the row.
    await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))
    await screen.findByRole('dialog')

    // Click "Upload new revision" in drawer footer.
    await userEvent.click(screen.getByRole('button', { name: /Upload new revision/i }))

    // Fill in version.
    const versionInput = await screen.findByLabelText(/^version$/i)
    await userEvent.clear(versionInput)
    await userEvent.type(versionInput, 'v3')

    // Attach a fake file.
    const fileInput = await screen.findByLabelText(/^file$/i)
    const fakeFile = new File(['pdf-content'], 'ground-floor-v3.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput, fakeFile)

    // Click Save — opens ConfirmDialog.
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    // Confirm in the supersede dialog.
    await screen.findByText(/Supersede v2\?/i)
    await userEvent.click(screen.getByRole('button', { name: /Publish revision/i }))

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
          supersedes_id: 'drw-mock-2',
        }),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Upload unavailable (via drawer)
  // -------------------------------------------------------------------------

  it('upload unavailable via drawer: shows note, does NOT call putToR2 or publish', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
    mockPresign.mockResolvedValue({ key: 'key', put_url: null, mode: 'unavailable' })

    renderPage()

    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // Open drawer.
    await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))
    await screen.findByRole('dialog')

    // Open upload panel.
    await userEvent.click(screen.getByRole('button', { name: /Upload new revision/i }))

    const versionInput = await screen.findByLabelText(/^version$/i)
    await userEvent.clear(versionInput)
    await userEvent.type(versionInput, 'v3')

    const fileInput = await screen.findByLabelText(/^file$/i)
    const fakeFile = new File(['pdf'], 'ground-v3.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput, fakeFile)

    // Click Save → ConfirmDialog → Confirm.
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await screen.findByText(/Supersede v2\?/i)
    await userEvent.click(screen.getByRole('button', { name: /Publish revision/i }))

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

  // -------------------------------------------------------------------------
  // Fix 5: New drawing upload — no supersedes_id
  // -------------------------------------------------------------------------

  it('new drawing: presign → putToR2 → publish called WITHOUT supersedes_id', async () => {
    // Start with an empty register so the "New drawing" button is visible regardless.
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
    mockPresign.mockResolvedValue({
      key: 'new-key/roof-plan-v1.pdf',
      put_url: 'https://r2/put-new',
      mode: 'presigned',
    })
    mockPutToR2.mockResolvedValue(undefined)
    mockPublish.mockResolvedValue({
      id: 'drw-new-1',
      site_id: 'site-1',
      title: 'Roof Plan',
      version: 'v1',
      kind: 'other',
      change_note: null,
      published_at: new Date().toISOString(),
      supersedes_id: null,
      site_name: 'Tripathi Residence',
      is_current: true,
      file_url: 'new-key/roof-plan-v1.pdf',
    })

    renderPage()

    // Wait for the register to load.
    await screen.findByRole('heading', { name: /Ground Floor Plan/i })

    // Click "New drawing" button.
    await userEvent.click(screen.getByRole('button', { name: /new drawing/i }))

    // The new drawing form should appear. Fill site (first option, site-1, is pre-selected).
    // Fill in drawing title.
    const titleInput = await screen.findByLabelText(/drawing title/i)
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'Roof Plan')

    // Fill in version.
    const versionInput = screen.getByLabelText(/^version$/i)
    await userEvent.clear(versionInput)
    await userEvent.type(versionInput, 'v1')

    // Attach a file.
    const fileInput = screen.getByLabelText(/^file$/i)
    const fakeFile = new File(['pdf-content'], 'roof-plan-v1.pdf', { type: 'application/pdf' })
    await userEvent.upload(fileInput, fakeFile)

    // Click Save.
    const saveButton = screen.getByRole('button', { name: /^save$/i })
    await userEvent.click(saveButton)

    // presign called with the selected site and file info.
    await waitFor(() => {
      expect(mockPresign).toHaveBeenCalledWith('site-1', 'roof-plan-v1.pdf', 'application/pdf')
    })

    // putToR2 called with the presigned URL and the file.
    await waitFor(() => {
      expect(mockPutToR2).toHaveBeenCalledWith('https://r2/put-new', fakeFile)
    })

    // publish called with the correct body and NO supersedes_id key (or undefined).
    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          site_id: 'site-1',
          title: 'Roof Plan',
          version: 'v1',
          file_url: 'new-key/roof-plan-v1.pdf',
          kind: 'plan', // default Type for a new drawing (was hardcoded 'other')
        }),
      )
    })

    // Critical: supersedes_id must not be present (or must be undefined/absent).
    const publishCall = mockPublish.mock.calls[0][0] as Record<string, unknown>
    expect(publishCall.supersedes_id).toBeUndefined()
  })

  it('new drawing: the chosen Type is published (not a hardcoded kind)', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
    mockPresign.mockResolvedValue({
      key: 'new-key/east-elev-v1.pdf',
      put_url: 'https://r2/put-elev',
      mode: 'presigned',
    })
    mockPutToR2.mockResolvedValue(undefined)
    mockPublish.mockResolvedValue({ ...rowElevation, id: 'drw-new-elev' })

    renderPage()
    await screen.findByRole('heading', { name: /Ground Floor Plan/i })
    await userEvent.click(screen.getByRole('button', { name: /new drawing/i }))

    const titleInput = await screen.findByLabelText(/drawing title/i)
    await userEvent.type(titleInput, 'East Elevation')
    // Pick a Type other than the default.
    await userEvent.selectOptions(screen.getByLabelText(/^type$/i), 'elevation')
    await userEvent.type(screen.getByLabelText(/^version$/i), 'v1')
    const fakeFile = new File(['pdf'], 'east-elev-v1.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText(/^file$/i), fakeFile)
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'East Elevation', kind: 'elevation' }),
      )
    })
  })

  it('upload failure shows a specific reason, not the generic "Something went wrong"', async () => {
    mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
    mockPresign.mockResolvedValue({
      key: 'new-key/roof.pdf',
      put_url: 'https://r2/put',
      mode: 'presigned',
    })
    // Simulate a CORS / offline failure on the direct R2 PUT (fetch rejects with TypeError).
    mockPutToR2.mockRejectedValue(new TypeError('Failed to fetch'))

    renderPage()
    await screen.findByRole('heading', { name: /Ground Floor Plan/i })
    await userEvent.click(screen.getByRole('button', { name: /new drawing/i }))

    await userEvent.type(await screen.findByLabelText(/drawing title/i), 'Roof Plan')
    await userEvent.type(screen.getByLabelText(/^version$/i), 'v1')
    await userEvent.upload(
      screen.getByLabelText(/^file$/i),
      new File(['pdf'], 'roof.pdf', { type: 'application/pdf' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    // The honest upload error appears; the generic message does NOT.
    expect(await screen.findByText(/couldn't upload the file/i)).toBeInTheDocument()
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
    expect(mockPublish).not.toHaveBeenCalled()
  })
})
