import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'
import type { OwnerHome, SiteCard } from '../../api/dashboard'

// Network-free: mock the dashboard + the approvals bell (AppShell polls it).
const getHome = vi.fn()
const createDecision = vi.fn()
vi.mock('../../api/dashboard', () => ({
  dashboardApi: {
    getHome: (...a: unknown[]) => getHome(...a),
    createDecision: (...a: unknown[]) => createDecision(...a),
  },
}))
vi.mock('../../api/approvals', () => ({
  approvalsApi: {
    unreadCount: () => Promise.resolve(0),
    notifications: () => Promise.resolve([]),
    markRead: () => Promise.resolve(),
    list: () => Promise.resolve({ items: [], next_cursor: null }),
  },
}))

vi.mock('../../api/auth', async () => {
  const actual = await vi.importActual<typeof import('../../api/auth')>('../../api/auth')
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      listTeam: () =>
        Promise.resolve([
          { id: 'u-ravi', company_id: 'co', name: 'Ravi', phone: '+91', role: 'supervisor', is_active: true },
        ]),
    },
  }
})

const { Today } = await import('./Today')

function site(over: Partial<SiteCard> = {}): SiteCard {
  return {
    site_id: 's1',
    name: 'Tower B',
    status: 'risk',
    expected_headcount: 10,
    top_risks: [],
    risk_overflow: 0,
    counts: { attendance: 0, deliveries: 0, issues: 0, total: 0 },
    pulse: [],
    ...over,
  }
}

function home(sites: SiteCard[]): OwnerHome {
  return {
    brief_date: '2026-06-04',
    needs_attention_count: sites.reduce((n, s) => n + s.top_risks.length, 0),
    sites_total: sites.length,
    sites_needing_attention: sites.filter((s) => s.top_risks.length > 0).length,
    cold_start: false,
    setup_checklist: [],
    sites,
  }
}

const MONEY_SITE = site({
  site_id: 's1',
  name: 'Tower B',
  status: 'risk',
  counts: { attendance: 9, deliveries: 1, issues: 0, total: 10 },
  top_risks: [
    {
      site_id: 's1',
      kind: 'pending_approval',
      severity: 'high',
      status: 'risk',
      message: 'Approve extra 50 bags of cement (₹17,500)',
      evidence_event_ids: ['e1'],
    },
  ],
})

const OPS_SITE = site({
  site_id: 's2',
  name: 'Villa A',
  status: 'warn',
  counts: { attendance: 4, deliveries: 0, issues: 1, total: 5 },
  top_risks: [
    {
      site_id: 's2',
      kind: 'labor_shortfall',
      severity: 'med',
      status: 'warn',
      message: 'Only 4 of 12 workers present',
      evidence_event_ids: [],
    },
  ],
})

function renderToday(role = 'pm') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <Today />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('PM Today', () => {
  beforeEach(() => {
    getHome.mockReset()
    createDecision.mockReset()
    createDecision.mockResolvedValue({})
  })

  it('shows the owner-only note on money exceptions — never an Approve or Hold chip', async () => {
    getHome.mockResolvedValue(home([MONEY_SITE]))
    renderToday('pm')
    expect(
      await screen.findByText(/only the owner can approve this/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^hold$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /propose/i })).not.toBeInTheDocument()
  })

  it('lets the PM assign an exception to a chosen teammate', async () => {
    getHome.mockResolvedValue(home([OPS_SITE]))
    renderToday('pm')
    const assign = await screen.findByRole('button', { name: /assign/i })
    await userEvent.click(assign)
    await userEvent.click(await screen.findByRole('button', { name: /ravi/i }))
    await waitFor(() => expect(createDecision).toHaveBeenCalled())
    expect(createDecision.mock.calls[0][0]).toMatchObject({
      site_id: 's2',
      action: 'assign',
      assigned_to: 'u-ravi',
    })
  })

  it('shows the calm state when no site needs action', async () => {
    getHome.mockResolvedValue(home([site({ top_risks: [] })]))
    renderToday('pm')
    expect(
      await screen.findByText(/nothing needs assigning/i),
    ).toBeInTheDocument()
  })

  it('shape-to-role: an owner viewing this surface sees Approve ₹ on money', async () => {
    getHome.mockResolvedValue(home([MONEY_SITE]))
    renderToday('owner')
    expect(
      await screen.findByRole('button', { name: /approve/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /propose to owner/i }),
    ).not.toBeInTheDocument()
  })
})
