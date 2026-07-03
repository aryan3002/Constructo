import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Decision, Paginated } from '../../api/approvals'

const list = vi.fn()
vi.mock('../../api/approvals', async () => {
  const actual = await vi.importActual<typeof import('../../api/approvals')>('../../api/approvals')
  return { ...actual, approvalsApi: { ...actual.approvalsApi, list: (...a: unknown[]) => list(...a) } }
})

const decide = vi.fn((_input, cb?: { onSuccess?: () => void }) => cb?.onSuccess?.())
vi.mock('./useDecide', () => ({ useDecide: () => ({ decide, isPending: false }) }))
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

function renderNeeds(items: Decision[], role = 'owner', selectedSiteId: string | null = null) {
  list.mockResolvedValue(paged(items))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <NeedsYou date="2026-07-03" selectedSiteId={selectedSiteId} siteNames={{ 'site-a': 'Tower B' }} />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('<NeedsYou> (cleaned)', () => {
  beforeEach(() => { list.mockReset(); decide.mockClear() })

  it('lists only pending approval/hold_payment decisions', async () => {
    renderNeeds([
      dec({ id: 'a', kind: 'approval', state: 'pending' }),
      dec({ id: 'b', kind: 'homeowner_question', state: 'pending', title: 'Homeowner Q' }),
      dec({ id: 'c', kind: 'approval', state: 'resolved', title: 'Old approval' }),
      dec({ id: 'd', kind: 'hold_payment', state: 'pending', title: 'Hold payment to Jindal' }),
    ])
    expect(await screen.findByText(/Approve extra 50 bags/)).toBeInTheDocument()
    expect(screen.getByText(/Hold payment to Jindal/)).toBeInTheDocument()
    expect(screen.queryByText('Homeowner Q')).not.toBeInTheDocument()
    expect(screen.queryByText('Old approval')).not.toBeInTheDocument()
  })

  it('honest empty state when nothing is pending', async () => {
    renderNeeds([dec({ kind: 'approval', state: 'resolved' })])
    expect(await screen.findByText(/Nothing needs a decision right now/i)).toBeInTheDocument()
  })

  it('owner sees Approve chip and it calls decide()', async () => {
    renderNeeds([dec({ id: 'a', kind: 'approval', state: 'pending' })], 'owner')
    const approve = await screen.findByRole('button', { name: /approve/i })
    await userEvent.click(approve)
    expect(decide).toHaveBeenCalledTimes(1)
    expect(decide.mock.calls[0][0]).toEqual(
      expect.objectContaining({ siteId: 'site-a', action: 'approve', title: expect.stringContaining('cement') }),
    )
    // optimistic: the card disappears after a successful decide
    await waitFor(() => expect(screen.queryByText(/Approve extra 50 bags/)).not.toBeInTheDocument())
  })

  it('non-owner sees "Propose to owner" instead of binding chips', async () => {
    renderNeeds([dec({ id: 'a', kind: 'approval', state: 'pending' })], 'pm')
    expect(await screen.findByRole('button', { name: /propose to owner/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^hold$/i })).not.toBeInTheDocument()
  })

  it('applies the selectedSiteId filter', async () => {
    renderNeeds([
      dec({ id: 'a', site_id: 'site-a', title: 'A pending' }),
      dec({ id: 'b', site_id: 'site-b', title: 'B pending' }),
    ], 'owner', 'site-a')
    expect(await screen.findByText('A pending')).toBeInTheDocument()
    expect(screen.queryByText('B pending')).not.toBeInTheDocument()
  })
})
