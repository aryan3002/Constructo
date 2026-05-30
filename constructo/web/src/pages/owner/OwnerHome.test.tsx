import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'

// Mock the owned api module so the page is fully network-free.
const getHome = vi.fn()
const createDecision = vi.fn()
vi.mock('../../api/dashboard', () => ({
  dashboardApi: {
    getHome: (...a: unknown[]) => getHome(...a),
    createDecision: (...a: unknown[]) => createDecision(...a),
  },
}))

const { OwnerHome } = await import('./OwnerHome')
import type { OwnerHome as OwnerHomeData } from '../../api/dashboard'

function renderHome() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <OwnerHome />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

const COLD_START: OwnerHomeData = {
  brief_date: '2026-05-28',
  needs_attention_count: 0,
  sites_total: 0,
  sites_needing_attention: 0,
  cold_start: true,
  setup_checklist: [
    { key: 'add_site', done: false, title_key: 'owner.setup.add_site' },
    { key: 'connect_whatsapp', done: false, title_key: 'owner.setup.connect_whatsapp' },
    { key: 'set_baseline', done: false, title_key: 'owner.setup.set_baseline' },
  ],
  sites: [],
}

const WITH_RISK: OwnerHomeData = {
  brief_date: '2026-05-28',
  needs_attention_count: 1,
  sites_total: 1,
  sites_needing_attention: 1,
  cold_start: false,
  setup_checklist: [],
  sites: [
    {
      site_id: 'site-1',
      name: 'Tower B',
      status: 'risk',
      expected_headcount: 10,
      top_risks: [
        {
          site_id: 'site-1',
          kind: 'labor_shortfall',
          severity: 'high',
          status: 'risk',
          message: 'Attendance 3 below expected 10',
          evidence_event_ids: ['ev-1'],
        },
      ],
      risk_overflow: 0,
      counts: { attendance: 1, deliveries: 0, issues: 0, total: 1 },
      pulse: [
        { kind: 'cash', status: 'ok', value: 0, evidence_event_ids: [], facts: {} },
        {
          kind: 'labor',
          status: 'risk',
          value: 3,
          evidence_event_ids: ['ev-1'],
          facts: { attendance: 3 },
        },
        { kind: 'material', status: 'ok', value: 0, evidence_event_ids: [], facts: {} },
        { kind: 'progress', status: 'ok', value: 0, evidence_event_ids: [], facts: {} },
      ],
    },
  ],
}

describe('OwnerHome', () => {
  beforeEach(() => {
    getHome.mockReset()
    createDecision.mockReset()
  })

  it('shows the cold-start setup checklist instead of a blank grid', async () => {
    getHome.mockResolvedValue(COLD_START)
    renderHome()

    expect(await screen.findByText('Finish setting up')).toBeInTheDocument()
    expect(screen.getByText('Add your first site')).toBeInTheDocument()
    expect(screen.getByText('Set the expected daily headcount')).toBeInTheDocument()
    // headline reads "All sites calm" when nothing needs attention
    expect(screen.getByText('All sites calm')).toBeInTheDocument()
  })

  it('renders the headline, the command card risk, and a tappable proof', async () => {
    getHome.mockResolvedValue(WITH_RISK)
    renderHome()

    expect(
      await screen.findByText('1 thing needs you today across 1 sites'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /attendance 3 below expected 10/i }),
    ).toBeInTheDocument()

    // The signature "Show proof" control reveals the linked evidence in place.
    const proof = screen.getAllByRole('button', { name: /show proof/i })[0]
    await userEvent.click(proof)
    expect(await screen.findByText('ev-1')).toBeInTheDocument()
  })

  it('posts a decision when an inline action chip is used', async () => {
    getHome.mockResolvedValue(WITH_RISK)
    createDecision.mockResolvedValue({ id: 'd1' })
    renderHome()

    await screen.findByRole('heading', { name: /attendance 3 below expected 10/i })
    const approve = screen.getAllByRole('button', { name: /^approve$/i })[0]
    await userEvent.click(approve)

    await waitFor(() => expect(createDecision).toHaveBeenCalledTimes(1))
    expect(createDecision.mock.calls[0][0]).toMatchObject({
      site_id: 'site-1',
      action: 'approve',
      evidence_event_ids: ['ev-1'],
    })
  })

  it('renders the 2x2 pulse grid with all four tiles', async () => {
    getHome.mockResolvedValue(WITH_RISK)
    renderHome()

    const grid = await screen.findByRole('list', { name: /today’s pulse/i })
    const tiles = within(grid).getAllByRole('button')
    expect(tiles).toHaveLength(4)
    // labor tile is tappable (has evidence); others are disabled (no evidence)
    expect(within(grid).getByRole('button', { name: /labor/i })).toBeEnabled()
  })
})
