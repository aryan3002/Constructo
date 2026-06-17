/**
 * D5 Intake — Labs-aware design brief surface tests.
 *
 * Covers:
 *  1. Unavailable path: profileBySite → null → honest EmptyState (no brief, no dead controls)
 *  2. Available path: profile + brief → headline / summary / sections rendered
 *  3. Available path: themes with status pills render for each area
 *  4. Theme decision (architect): Approve → themeDecision called + toast shown
 *  5. Materialize: click button → ConfirmDialog → confirm → materialize called + toast
 *  6. Read-only role (supervisor): brief renders but no Approve/Adjust/Reject/Materialize
 *  7. Error state: profileBySite throws (non-404) → ErrorState rendered
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'
import { ToastProvider } from '../../../ui/Toast'

// ---------------------------------------------------------------------------
// Mock the design API before importing the SUT (vi.mock is hoisted)
// ---------------------------------------------------------------------------

const mockProfileBySite = vi.fn()
const mockBrief = vi.fn()
const mockThemesForArea = vi.fn()
const mockThemeDecision = vi.fn()
const mockMaterialize = vi.fn()

vi.mock('../../../api/design', () => ({
  designApi: {
    profileBySite: (...a: unknown[]) => mockProfileBySite(...a),
    brief: (...a: unknown[]) => mockBrief(...a),
    themesForArea: (...a: unknown[]) => mockThemesForArea(...a),
    themeDecision: (...a: unknown[]) => mockThemeDecision(...a),
    materialize: (...a: unknown[]) => mockMaterialize(...a),
  },
}))

// Mock useMeRole — typed broadly so tests can switch roles
const mockUseMeRole = vi.fn<() => string | undefined>(() => 'architect')

vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => mockUseMeRole(),
  useCan: () => true,
  useMe: () => ({ data: undefined }),
}))

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_PROFILE = {
  id: 'profile-1',
  company_id: 'co-1',
  site_id: 'site-1',
  scope_type: 'whole_house',
  status: 'intake_started',
  created_at: '2026-06-10T10:00:00Z',
  areas: [
    {
      id: 'area-lr',
      area_kind: 'room',
      area_key: 'living-room',
      recommended_count: 6,
      status: 'active',
      confidence: 0.84,
      has_conflict: false,
    },
    {
      id: 'area-mb',
      area_kind: 'room',
      area_key: 'master-bedroom',
      recommended_count: 6,
      status: 'active',
      confidence: 0.94,
      has_conflict: false,
    },
  ],
  contributors: [],
  my_contributor_id: null,
}

const MOCK_BRIEF = {
  id: 'rendering-1',
  brief_id: 'brief-1',
  audience: 'architect',
  scope: 'whole_house',
  content_json: {
    scope_type: 'whole_house',
    areas: [],
    narrative: {
      headline: 'A warm, nature-rooted home',
      summary: 'Strong consensus on warm earth tones across contributors.',
      sections: [
        { title: 'Living Room', body: 'Warm Contemporary direction recommended.' },
        { title: 'Master Bedroom', body: 'High-confidence consensus. Ready to specify.' },
      ],
    },
  },
  narrative: {
    headline: 'A warm, nature-rooted home',
    summary: 'Strong consensus on warm earth tones across contributors.',
    sections: [
      { title: 'Living Room', body: 'Warm Contemporary direction recommended.' },
      { title: 'Master Bedroom', body: 'High-confidence consensus. Ready to specify.' },
    ],
  },
  areas: [],
  version: 2,
  created_at: '2026-06-10T12:00:00Z',
}

const MOCK_THEMES_LR = [
  {
    id: 'theme-1',
    area_id: 'area-lr',
    name: 'Warm Contemporary',
    confidence: 0.91,
    palette: ['#F5ECD7', '#C8B8A2'],
    materials: ['Ivory vitrified tile', 'Teak veneer'],
    rationale: 'Strong consensus on warm neutrals.',
    evidence_reference_ids: [],
    status: 'suggested',
    created_at: '2026-06-10T10:00:00Z',
  },
]

const MOCK_THEMES_MB = [
  {
    id: 'theme-3',
    area_id: 'area-mb',
    name: 'Earthy Sanctuary',
    confidence: 0.94,
    palette: ['#EDE3D6'],
    materials: ['Walnut headboard'],
    rationale: 'All contributors agreed.',
    evidence_reference_ids: [],
    status: 'approved',
    created_at: '2026-06-09T14:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

function wrap(ui: React.ReactElement) {
  const qc = makeQC()
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <ToastProvider>
          <MemoryRouter>{ui}</MemoryRouter>
        </ToastProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

// Import SUT after mocks are in place
import { Intake } from '../Intake'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Intake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseMeRole.mockReturnValue('architect' as const)
    mockThemesForArea.mockResolvedValue([])
    mockMaterialize.mockResolvedValue({
      materials_created: 3,
      materials_reused: 0,
      specs_created: 5,
      specs_reused: 0,
      skipped_areas: [],
    })
  })

  // -------------------------------------------------------------------------
  // 1. Unavailable path
  // -------------------------------------------------------------------------

  it('shows honest EmptyState when no siteId provided', async () => {
    wrap(<Intake siteId={undefined} />)
    await screen.findByText(/Design intake not enabled here/i)
    expect(screen.queryByRole('button', { name: /Approve/i })).toBeNull()
    expect(screen.queryByText(/Materialize/i)).toBeNull()
  })

  it('shows honest EmptyState when profile is null (Labs off)', async () => {
    mockProfileBySite.mockResolvedValue(null)
    wrap(<Intake siteId="site-1" />)
    await screen.findByText(/Design intake not enabled here/i)
    expect(screen.queryByRole('button', { name: /Approve/i })).toBeNull()
    expect(screen.queryByText(/Materialize/i)).toBeNull()
  })

  // -------------------------------------------------------------------------
  // 2. Available path — brief headline / summary / sections
  // -------------------------------------------------------------------------

  it('renders brief headline, summary, and sections when available', async () => {
    mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
    mockBrief.mockResolvedValue(MOCK_BRIEF)
    mockThemesForArea.mockResolvedValue([])

    wrap(<Intake siteId="site-1" />)

    await screen.findByText('A warm, nature-rooted home')
    expect(screen.getByText(/Strong consensus on warm earth tones/i)).toBeInTheDocument()
    // "Living Room" appears in both narrative section header AND the area themes section header
    expect(screen.getAllByText('Living Room').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Master Bedroom').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Warm Contemporary direction recommended/i)).toBeInTheDocument()
  })

  it('renders the brief version chip', async () => {
    mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
    mockBrief.mockResolvedValue(MOCK_BRIEF)
    mockThemesForArea.mockResolvedValue([])

    wrap(<Intake siteId="site-1" />)
    await screen.findByText('A warm, nature-rooted home')
    expect(screen.getByText(/Brief v2/i)).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 3. Themes with status pills
  // -------------------------------------------------------------------------

  it('renders themes per area with status pills', async () => {
    mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
    mockBrief.mockResolvedValue(MOCK_BRIEF)
    mockThemesForArea
      .mockResolvedValueOnce(MOCK_THEMES_LR)   // living-room
      .mockResolvedValueOnce(MOCK_THEMES_MB)   // master-bedroom

    wrap(<Intake siteId="site-1" />)

    await screen.findByText('A warm, nature-rooted home')
    await screen.findByText('Warm Contemporary')
    await screen.findByText('Earthy Sanctuary')

    // Status pills
    const proposedPill = screen.getByText('Proposed')
    expect(proposedPill).toBeInTheDocument()

    const approvedPill = screen.getByText('Approved')
    expect(approvedPill).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 4. Theme decision (architect role)
  // -------------------------------------------------------------------------

  it('architect can approve a suggested theme — calls themeDecision + shows toast', async () => {
    mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
    mockBrief.mockResolvedValue(MOCK_BRIEF)
    mockThemesForArea
      .mockResolvedValueOnce(MOCK_THEMES_LR)
      .mockResolvedValueOnce(MOCK_THEMES_MB)

    mockThemeDecision.mockResolvedValue({ ...MOCK_THEMES_LR[0], status: 'approved' })

    wrap(<Intake siteId="site-1" />)

    await screen.findByText('Warm Contemporary')

    const approveBtn = screen.getByRole('button', {
      name: /Approve Warm Contemporary/i,
    })
    await userEvent.click(approveBtn)

    await waitFor(() => {
      expect(mockThemeDecision).toHaveBeenCalledWith('theme-1', { action: 'approve' })
    })

    await screen.findByText(/Theme approved/i)
  })

  it('architect can reject a suggested theme — calls themeDecision with reject', async () => {
    mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
    mockBrief.mockResolvedValue(MOCK_BRIEF)
    mockThemesForArea
      .mockResolvedValueOnce(MOCK_THEMES_LR)
      .mockResolvedValueOnce(MOCK_THEMES_MB)

    mockThemeDecision.mockResolvedValue({ ...MOCK_THEMES_LR[0], status: 'rejected' })

    wrap(<Intake siteId="site-1" />)
    await screen.findByText('Warm Contemporary')

    const rejectBtn = screen.getByRole('button', {
      name: /Reject Warm Contemporary/i,
    })
    await userEvent.click(rejectBtn)

    await waitFor(() => {
      expect(mockThemeDecision).toHaveBeenCalledWith('theme-1', { action: 'reject' })
    })
    await screen.findByText(/Theme rejected/i)
  })

  // -------------------------------------------------------------------------
  // 5. Materialize
  // -------------------------------------------------------------------------

  it('materialize: click → confirm dialog → confirm → materialize called + toast', async () => {
    mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
    mockBrief.mockResolvedValue(MOCK_BRIEF)
    mockThemesForArea.mockResolvedValue([])

    wrap(<Intake siteId="site-1" />)
    await screen.findByText('A warm, nature-rooted home')

    const materializeBtn = screen.getByTestId('materialize-btn')
    await userEvent.click(materializeBtn)

    // Confirm dialog should open
    await screen.findByRole('dialog')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const confirmBtn = screen.getByRole('button', { name: /Create specs/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(mockMaterialize).toHaveBeenCalledWith('brief-1')
    })

    await screen.findByText(/Proposed 5 spec line/i)
  })

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

  // -------------------------------------------------------------------------
  // 6. Non-decider role (supervisor) — read-only
  // -------------------------------------------------------------------------

  it('supervisor sees brief read-only — no decision buttons, no materialize', async () => {
    mockUseMeRole.mockReturnValue('supervisor')
    mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
    mockBrief.mockResolvedValue(MOCK_BRIEF)
    mockThemesForArea
      .mockResolvedValueOnce(MOCK_THEMES_LR)
      .mockResolvedValueOnce(MOCK_THEMES_MB)

    wrap(<Intake siteId="site-1" />)

    await screen.findByText('A warm, nature-rooted home')
    await screen.findByText('Warm Contemporary')

    // No decision buttons
    expect(screen.queryByRole('button', { name: /Approve Warm Contemporary/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Reject Warm Contemporary/i })).toBeNull()
    // No materialize button
    expect(screen.queryByTestId('materialize-btn')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // 7. Error state (non-404 error)
  // -------------------------------------------------------------------------

  it('shows ErrorState when profileBySite throws a non-404 error', async () => {
    mockProfileBySite.mockRejectedValue(new Error('Network error'))
    wrap(<Intake siteId="site-1" />)
    await screen.findByText(/Could not load the design brief/i)
  })

  // -------------------------------------------------------------------------
  // 8. No brief yet (profile exists but brief is null)
  // -------------------------------------------------------------------------

  it('shows EmptyState when profile exists but no brief generated yet', async () => {
    mockProfileBySite.mockResolvedValue(MOCK_PROFILE)
    mockBrief.mockResolvedValue(null)

    wrap(<Intake siteId="site-1" />)
    await screen.findByText(/No brief generated yet/i)
    expect(screen.queryByRole('button', { name: /Materialize/i })).toBeNull()
  })
})
