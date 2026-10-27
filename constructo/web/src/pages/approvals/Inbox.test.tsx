import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
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

function wrap(node: ReactNode, role: string = 'owner') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Seed the current-user role so the WC4 capability gate resolves (owner sees
  // Approve; pm/others see "Propose to owner →" on money decisions).
  qc.setQueryData(['me'], { role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>{node}</MemoryRouter>
      </LanguageProvider>
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

  it('WC4: a PM sees the owner-only note, never Approve or a fake Propose', async () => {
    list.mockResolvedValue({ items: [makeDecision()], next_cursor: null })
    wrap(<ApprovalInbox />, 'pm')
    await screen.findByText('Approve extra cement')
    expect(
      screen.getByText("Only the owner can approve this. It's waiting in their inbox."),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /propose/i })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    // And no bulk-approve once selected.
    await userEvent.click(
      screen.getByRole('checkbox', { name: /select Approve extra cement/i }),
    )
    expect(screen.queryByRole('button', { name: 'Approve selected' })).toBeNull()
  })

  it('a PM keeps Approve / Reject on a non-money decision', async () => {
    list.mockResolvedValue({
      items: [makeDecision({ kind: 'generic', title: 'Pick tile batch' })],
      next_cursor: null,
    })
    wrap(<ApprovalInbox />, 'pm')
    await screen.findByText('Pick tile batch')
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.queryByTestId('owner-only-note')).toBeNull()
  })

  it('a PM batch-selecting money items is told they will be skipped, then sees the server count', async () => {
    list.mockResolvedValue({
      items: [
        makeDecision(),
        makeDecision({ id: 'd2', kind: 'generic', title: 'Pick tile batch' }),
      ],
      next_cursor: null,
    })
    batch.mockResolvedValue({ updated: ['d2'], skipped: ['d1'] })
    wrap(<ApprovalInbox />, 'pm')
    await screen.findByText('Approve extra cement')
    await userEvent.click(
      screen.getByRole('checkbox', { name: /select Approve extra cement/i }),
    )
    await userEvent.click(screen.getByRole('checkbox', { name: /select Pick tile batch/i }))
    expect(
      screen.getByText(
        '1 of these involve money. Only the owner can decide them, so they will be skipped.',
      ),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))
    await waitFor(() => expect(batch).toHaveBeenCalledWith('reject', ['d1', 'd2'], undefined))
    expect(
      await screen.findByText(
        '1 done · 1 skipped (no longer open, or only the owner can decide them)',
      ),
    ).toBeInTheDocument()
  })

  it('a 403 owner_only shows the owner-only message, not a generic error', async () => {
    const { ApiError } = await import('../../api/client')
    list.mockResolvedValue({ items: [makeDecision()], next_cursor: null })
    approve.mockRejectedValue(new ApiError(403, 'Only the owner can decide money', 'owner_only'))
    // A stale screen: the capability still says owner, the server says no.
    wrap(<ApprovalInbox />, 'owner')
    await screen.findByText('Approve extra cement')
    await userEvent.click(screen.getByRole('button', { name: 'Approve' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("Only the owner can approve this. It's waiting in their inbox.")
    expect(alert).not.toHaveTextContent('Only the owner can decide money')
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

  it('Fix 1: a decision with spec_id shows the "Selection" badge and a deep-link to /designer?tab=selections', async () => {
    list.mockResolvedValue({
      items: [makeDecision({ spec_id: 'spec-abc' })],
      next_cursor: null,
    })
    wrap(<ApprovalInbox />)
    await screen.findByText('Approve extra cement')
    // Badge visible
    expect(screen.getByText('Selection')).toBeInTheDocument()
    // Deep-link visible with correct href
    const link = screen.getByTestId('view-selection-link')
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/designer?tab=selections')
  })

  it('Fix 1: a decision WITHOUT spec_id shows no "Selection" badge and no deep-link', async () => {
    list.mockResolvedValue({
      items: [makeDecision({ spec_id: null })],
      next_cursor: null,
    })
    wrap(<ApprovalInbox />)
    await screen.findByText('Approve extra cement')
    expect(screen.queryByText('Selection')).not.toBeInTheDocument()
    expect(screen.queryByTestId('view-selection-link')).not.toBeInTheDocument()
  })

  it("a homeowner's question waits on them: no Approve, Reject or select", async () => {
    const created = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    list.mockResolvedValue({
      items: [
        makeDecision({
          id: 'hq',
          kind: 'homeowner_question',
          audience: 'homeowner',
          title: 'Select bathroom tile option',
          created_at: created,
        }),
        makeDecision({ id: 'inv', audience: 'internal', title: 'Approve ACC invoice' }),
      ],
      next_cursor: null,
    })
    wrap(<ApprovalInbox />)
    const row = (await screen.findByText('Select bathroom tile option')).closest('li')!
    expect(within(row).getByTestId('homeowner-wait')).toHaveTextContent(
      'Waiting for the homeowner for 3 hours',
    )
    expect(within(row).queryByRole('button', { name: /approve|reject/i })).toBeNull()
    expect(within(row).queryByRole('checkbox')).toBeNull()
    // The builder's own call keeps Approve / Reject.
    const inv = screen.getByText('Approve ACC invoice').closest('li')!
    expect(within(inv).getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
  })
})

describe('waitingText', () => {
  it('says how long, in words', async () => {
    const { waitingText } = await import('./ApprovalRow')
    const { en } = await import('../../i18n/en')
    const t = (k: keyof typeof en, v?: Record<string, number>) =>
      en[k].replace('{n}', String(v?.n ?? ''))
    const now = Date.parse('2026-07-03T12:00:00Z')
    const ago = (ms: number) => new Date(now - ms).toISOString()
    expect(waitingText(ago(20 * 1000), t, now)).toBe('Waiting for the homeowner for 1 min')
    expect(waitingText(ago(61 * 60 * 1000), t, now)).toBe('Waiting for the homeowner for 1 hour')
    expect(waitingText(ago(26 * 60 * 60 * 1000), t, now)).toBe('Waiting for the homeowner for 1 day')
    expect(waitingText(ago(5 * 24 * 60 * 60 * 1000), t, now)).toBe(
      'Waiting for the homeowner for 5 days',
    )
  })
})
