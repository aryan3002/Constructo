/**
 * D6 — Drawings register elevation tests.
 *
 * Covers:
 *   1. Clicking a drawing opens the Drawer with version timeline + kind badge + preview
 *   2. Kind filter: selecting a kind filters the list
 *   3. Linked site changes: shows changes linked to a drawing's version chain
 *   4. Supersede confirm: uploading a revision opens ConfirmDialog; confirming runs presign→putToR2→publish
 *   5. Empty-state CTA: no drawings → "Upload your first drawing" button present
 *   6. Sort: changing sort reorders the list
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import type { DrawingRegisterRow } from '../../../api/drawings'
import type { SiteChange } from '../../../api/siteChanges'
import React from 'react'

// ---------------------------------------------------------------------------
// Mocks — declared BEFORE dynamic import of SUT
// ---------------------------------------------------------------------------

const mockListRegister = vi.fn()
const mockPresign = vi.fn()
const mockPutToR2 = vi.fn()
const mockPublish = vi.fn()

vi.mock('../../../api/drawings', async (orig) => {
  const actual = await orig<typeof import('../../../api/drawings')>()
  return {
    ...actual, // keep real DRAWING_KINDS + describeUploadError
    drawingsApi: {
      listRegister: (...a: unknown[]) => mockListRegister(...a),
      presign: (...a: unknown[]) => mockPresign(...a),
      putToR2: (...a: unknown[]) => mockPutToR2(...a),
      publish: (...a: unknown[]) => mockPublish(...a),
    },
  }
})

const mockSiteChangesList = vi.fn()

vi.mock('../../../api/siteChanges', () => ({
  siteChangesApi: {
    list: (...a: unknown[]) => mockSiteChangesList(...a),
  },
}))

vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => 'owner',
  useCan: () => true,
}))

vi.mock('../../../ui', async (orig) => {
  const actual = await orig<typeof import('../../../ui')>()
  return {
    ...actual,
    AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useRoleTabs: () => [],
  }
})

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
  ],
  next_cursor: null,
}

vi.mock('../../../api/hooks', () => ({
  useSites: () => ({ data: mockSitesData, isLoading: false, isError: false, error: null }),
}))

vi.mock('../../../api/approvals', () => ({
  approvalsApi: { unreadCount: () => Promise.resolve(0) },
}))

vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
})

// ---------------------------------------------------------------------------
// Mock data
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

const rowStructural: DrawingRegisterRow = {
  id: 'drw-mock-4',
  site_id: 'site-1',
  title: 'Foundation Detail',
  version: 'v1',
  kind: 'structural',
  change_note: null,
  published_at: '2026-06-05T08:00:00Z',
  supersedes_id: null,
  site_name: 'Tripathi Residence',
  is_current: true,
  file_url: 'https://r2/foundation-v1.dwg',
}

const linkedSiteChange: SiteChange = {
  id: 'sc-mock-2',
  company_id: 'co-1',
  site_id: 'site-1',
  room: 'Kitchen',
  title: 'Window sill height reduced to 800mm',
  note: 'Owner requested...',
  impact: null,
  photo_url: null,
  reported_by: 'Supervisor Mukesh',
  status: 'linked',
  linked_drawing_id: 'drw-mock-2', // linked to v2 of Ground Floor Plan
  created_at: '2026-06-10T14:30:00Z',
  resolved_at: null,
}

const unrelatedException: SiteChange = {
  id: 'sc-mock-1',
  company_id: 'co-1',
  site_id: 'site-1',
  room: 'Bedroom',
  title: 'Unrelated change',
  note: 'Nothing to do with drawings',
  impact: null,
  photo_url: null,
  reported_by: null,
  status: 'new',
  linked_drawing_id: null,
  created_at: '2026-06-08T10:00:00Z',
  resolved_at: null,
}

// Dynamic import AFTER all mocks
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

describe('D6 — Drawings register elevation', () => {
  beforeEach(() => {
    mockListRegister.mockReset()
    mockPresign.mockReset()
    mockPutToR2.mockReset()
    mockPublish.mockReset()
    mockSiteChangesList.mockReset()
    // Default: empty site changes
    mockSiteChangesList.mockResolvedValue([])
  })

  // -------------------------------------------------------------------------
  // 1. Drawing detail drawer
  // -------------------------------------------------------------------------

  describe('1. Drawing detail drawer', () => {
    it('clicking a drawing opens the Drawer with the drawing title', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // Click the Ground Floor Plan row (the heading in the list).
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))

      // The Drawer should open — it renders a dialog.
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('drawer shows BOTH v2 (current) and v1 (superseded) versions newest→oldest in timeline', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))

      const dialog = await screen.findByRole('dialog')

      // Both version badges should appear inside the drawer's timeline section.
      // The TimelineItem typeLabel renders "Version v2" and "Version v1" as separate badge spans.
      await waitFor(() => {
        const badgeSpans = within(dialog).getAllByText(/v[12]/i)
        const hasV2 = badgeSpans.some((el) => el.textContent?.includes('v2'))
        const hasV1 = badgeSpans.some((el) => el.textContent?.includes('v1'))
        expect(hasV2).toBe(true)
        expect(hasV1).toBe(true)
      })

      // v2 should appear before v1 in DOM order (newest first).
      const badgeSpans = within(dialog).getAllByText(/v[12]/i)
      const v2Idx = badgeSpans.findIndex((el) => el.textContent?.includes('v2'))
      const v1Idx = badgeSpans.findIndex((el) => el.textContent?.includes('v1'))
      expect(v2Idx).toBeLessThan(v1Idx)
    })

    it('drawer shows the kind badge', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))

      const dialog = await screen.findByRole('dialog')

      // The kind badge for "plan" should be visible in the drawer header meta section.
      // It renders as an uppercase span with 'Plan'.
      await waitFor(() => {
        // The KindBadge renders uppercase text; getAllByText finds all matching.
        const planMatches = within(dialog).getAllByText(/^Plan$/i)
        expect(planMatches.length).toBeGreaterThan(0)
      })
    })

    it('drawer shows image preview for a .png file URL', async () => {
      const imgRow: DrawingRegisterRow = {
        ...rowElevation,
        id: 'drw-img',
        title: 'Rendered Elevation',
        is_current: true,
        file_url: 'https://r2/elevation.png',
      }
      mockListRegister.mockResolvedValue([imgRow])

      renderPage()

      await screen.findByRole('heading', { name: /Rendered Elevation/i })
      await userEvent.click(screen.getByRole('heading', { name: /Rendered Elevation/i }))

      const dialog = await screen.findByRole('dialog')

      // An <img> should be present (not a link).
      await waitFor(() => {
        const img = within(dialog).getByRole('img', { name: /Rendered Elevation/i })
        expect(img).toBeInTheDocument()
        expect(img).toHaveAttribute('src', 'https://r2/elevation.png')
      })
    })

    it('drawer shows "Open file" link for a .dwg file URL (no broken img)', async () => {
      mockListRegister.mockResolvedValue([rowStructural])

      renderPage()

      await screen.findByRole('heading', { name: /Foundation Detail/i })
      await userEvent.click(screen.getByRole('heading', { name: /Foundation Detail/i }))

      const dialog = await screen.findByRole('dialog')

      // Should show the file type badge (DWG) and an open link — no <img>.
      await waitFor(() => {
        expect(within(dialog).getByText(/DWG/i)).toBeInTheDocument()
        expect(within(dialog).getByRole('link', { name: /Open file/i })).toBeInTheDocument()
      })

      // No img element with a broken dwg src.
      const imgs = within(dialog).queryAllByRole('img')
      expect(imgs).toHaveLength(0)
    })

    it('closing the drawer via the X button removes the dialog', async () => {
      mockListRegister.mockResolvedValue([rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /North Elevation/i })
      await userEvent.click(screen.getByRole('heading', { name: /North Elevation/i }))

      await screen.findByRole('dialog')

      // Click the close button.
      await userEvent.click(screen.getByRole('button', { name: /close/i }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // 2. Kind filter
  // -------------------------------------------------------------------------

  describe('2. Kind filter', () => {
    it('renders kind filter pills for the present kinds', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // "All" pill always present.
      expect(screen.getByRole('button', { name: /^All$/i })).toBeInTheDocument()
      // "Plan" and "Elevation" present (those are the kinds in data).
      expect(screen.getByRole('button', { name: /^Plan$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Elevation$/i })).toBeInTheDocument()
    })

    it('selecting "Elevation" filters out "plan" drawings', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // Click the Elevation pill.
      await userEvent.click(screen.getByRole('button', { name: /^Elevation$/i }))

      await waitFor(() => {
        // "North Elevation" (kind=elevation) should still be visible.
        expect(screen.getByRole('heading', { name: /North Elevation/i })).toBeInTheDocument()
      })

      // "Ground Floor Plan" (kind=plan) should be hidden.
      expect(screen.queryByRole('heading', { name: /Ground Floor Plan/i })).not.toBeInTheDocument()
    })

    it('selecting "All" brings back the full list', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // Filter to Elevation.
      await userEvent.click(screen.getByRole('button', { name: /^Elevation$/i }))
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: /Ground Floor Plan/i })).not.toBeInTheDocument()
      })

      // Click All — Ground Floor Plan returns.
      await userEvent.click(screen.getByRole('button', { name: /^All$/i }))
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Ground Floor Plan/i })).toBeInTheDocument()
      })
    })

    it('each DrawingRow shows a kind badge', async () => {
      mockListRegister.mockResolvedValue([rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // "Plan" and "Elevation" badges should appear in the list rows.
      const planBadges = screen.getAllByText(/^Plan$/i)
      expect(planBadges.length).toBeGreaterThan(0)

      const elevationBadges = screen.getAllByText(/^Elevation$/i)
      expect(elevationBadges.length).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // 3. Linked site changes
  // -------------------------------------------------------------------------

  describe('3. Linked site changes', () => {
    it('shows linked site change in the drawer for a matching linked_drawing_id', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
      mockSiteChangesList.mockResolvedValue([linkedSiteChange, unrelatedException])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // Open the Ground Floor Plan drawer — its chain is [drw-mock-2, drw-mock-1].
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))

      const dialog = await screen.findByRole('dialog')

      // The linked site change (sc-mock-2) is linked to drw-mock-2 which is in the chain.
      await waitFor(() => {
        expect(
          within(dialog).getByText(/Window sill height reduced to 800mm/i),
        ).toBeInTheDocument()
      })
    })

    it('does NOT show unrelated site changes (no linked_drawing_id match)', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
      mockSiteChangesList.mockResolvedValue([unrelatedException])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))

      const dialog = await screen.findByRole('dialog')

      await waitFor(() => {
        // The linked changes section header should not appear (no matches).
        expect(within(dialog).queryByText(/Unrelated change/i)).not.toBeInTheDocument()
      })
    })

    it('does NOT show linked changes section when there are none (empty/omitted)', async () => {
      mockListRegister.mockResolvedValue([rowElevation])
      mockSiteChangesList.mockResolvedValue([])

      renderPage()

      await screen.findByRole('heading', { name: /North Elevation/i })
      await userEvent.click(screen.getByRole('heading', { name: /North Elevation/i }))

      const dialog = await screen.findByRole('dialog')

      await waitFor(() => {
        expect(within(dialog).queryByText(/Linked site changes/i)).not.toBeInTheDocument()
      })
    })

    it('shows the status pill and room for a linked change', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2])
      mockSiteChangesList.mockResolvedValue([linkedSiteChange])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))

      const dialog = await screen.findByRole('dialog')

      // Wait for the site changes query to resolve and show the change title.
      await waitFor(() => {
        expect(
          within(dialog).getByText(/Window sill height reduced to 800mm/i),
        ).toBeInTheDocument()
      })

      // Find the "Linked site changes" section heading and assert within its section.
      // The section is a <section> containing the heading and the change list.
      const linkedSection = within(dialog).getByText(/^Linked site changes$/i).closest('section')!
      expect(linkedSection).toBeInTheDocument()

      // Status 'linked' pill text should appear in the section.
      const linkedTexts = within(linkedSection).getAllByText(/^linked$/i)
      expect(linkedTexts.length).toBeGreaterThan(0)

      // Room 'Kitchen' should appear in the section (not the change_note "Kitchen enlarged").
      const roomTexts = within(linkedSection).getAllByText(/^Kitchen$/i)
      expect(roomTexts.length).toBeGreaterThan(0)
    })

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
      expect(within(linkedSection).getByText('Linked')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // 4. Supersede confirm
  // -------------------------------------------------------------------------

  describe('4. Supersede confirm', () => {
    it('clicking "Upload new revision" in the drawer shows the revision upload panel', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // Open the drawer.
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))
      await screen.findByRole('dialog')

      // Click the "Upload new revision" button in the drawer footer.
      const drawerUploadBtn = screen.getByRole('button', { name: /Upload new revision/i })
      await userEvent.click(drawerUploadBtn)

      // The version input should appear inside the drawer.
      await waitFor(() => {
        expect(
          screen.getByLabelText(/^Version$/i),
        ).toBeInTheDocument()
      })
    })

    it('clicking Save opens the ConfirmDialog before publishing', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // Open drawer.
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))
      await screen.findByRole('dialog')

      // Open the upload panel.
      await userEvent.click(screen.getByRole('button', { name: /Upload new revision/i }))

      // Fill in version + file.
      const versionInput = await screen.findByLabelText(/^Version$/i)
      await userEvent.clear(versionInput)
      await userEvent.type(versionInput, 'v3')

      const fileInput = screen.getByLabelText(/^File$/i)
      const fakeFile = new File(['pdf'], 'ground-v3.pdf', { type: 'application/pdf' })
      await userEvent.upload(fileInput, fakeFile)

      // Click Save — should open ConfirmDialog (not immediately call presign).
      await userEvent.click(screen.getByRole('button', { name: /^Save$/i }))

      // ConfirmDialog should appear.
      await waitFor(() => {
        expect(screen.getByText(/Supersede v2\?/i)).toBeInTheDocument()
        // Append-only message.
        expect(screen.getByText(/never deleted/i)).toBeInTheDocument()
      })

      // presign must NOT have been called yet.
      expect(mockPresign).not.toHaveBeenCalled()
    })

    it('confirming the dialog runs presign → putToR2 → publish with supersedes_id', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])
      mockPresign.mockResolvedValue({ key: 'new-key/ground-v3.pdf', put_url: 'https://r2/put', mode: 'presigned' })
      mockPutToR2.mockResolvedValue(undefined)
      mockPublish.mockResolvedValue({ ...rowV2, id: 'drw-mock-new', version: 'v3', is_current: true })

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // Open drawer.
      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))
      await screen.findByRole('dialog')

      // Open upload panel.
      await userEvent.click(screen.getByRole('button', { name: /Upload new revision/i }))

      const versionInput = await screen.findByLabelText(/^Version$/i)
      await userEvent.clear(versionInput)
      await userEvent.type(versionInput, 'v3')

      const fileInput = screen.getByLabelText(/^File$/i)
      const fakeFile = new File(['pdf'], 'ground-v3.pdf', { type: 'application/pdf' })
      await userEvent.upload(fileInput, fakeFile)

      // Click Save → ConfirmDialog.
      await userEvent.click(screen.getByRole('button', { name: /^Save$/i }))

      await screen.findByText(/Supersede v2\?/i)

      // Confirm.
      await userEvent.click(screen.getByRole('button', { name: /Publish revision/i }))

      // Full chain should have been called.
      await waitFor(() => {
        expect(mockPresign).toHaveBeenCalledWith('site-1', 'ground-v3.pdf', 'application/pdf')
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

    it('cancelling the confirm dialog does NOT call presign', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      await userEvent.click(screen.getByRole('heading', { name: /Ground Floor Plan/i }))
      await screen.findByRole('dialog')

      await userEvent.click(screen.getByRole('button', { name: /Upload new revision/i }))

      const versionInput = await screen.findByLabelText(/^Version$/i)
      await userEvent.clear(versionInput)
      await userEvent.type(versionInput, 'v3')

      const fileInput = screen.getByLabelText(/^File$/i)
      await userEvent.upload(fileInput, new File(['pdf'], 'test.pdf', { type: 'application/pdf' }))

      await userEvent.click(screen.getByRole('button', { name: /^Save$/i }))

      // The ConfirmDialog renders its own dialog — find it and click Cancel inside it.
      const confirmDialog = await screen.findByText(/Supersede v2\?/i)
      expect(confirmDialog).toBeInTheDocument()

      // There are multiple dialogs open (drawer + confirm); get all and find the confirm one.
      const allDialogs = screen.getAllByRole('dialog')
      // The confirm dialog is the one containing the supersede title.
      const confirmDialogEl = allDialogs.find((d) =>
        d.textContent?.includes('Supersede v2?'),
      )!

      await userEvent.click(within(confirmDialogEl).getByRole('button', { name: /^Cancel$/i }))

      // ConfirmDialog should close, presign not called.
      await waitFor(() => {
        expect(screen.queryByText(/Supersede v2\?/i)).not.toBeInTheDocument()
      })
      expect(mockPresign).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // 5. Empty-state CTA
  // -------------------------------------------------------------------------

  describe('5. Empty-state CTA', () => {
    it('shows "Upload your first drawing" button when there are no drawings', async () => {
      mockListRegister.mockResolvedValue([])

      renderPage()

      const ctaButton = await screen.findByRole('button', { name: /Upload your first drawing/i })
      expect(ctaButton).toBeInTheDocument()
    })

    it('clicking the empty-state CTA opens the new drawing form', async () => {
      mockListRegister.mockResolvedValue([])

      renderPage()

      const ctaButton = await screen.findByRole('button', { name: /Upload your first drawing/i })
      await userEvent.click(ctaButton)

      // The new drawing form should appear.
      await waitFor(() => {
        expect(screen.getByLabelText(/Drawing title/i)).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // 6. Sort
  // -------------------------------------------------------------------------

  describe('6. Sort', () => {
    it('default sort is newest-first (North Elevation 2026-06-10 before Ground Floor Plan 2026-06-01)', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      // Wait for both headings to appear.
      await screen.findByRole('heading', { name: /Ground Floor Plan/i })
      await screen.findByRole('heading', { name: /North Elevation/i })

      const headings = screen.getAllByRole('heading', { level: 3 })
      const titles = headings.map((h) => h.textContent ?? '')

      // Newest first: North Elevation (Jun 10) before Ground Floor Plan (Jun 01).
      const elevIdx = titles.findIndex((t) => t.includes('North Elevation'))
      const planIdx = titles.findIndex((t) => t.includes('Ground Floor Plan'))
      expect(elevIdx).toBeLessThan(planIdx)
    })

    it('selecting "Title A–Z" orders Ground Floor Plan before North Elevation', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      // The sort control is a <select> with id "drawings-sort".
      // Use getByRole('combobox') scoped by name to avoid collision with KindFilter group.
      const sortSelect = screen.getByRole('combobox', { name: /Sort/i })
      await userEvent.selectOptions(sortSelect, 'title_az')

      await waitFor(() => {
        const headings = screen.getAllByRole('heading', { level: 3 })
        const titles = headings.map((h) => h.textContent ?? '')
        const planIdx = titles.findIndex((t) => t.includes('Ground Floor Plan'))
        const elevIdx = titles.findIndex((t) => t.includes('North Elevation'))
        // G before N alphabetically.
        expect(planIdx).toBeLessThan(elevIdx)
      })
    })

    it('selecting "Oldest first" reverses the default newest-first order', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      await screen.findByRole('heading', { name: /Ground Floor Plan/i })

      const sortSelect = screen.getByRole('combobox', { name: /Sort/i })
      await userEvent.selectOptions(sortSelect, 'oldest')

      await waitFor(() => {
        const headings = screen.getAllByRole('heading', { level: 3 })
        const titles = headings.map((h) => h.textContent ?? '')
        const elevIdx = titles.findIndex((t) => t.includes('North Elevation'))
        const planIdx = titles.findIndex((t) => t.includes('Ground Floor Plan'))
        // Oldest: Ground Floor Plan (Jun 01) before North Elevation (Jun 10).
        expect(planIdx).toBeLessThan(elevIdx)
      })
    })
  })

  // -------------------------------------------------------------------------
  // Existing tests preserved (grouping + version history from legacy suite)
  // -------------------------------------------------------------------------

  describe('Grouping + version history (existing)', () => {
    it('renders TWO drawing rows (the two current rows only)', async () => {
      mockListRegister.mockResolvedValue([rowV1, rowV2, rowElevation])

      renderPage()

      expect(await screen.findByRole('heading', { name: /Ground Floor Plan/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /North Elevation/i })).toBeInTheDocument()
      // v1 is not current — should NOT appear as a heading.
      const headings = screen.getAllByRole('heading', { level: 3 })
      expect(headings).toHaveLength(2)
    })
  })
})
