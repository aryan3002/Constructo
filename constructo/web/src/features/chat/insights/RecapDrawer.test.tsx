/**
 * RecapDrawer — unit tests (Phase D T6).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'

vi.mock('../../../api/chat', async (io) => {
  const o = await io<typeof import('../../../api/chat')>()
  return { ...o, chatApi: { ...o.chatApi, recap: vi.fn() } }
})

import { chatApi } from '../../../api/chat'
import { RecapDrawer } from './RecapDrawer'

const mockRecap = chatApi.recap as ReturnType<typeof vi.fn>

function renderQC(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('RecapDrawer', () => {
  it('shows the summary, activity counts, and a disputes flag', async () => {
    mockRecap.mockResolvedValue({
      site_id: 's1',
      days: 1,
      event_counts: { attendance: 8, delivery: 2 },
      material_totals: { 'cement: bori': 50 },
      worker_days: 12,
      amount_total: 5000,
      open_disputes: 1,
      summary: '12 worker-days; 50 bori cement',
    })
    renderQC(<RecapDrawer open onClose={() => {}} siteId="s1" />)
    expect(await screen.findByText(/12 worker-days/)).toBeInTheDocument()
    expect(screen.getByText('attendance')).toBeInTheDocument()
    expect(screen.getByText(/1 open dispute/i)).toBeInTheDocument()
  })

  it('shows a calm empty state when nothing logged', async () => {
    mockRecap.mockResolvedValue({
      site_id: 's1', days: 1, event_counts: {}, material_totals: {},
      worker_days: null, amount_total: null, open_disputes: 0, summary: '',
    })
    renderQC(<RecapDrawer open onClose={() => {}} siteId="s1" />)
    expect(await screen.findByText(/nothing logged/i)).toBeInTheDocument()
  })
})
