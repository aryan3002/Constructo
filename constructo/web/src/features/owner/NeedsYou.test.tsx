import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Decision, Paginated } from '../../api/approvals'
import type { OwnerHome } from '../../api/dashboard'
import { ApiError } from '../../api/client'

const list = vi.fn()
const approve = vi.fn()
const hold = vi.fn()
vi.mock('../../api/approvals', async () => {
  const actual = await vi.importActual<typeof import('../../api/approvals')>('../../api/approvals')
  return {
    ...actual,
    approvalsApi: {
      ...actual.approvalsApi,
      list: (...a: unknown[]) => list(...a),
      approve: (...a: unknown[]) => approve(...a),
      hold: (...a: unknown[]) => hold(...a),
    },
  }
})
const createDecision = vi.fn()
vi.mock('../../api/dashboard', () => ({
  dashboardApi: { createDecision: (...a: unknown[]) => createDecision(...a) },
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
          { id: 'u-gone', company_id: 'co', name: 'Gone', phone: '+92', role: 'supervisor', is_active: false },
        ]),
    },
  }
})
// DecisionLog reads its own query; stub it to keep this test focused.
vi.mock('./DecisionLog', () => ({ DecisionLog: () => <div data-testid="decision-log" /> }))

const { NeedsYou } = await import('./NeedsYou')

function dec(over: Partial<Decision> = {}): Decision {
  return {
    id: 'dec-1', company_id: 'co', site_id: 'site-a', kind: 'approval',
    title: 'Approve extra 50 bags cement (₹17,500)', detail: null, raised_by: null,
    assigned_to: null, state: 'pending', sla_due_at: null, resolved_at: null,
    resolution_note: null, evidence_event_ids: [], created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), ...over,
  }
}
function paged(items: Decision[]): Paginated<Decision> { return { items, next_cursor: null } }

function home(): OwnerHome {
  return {
    brief_date: '2026-07-03', needs_attention_count: 2, sites_total: 1, sites_needing_attention: 1,
    cold_start: false, setup_checklist: [],
    sites: [{
      site_id: 'site-a', name: 'Tower B', status: 'risk', expected_headcount: 10, risk_overflow: 0,
      counts: { attendance: 1, deliveries: 0, issues: 0, total: 2 }, pulse: [],
      top_risks: [
        { site_id: 'site-a', kind: 'unverified_invoice', severity: 'high', status: 'risk',
          message: 'Invoice received with no matching delivery', evidence_event_ids: ['ev-inv'] },
        { site_id: 'site-a', kind: 'labor_shortfall', severity: 'medium', status: 'warn',
          message: 'Attendance 3 of 10', evidence_event_ids: ['ev-att'] },
      ],
    }],
  }
}

function renderNeeds(items: Decision[], role = 'owner', opts: { selectedSiteId?: string | null; withHome?: boolean } = {}) {
  list.mockResolvedValue(paged(items))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  qc.setQueryData(['me'], { id: 'u1', role })
  const view = render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <NeedsYou
          date="2026-07-03"
          home={opts.withHome ? home() : undefined}
          selectedSiteId={opts.selectedSiteId ?? null}
          siteNames={{ 'site-a': 'Tower B' }}
        />
      </LanguageProvider>
    </QueryClientProvider>,
  )
  return { ...view, qc }
}

