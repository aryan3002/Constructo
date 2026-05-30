import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { LanguageProvider } from '../../i18n'

vi.mock('../../api/hooks', () => ({
  useSites: () => ({
    data: { items: [{ id: 's1', name: 'Tower A', status: 'active' }], next_cursor: null },
  }),
}))

const capture = vi.fn().mockResolvedValue({ id: 'ev-new' })
vi.mock('../../api/attendance', () => ({
  attendanceApi: {
    capture: (...a: unknown[]) => capture(...a),
    summary: async () => ({
      site_id: 's1',
      occurred_on: '2026-05-29',
      expected: 12,
      actual: 0,
      variance: -12,
      status: 'risk',
      capture_count: 0,
    }),
    myPayments: async () => ({
      items: [
        {
          id: 'p1',
          site_id: 's1',
          amount: '15000.00',
          currency: 'INR',
          paid_on: '2026-05-20',
          method: 'upi',
          status: 'confirmed',
          notes: null,
          created_at: '2026-05-20T00:00:00Z',
        },
      ],
      next_cursor: null,
    }),
  },
}))

const { MukadamAttendance } = await import('./MukadamAttendance')

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>{node}</MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('MukadamAttendance', () => {
  beforeEach(() => {
    localStorage.clear()
    capture.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('frames proof = faster payment and increments the count by tap', async () => {
    wrap(<MukadamAttendance />)
    expect(screen.getByText(/proof = faster payment/i)).toBeInTheDocument()

    const up = screen.getByRole('button', { name: /one more/i })
    await userEvent.click(up)
    await userEvent.click(up)
    // Send button enabled now; submit and verify the headcount sent.
    await userEvent.click(screen.getByRole('button', { name: /send attendance/i }))
    await waitFor(() => expect(capture).toHaveBeenCalled())
    expect(capture.mock.calls[0][1]).toMatchObject({ headcount: 2 })
  })

  it('switches to the payments tab and shows recorded payment in rupees', async () => {
    wrap(<MukadamAttendance />)
    await userEvent.click(screen.getByRole('tab', { name: /my payments/i }))
    expect(await screen.findByText(/₹\s?15,?000/)).toBeInTheDocument()
    expect(screen.getByText(/confirmed/i)).toBeInTheDocument()
  })
})
