import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../../i18n'

// --------------------------------------------------------------------------
// Network-free mocks. Must be declared BEFORE the dynamic import of the SUT.
// --------------------------------------------------------------------------

const dprPackPdf = vi.fn()
const progressPdf = vi.fn()
vi.mock('../../../api/reports', () => ({
  reportsApi: {
    dprPackPdf: (...a: unknown[]) => dprPackPdf(...a),
    progressPdf: (...a: unknown[]) => progressPdf(...a),
  },
}))

const exportTally = vi.fn()
vi.mock('../../../api/reconcile', async (orig) => {
  const actual = await orig<typeof import('../../../api/reconcile')>()
  return {
    ...actual, // keep the real StepUpRequiredError class
    reconcileApi: { exportTally: (...a: unknown[]) => exportTally(...a) },
  }
})

const stepUpVerify = vi.fn()
vi.mock('../../../api/auth', async (orig) => {
  const actual = await orig<typeof import('../../../api/auth')>()
  return {
    ...actual, // keep getToken / setToken etc.
    authApi: { ...actual.authApi, stepUpVerify: (...a: unknown[]) => stepUpVerify(...a) },
  }
})

// Mock useMeRole → owner so all templates are visible.
vi.mock('../../../auth/useCan', () => ({
  useMeRole: () => 'owner',
  useCan: (cap: string) => cap === 'export_tally',
}))

// Mock the AppShell so it doesn't pull in router-dependent chrome.
vi.mock('../../../ui', async (orig) => {
  const actual = await orig<typeof import('../../../ui')>()
  return {
    ...actual,
    AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useRoleTabs: () => [],
  }
})

// Mock useSites (used inside ReportsPage via hooks).
const mockSitesData = {
  items: [{ id: 'site-1', name: 'Tower A', status: 'active', location: 'Delhi', type: 'residential', company_id: 'co-1', created_at: '2026-01-01' }],
  next_cursor: null,
}
vi.mock('../../../api/hooks', () => ({
  useSites: () => ({ data: mockSitesData, isLoading: false, isError: false, error: null }),
}))

// Mock approvals (AppShell side-effect).
vi.mock('../../../api/approvals', () => ({
  approvalsApi: { unreadCount: () => Promise.resolve(0) },
}))

// Dynamic imports AFTER mocks are declared.
const { ReportsPage } = await import('../ReportsPage')
const { StepUpRequiredError } = await import('../../../api/reconcile')
import React from 'react'

// --------------------------------------------------------------------------
// Render helper
// --------------------------------------------------------------------------

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  // Seed the 'me' query so AppShell (even if mocked) + useMeRole don't fetch.
  qc.setQueryData(['me'], { role: 'owner' })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <ReportsPage />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('ReportsPage', () => {
  beforeEach(() => {
    dprPackPdf.mockReset()
    progressPdf.mockReset()
    exportTally.mockReset()
    stepUpVerify.mockReset()
    // jsdom lacks object URLs / anchor downloads — stub them.
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  it('renders all 4 template rows; payroll row is disabled', async () => {
    renderPage()
    // Wait for the page to settle.
    expect(await screen.findByText('Site progress')).toBeInTheDocument()
    expect(screen.getByText('DPR pack')).toBeInTheDocument()
    expect(screen.getByText('Tally export')).toBeInTheDocument()
    // Payroll row visible but disabled with "Coming soon".
    expect(screen.getByText('Payroll')).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })

  it('DPR pack: choose site + date → Generate → Download link appears', async () => {
    const mockBlob = new Blob(['%PDF-1'], { type: 'application/pdf' })
    dprPackPdf.mockResolvedValue(mockBlob)

    renderPage()

    // Click the DPR template row to select it.
    await userEvent.click(await screen.findByText('DPR pack'))

    // Site selector and date input should appear.
    const siteSelect = await screen.findByRole('combobox', { name: /site/i })
    await userEvent.selectOptions(siteSelect, 'site-1')

    const dateInput = screen.getByLabelText(/date/i)
    await userEvent.clear(dateInput)
    await userEvent.type(dateInput, '2026-06-14')

    // Click Generate.
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))

    // Wait for the download link to appear.
    await waitFor(() =>
      expect(dprPackPdf).toHaveBeenCalledWith('site-1', '2026-06-14'),
    )
    expect(await screen.findByRole('link', { name: /download/i })).toBeInTheDocument()
  })

  it('Tally OTP flow: step_up_required → OTP input → verify → CSV downloaded', async () => {
    // First call 403s; after verify it succeeds.
    exportTally
      .mockRejectedValueOnce(new StepUpRequiredError())
      .mockResolvedValueOnce('key,status\na,matched\n')
    stepUpVerify.mockResolvedValue({ token: 't', expiresIn: 300 })

    renderPage()

    // Click the Tally template row.
    await userEvent.click(await screen.findByText('Tally export'))

    // Site selector appears (needsSite=true for tally).
    const siteSelect = await screen.findByRole('combobox', { name: /site/i })
    await userEvent.selectOptions(siteSelect, 'site-1')

    // Click Generate — should hit step_up_required.
    await userEvent.click(screen.getByRole('button', { name: /generate/i }))

    // OTP input should appear.
    const otpInput = await screen.findByLabelText(/verification code/i)
    await userEvent.type(otpInput, '000000')
    await userEvent.click(screen.getByRole('button', { name: /verify/i }))

    // stepUpVerify called, then exportTally with the token.
    await waitFor(() => expect(stepUpVerify).toHaveBeenCalledWith('000000'))
    await waitFor(() =>
      expect(exportTally).toHaveBeenLastCalledWith('site-1', 't'),
    )
    // CSV download should trigger via the anchor click.
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
  })
})