describe('<NeedsYou>', () => {
  beforeEach(() => {
    list.mockReset(); approve.mockReset(); hold.mockReset(); createDecision.mockReset()
    approve.mockResolvedValue({}); hold.mockResolvedValue({}); createDecision.mockResolvedValue({})
  })
  afterEach(() => { vi.useRealTimers() })

  it('lists open approvals and unhandled risks — not held payments, questions or settled rows', async () => {
    renderNeeds([
      dec({ id: 'a', kind: 'approval', state: 'pending' }),
      dec({ id: 'b', kind: 'homeowner_question', state: 'pending', title: 'Homeowner Q' }),
      dec({ id: 'c', kind: 'approval', state: 'resolved', title: 'Old approval' }),
      dec({ id: 'd', kind: 'hold_payment', state: 'pending', title: 'Hold payment to Jindal' }),
    ], 'owner', { withHome: true })
    expect(await screen.findByText(/Approve extra 50 bags/)).toBeInTheDocument()
    expect(screen.getByText('Invoice received with no matching delivery')).toBeInTheDocument()
    expect(screen.getByText('Attendance 3 of 10')).toBeInTheDocument()
    expect(screen.queryByText('Homeowner Q')).not.toBeInTheDocument()
    expect(screen.queryByText('Old approval')).not.toBeInTheDocument()
    expect(screen.queryByText(/Hold payment to Jindal/)).not.toBeInTheDocument()
  })

  it('honest empty state when nothing is pending', async () => {
    renderNeeds([dec({ kind: 'approval', state: 'resolved' })])
    expect(await screen.findByText(/Nothing needs a decision right now/i)).toBeInTheDocument()
  })

  it('Approve asks first, then waits 5 seconds with Undo before resolving that decision', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderNeeds([dec({ id: 'a' })], 'owner')
    await user.click(await screen.findByRole('button', { name: /approve ₹/i }))
    const dialog = await screen.findByRole('dialog', { name: /approve this\?/i })
    expect(within(dialog).getByText(/undo for 5 seconds/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /^approve$/i }))

    // Hidden while it waits; the undo bar says what will be recorded.
    expect(await screen.findByText(/Approved: Approve extra 50 bags/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve ₹/i })).not.toBeInTheDocument()
    expect(approve).not.toHaveBeenCalled()

    await act(async () => { vi.advanceTimersByTime(5000) })
    await waitFor(() => expect(approve).toHaveBeenCalledWith('a'))
    expect(createDecision).not.toHaveBeenCalled()
  })

  it('Undo cancels the money action and brings the row back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderNeeds([dec({ id: 'a' })], 'owner')
    await user.click(await screen.findByRole('button', { name: /^hold$/i }))
    const dialog = await screen.findByRole('dialog', { name: /on hold\?/i })
    await user.click(within(dialog).getByRole('button', { name: /^hold$/i }))
    await user.click(await screen.findByRole('button', { name: /^undo$/i }))
    expect(await screen.findByText(/Approve extra 50 bags/)).toBeInTheDocument()
    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(hold).not.toHaveBeenCalled()
  })

  it('Hold on a risk records a held payment that cites its evidence, once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderNeeds([], 'owner', { withHome: true })
    await screen.findByText('Invoice received with no matching delivery')
    const holdChips = screen.getAllByRole('button', { name: /^hold$/i })
    expect(holdChips).toHaveLength(1) // labour shortfall has no money chips
    await user.click(holdChips[0])
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^hold$/i }))
    await act(async () => { vi.advanceTimersByTime(5000) })
    await waitFor(() => expect(createDecision).toHaveBeenCalledTimes(1))
    expect(createDecision.mock.calls[0][0]).toMatchObject({
      site_id: 'site-a',
      action: 'hold',
      title: 'Invoice received with no matching delivery',
      evidence_event_ids: ['ev-inv'],
      client_decision_id: expect.any(String),
    })
  })

  it('Assign asks who, then records it for that person', async () => {
    const user = userEvent.setup()
    renderNeeds([], 'owner', { withHome: true })
    await screen.findByText('Attendance 3 of 10')
    const assigns = screen.getAllByRole('button', { name: /^assign$/i })
    await user.click(assigns[1])
    const dialog = await screen.findByRole('dialog', { name: /assign to/i })
    // Only active teammates are offered.
    expect(within(dialog).queryByText('Gone')).not.toBeInTheDocument()
    await user.click(await within(dialog).findByRole('button', { name: /ravi/i }))
    await waitFor(() => expect(createDecision).toHaveBeenCalledTimes(1))
    expect(createDecision.mock.calls[0][0]).toMatchObject({
      action: 'assign', assigned_to: 'u-ravi', evidence_event_ids: ['ev-att'],
    })
    expect(await screen.findByText('Assigned to Ravi')).toBeInTheDocument()
  })

  it('a PM sees the owner-only note instead of money chips, and can still assign a risk', async () => {
    renderNeeds([dec({ id: 'a' })], 'pm', { withHome: true })
    await screen.findByText(/Approve extra 50 bags/)
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^hold$/i })).not.toBeInTheDocument()
    expect(screen.getAllByText(/Only the owner can approve this/)).toHaveLength(2)
    // Both risks can be delegated; the pending approval can't.
    expect(screen.getAllByRole('button', { name: /^assign$/i })).toHaveLength(2)
  })

  it('an owner-only refusal is reported in plain words and the row comes back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    approve.mockRejectedValue(new ApiError(403, 'no', 'owner_only'))
    renderNeeds([dec({ id: 'a' })], 'owner')
    await user.click(await screen.findByRole('button', { name: /approve ₹/i }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^approve$/i }))
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(await screen.findByText(/Only the owner can approve this/)).toBeInTheDocument()
    expect(await screen.findByText(/Approve extra 50 bags/)).toBeInTheDocument()
  })

  it('applies the selectedSiteId filter', async () => {
    renderNeeds([
      dec({ id: 'a', site_id: 'site-a', title: 'A pending' }),
      dec({ id: 'b', site_id: 'site-b', title: 'B pending' }),
    ], 'owner', { selectedSiteId: 'site-a' })
    expect(await screen.findByText('A pending')).toBeInTheDocument()
    expect(screen.queryByText('B pending')).not.toBeInTheDocument()
  })
})
