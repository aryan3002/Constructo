import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { LanguageProvider } from '../../i18n'

// Mock data + api so the screen renders network-free.
vi.mock('../../api/hooks', () => ({
  useSites: () => ({
    data: { items: [{ id: 's1', name: 'Tower A', status: 'active' }], next_cursor: null },
  }),
}))

const capture = vi.fn().mockResolvedValue({ id: 'ev-new' })
vi.mock('../../api/attendance', () => ({
  attendanceApi: {
    capture: (...a: unknown[]) => capture(...a),
    list: async () => ({ items: [], next_cursor: null }),
    summary: async () => ({
      site_id: 's1',
      occurred_on: '2026-05-29',
      expected: 20,
      actual: 0,
      variance: -20,
      status: 'risk',
      capture_count: 0,
    }),
  },
}))

const { SupervisorCapture } = await import('./SupervisorCapture')

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

describe('SupervisorCapture', () => {
  beforeEach(() => {
    localStorage.clear()
    capture.mockClear()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the capture-first bar and the recent-captures section', async () => {
    wrap(<SupervisorCapture />)
    expect(screen.getByRole('button', { name: /hold to talk/i })).toBeInTheDocument()
    expect(await screen.findByText(/recent captures/i)).toBeInTheDocument()
  })

  it('logs a typed attendance optimistically and flushes to the API', async () => {
    wrap(<SupervisorCapture />)
    await userEvent.click(screen.getByRole('button', { name: /or type instead/i }))
    await userEvent.type(screen.getByLabelText(/workers present today/i), '18')
    await userEvent.click(screen.getByRole('button', { name: /log attendance/i }))

    // Optimistic confirmation appears immediately.
    expect(await screen.findByText(/logged 18 workers/i)).toBeInTheDocument()
    // And the background flush hits the API with the right headcount.
    await waitFor(() => expect(capture).toHaveBeenCalled())
    expect(capture.mock.calls[0][1]).toMatchObject({ headcount: 18 })
  })

  it('exposes a find-a-drawing / past-proof affordance', () => {
    wrap(<SupervisorCapture />)
    expect(screen.getByText(/find a drawing or past proof/i)).toBeInTheDocument()
  })
})
