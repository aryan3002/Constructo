import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { LanguageProvider } from '../../i18n'
import type { PaymentLedger } from '../../api/payments'

// Network-free: stub the api modules so no fetch ever fires.
const ledgerMock = vi.fn<() => Promise<PaymentLedger>>()
vi.mock('../../api/payments', () => ({
  paymentsApi: {
    ledger: () => ledgerMock(),
    getFinancials: vi.fn(),
  },
}))
// No sites in this test → no site selector / no per-site financials rendered.
vi.mock('../../api/hooks', () => ({
  useSites: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}))

const { Payments } = await import('./Payments')

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter>
          <Payments />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

const LEDGER: PaymentLedger = {
  site_id: null,
  totals: { inflow: '200000', outflow: '80000', net: '120000', count: 2 },
  items: [
    {
      id: 'p1',
      company_id: 'c1',
      site_id: 's1',
      direction: 'homeowner_to_contractor',
      counterparty_name: 'Sharma Residence',
      amount: '150000',
      currency: 'INR',
      paid_on: '2026-05-20',
      method: 'upi',
      reference_no: 'UPI-9931',
      status: 'confirmed',
      notes: null,
      source_event_id: null,
      created_by: null,
      created_at: '2026-05-20T10:00:00Z',
    },
  ],
  next_cursor: null,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Payments ledger', () => {
  it('renders the cash pulse totals and a payment row with proof', async () => {
    ledgerMock.mockResolvedValue(LEDGER)
    renderPage()

    // Cash pulse net = ₹1.2 L compact
    expect(await screen.findByText('Sharma Residence')).toBeInTheDocument()
    expect(screen.getByText('Cash pulse')).toBeInTheDocument()
    expect(screen.getAllByText('₹2 L').length).toBeGreaterThan(0) // inflow compact

    // EvidenceCard "Show proof" reveals the reference.
    const proof = screen.getByRole('button', { name: /show proof/i })
    await userEvent.click(proof)
    expect(screen.getByText(/UPI-9931/)).toBeInTheDocument()
  })

  it('shows an empty state when there are no payments', async () => {
    ledgerMock.mockResolvedValue({
      site_id: null,
      totals: { inflow: '0', outflow: '0', net: '0', count: 0 },
      items: [],
      next_cursor: null,
    })
    renderPage()
    await waitFor(() =>
      expect(screen.getByText('No payments recorded yet')).toBeInTheDocument(),
    )
  })
})
