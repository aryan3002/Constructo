import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { LanguageProvider } from '../../i18n'
import type { Decision } from '../../api/approvals'

// Mock the owned API layer so tests are fully network-free.
const list = vi.fn()
const approve = vi.fn()
const reject = vi.fn()
const batch = vi.fn()
vi.mock('../../api/approvals', () => ({
  approvalsApi: {
    list: (...a: unknown[]) => list(...a),
    approve: (...a: unknown[]) => approve(...a),
    reject: (...a: unknown[]) => reject(...a),
    batch: (...a: unknown[]) => batch(...a),
  },
}))

const { ApprovalInbox } = await import('./Inbox')

function makeDecision(over: Partial<Decision> = {}): Decision {
  return {
    id: 'd1',
    company_id: 'c1',
    site_id: 's1',
    kind: 'approval',
    title: 'Approve extra cement',
    detail: 'Shortfall on B2',
    raised_by: null,
    assigned_to: null,
    state: 'pending',
    sla_due_at: null,
    resolved_at: null,
    resolution_note: null,
    evidence_event_ids: ['e1'],
    created_at: '2026-05-29T07:00:00Z',
    updated_at: '2026-05-29T07:00:00Z',
    ...over,
  }
}

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">{node}</LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('ApprovalInbox', () => {
  beforeEach(() => {
    list.mockReset()
    approve.mockReset()
    reject.mockReset()
    batch.mockReset()
  })
  afterEach(() => vi.clearAllMocks())

  it('shows the all-clear empty state when there are no decisions', async () => {
    list.mockResolvedValue({ items: [], next_cursor: null })
    wrap(<ApprovalInbox />)
    expect(await screen.findByText('All clear')).toBeInTheDocument()
  })

  it('renders an approval row with inline approve/reject', async () => {
    list.mockResolvedValue({
      items: [makeDecision()],
      next_cursor: null,
    })
    wrap(<ApprovalInbox />)
    expect(await screen.findByText('Approve extra cement')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('calls approve when the row Approve button is clicked', async () => {
    list.mockResolvedValue({ items: [makeDecision()], next_cursor: null })
    approve.mockResolvedValue(makeDecision({ state: 'resolved' }))
    wrap(<ApprovalInbox />)
    await screen.findByText('Approve extra cement')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(approve).toHaveBeenCalledWith('d1', undefined))
  })

  it('shows the batch bar and runs a batch approve when rows are selected', async () => {
    list.mockResolvedValue({
      items: [makeDecision(), makeDecision({ id: 'd2', title: 'Second' })],
      next_cursor: null,
    })
    batch.mockResolvedValue({ updated: ['d1'], skipped: [] })
    wrap(<ApprovalInbox />)
    await screen.findByText('Approve extra cement')

    await userEvent.click(
      screen.getByRole('checkbox', { name: /select Approve extra cement/i }),
    )
    const bar = await screen.findByText('1 selected')
    expect(bar).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Approve selected' }),
    )
    await waitFor(() =>
      expect(batch).toHaveBeenCalledWith('resolve', ['d1'], undefined),
    )
  })

  it('marks an SLA-overdue homeowner question as overdue', async () => {
    list.mockResolvedValue({
      items: [
        makeDecision({
          kind: 'homeowner_question',
          state: 'escalated',
          sla_due_at: '2020-01-01T00:00:00Z',
          title: 'When is handover?',
        }),
      ],
      next_cursor: null,
    })
    wrap(<ApprovalInbox />)
    const card = await screen.findByText('When is handover?')
    expect(within(card.closest('article')!).getByText('SLA overdue')).toBeInTheDocument()
  })
})
