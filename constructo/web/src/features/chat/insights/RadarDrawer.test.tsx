/**
 * RadarDrawer — unit tests (Phase D T5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'

vi.mock('../../../api/chat', async (io) => {
  const o = await io<typeof import('../../../api/chat')>()
  return { ...o, chatApi: { ...o.chatApi, sentinel: vi.fn() } }
})

import { chatApi } from '../../../api/chat'
import { RadarDrawer } from './RadarDrawer'

const mockSentinel = chatApi.sentinel as ReturnType<typeof vi.fn>

function renderQC(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('RadarDrawer', () => {
  it('lists sentinel signals', async () => {
    mockSentinel.mockResolvedValue({ signals: [{ kind: 'labor', severity: 'high', message: '2 workers missing today', evidence_event_ids: [] }] })
    renderQC(<RadarDrawer open onClose={() => {}} siteId="s1" />)
    expect(await screen.findByText(/2 workers missing today/)).toBeInTheDocument()
  })

  it('shows All clear when there are no signals', async () => {
    mockSentinel.mockResolvedValue({ signals: [] })
    renderQC(<RadarDrawer open onClose={() => {}} siteId="s1" />)
    expect(await screen.findByText(/all clear/i)).toBeInTheDocument()
  })
})
