import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Decision } from '../../api/approvals'

const list = vi.fn()
vi.mock('../../api/approvals', async () => {
  const actual = await vi.importActual<typeof import('../../api/approvals')>('../../api/approvals')
  return { ...actual, approvalsApi: { ...actual.approvalsApi, list: () => list() } }
})
vi.mock('../../api/auth', async () => {
  const actual = await vi.importActual<typeof import('../../api/auth')>('../../api/auth')
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      listTeam: () =>
        Promise.resolve([{ id: 'u-ravi', company_id: 'co', name: 'Ravi', phone: '+91', role: 'supervisor', is_active: true }]),
    },
  }
})

const { DecisionLog, decisionLabel } = await import('./DecisionLog')

function dec(over: Partial<Decision>): Decision {
  return {
    id: 'd', company_id: 'co', site_id: null, kind: 'approval', title: 'ACC invoice',
    detail: null, raised_by: null, assigned_to: null, state: 'pending', sla_due_at: null,
    resolved_at: null, resolution_note: null, evidence_event_ids: [],
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...over,
  }
}

describe('decisionLabel', () => {
  const label = (over: Partial<Decision>, names = {}) => {
    const l = decisionLabel(dec(over), names)
    return [l.labelKey, l.vars?.name].filter(Boolean).join(':')
  }

  it('a pending approval is Pending, not Approved', () => {
    expect(label({ kind: 'approval', state: 'pending' })).toBe('owner.log.pending')
  })

  it('maps every state', () => {
    expect(label({ state: 'escalated' })).toBe('owner.log.escalated')
    expect(label({ state: 'acknowledged' })).toBe('owner.log.acknowledged')
    expect(label({ kind: 'approval', state: 'resolved' })).toBe('owner.log.approved')
    expect(label({ kind: 'generic', state: 'resolved' })).toBe('owner.log.resolved')
    expect(label({ kind: 'approval', state: 'rejected' })).toBe('owner.log.rejected')
    expect(label({ kind: 'hold_payment', state: 'rejected' })).toBe('owner.log.held')
  })

  it('an open held payment is On hold, whatever its open state', () => {
    expect(label({ kind: 'hold_payment', state: 'pending' })).toBe('owner.log.on_hold')
    expect(label({ kind: 'hold_payment', state: 'escalated' })).toBe('owner.log.on_hold')
    expect(label({ kind: 'hold_payment', state: 'resolved' })).toBe('owner.log.approved')
  })

  it('an open ask with an assignee names them', () => {
    expect(label({ kind: 'generic', assigned_to: 'u-ravi' }, { 'u-ravi': 'Ravi' })).toBe('owner.log.assigned_to:Ravi')
    expect(label({ kind: 'generic', assigned_to: 'u-x' })).toBe('owner.log.assigned')
    expect(label({ kind: 'generic' })).toBe('owner.log.pending')
  })
})

describe('<DecisionLog>', () => {
  it('reads the real state on screen', async () => {
    list.mockResolvedValue({
      items: [
        dec({ id: '1', title: 'Cement bill', state: 'pending' }),
        dec({ id: '2', title: 'Steel bill', kind: 'hold_payment' }),
        dec({ id: '3', title: 'Check attendance', kind: 'generic', assigned_to: 'u-ravi' }),
        dec({ id: '4', title: 'Sand bill', state: 'resolved' }),
      ],
      next_cursor: null,
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <LanguageProvider defaultLanguage="en">
          <DecisionLog siteNames={{}} />
        </LanguageProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText(/Pending ·/)).toBeInTheDocument()
    expect(screen.getByText(/On hold ·/)).toBeInTheDocument()
    expect(await screen.findByText(/Assigned to Ravi ·/)).toBeInTheDocument()
    expect(screen.getByText(/Approved ·/)).toBeInTheDocument()
    expect(screen.getAllByText(/Approved ·/)).toHaveLength(1)
  })
})
