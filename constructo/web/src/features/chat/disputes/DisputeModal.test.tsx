/**
 * DisputeModal — unit tests (Phase D T8). Covers raise, owner-resolve, and the
 * non-authority/non-raiser read-only case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement } from 'react'
import { ToastProvider } from '../../../ui/Toast'
import type { Dispute } from '../../../api/disputes'

vi.mock('../../../auth/useCan', () => ({ useMe: vi.fn(), useMeRole: vi.fn() }))
vi.mock('../../../api/disputes', async (io) => {
  const o = await io<typeof import('../../../api/disputes')>()
  return { ...o, disputesApi: { ...o.disputesApi, list: vi.fn(), raise: vi.fn(), resolve: vi.fn(), withdraw: vi.fn() } }
})

import { useMe, useMeRole } from '../../../auth/useCan'
import { disputesApi } from '../../../api/disputes'
import { DisputeModal } from './DisputeModal'

const mockList = disputesApi.list as ReturnType<typeof vi.fn>
const mockRaise = disputesApi.raise as ReturnType<typeof vi.fn>
const mockResolve = disputesApi.resolve as ReturnType<typeof vi.fn>

function dispute(over: Partial<Dispute>): Dispute {
  return {
    id: 'd1', event_id: 'E1', site_id: 's1', raised_by: 'sup', raised_by_role: 'supervisor',
    reason: 'qty is wrong', proposed_fields: { quantity: 54 }, status: 'open',
    resolved_by: null, resolution_note: null, resolved_fields: null, resolved_event_id: null,
    created_at: '', resolved_at: null, ...over,
  }
}

function renderWithProviders(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('DisputeModal', () => {
  it('raises a dispute when the card is not contested', async () => {
    vi.mocked(useMe).mockReturnValue({ data: { id: 'me' } } as never)
    vi.mocked(useMeRole).mockReturnValue('supervisor')
    mockRaise.mockResolvedValue(dispute({}))
    renderWithProviders(<DisputeModal open onClose={() => {}} eventId="E1" contested={false} />)
    fireEvent.change(screen.getByLabelText(/what's wrong/i), { target: { value: 'wrong qty' } })
    fireEvent.click(screen.getByRole('button', { name: /raise dispute/i }))
    await waitFor(() => expect(mockRaise).toHaveBeenCalledWith('E1', { reason: 'wrong qty' }))
  })

  it('lets an owner keep-as-recorded on a contested card', async () => {
    vi.mocked(useMe).mockReturnValue({ data: { id: 'owner' } } as never)
    vi.mocked(useMeRole).mockReturnValue('owner')
    mockList.mockResolvedValue([dispute({ id: 'd1' })])
    mockResolve.mockResolvedValue(dispute({ id: 'd1', status: 'resolved' }))
    renderWithProviders(<DisputeModal open onClose={() => {}} eventId="E1" contested />)
    fireEvent.click(await screen.findByRole('button', { name: /keep as recorded/i }))
    await waitFor(() => expect(mockResolve).toHaveBeenCalledWith('d1', { resolution_note: 'Kept as recorded' }))
  })

  it('hides resolve/withdraw from a non-authority non-raiser', async () => {
    vi.mocked(useMe).mockReturnValue({ data: { id: 'other' } } as never)
    vi.mocked(useMeRole).mockReturnValue('supervisor')
    mockList.mockResolvedValue([dispute({ id: 'd1', raised_by: 'sup' })])
    renderWithProviders(<DisputeModal open onClose={() => {}} eventId="E1" contested />)
    expect(await screen.findByText(/qty is wrong/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /keep as recorded/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /withdraw/i })).toBeNull()
  })
})
