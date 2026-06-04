import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'

const getFinancials = vi.fn()
vi.mock('../../api/payments', () => ({
  paymentsApi: { getFinancials: (...a: unknown[]) => getFinancials(...a) },
}))

const { FinancialTracking } = await import('./FinancialTracking')

function renderFt() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <FinancialTracking siteId="site-1" />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('FinancialTracking', () => {
  beforeEach(() => getFinancials.mockReset())

  it('renders the four figures and a bar (no rail copy)', async () => {
    getFinancials.mockResolvedValue({
      site_id: 'site-1',
      quotation: '12000000',
      billed: '7500000',
      received: '5350000',
      outstanding: '2150000',
      currency: 'INR',
    })
    renderFt()

    expect(await screen.findByText('Financial tracking')).toBeInTheDocument()
    expect(screen.getByText('Quotation')).toBeInTheDocument()
    expect(screen.getByText('Outstanding')).toBeInTheDocument()
    expect(screen.getByText(/tracking only/i)).toBeInTheDocument()
    // The stacked bar exposes an accessible summary.
    expect(screen.getByRole('img', { name: /received .* of .* billed/i })).toBeInTheDocument()
  })

  it('shows an empty prompt when no contract figures exist', async () => {
    getFinancials.mockResolvedValue({
      site_id: 'site-1',
      quotation: null,
      billed: null,
      received: '0',
      outstanding: '0',
      currency: 'INR',
    })
    renderFt()
    await waitFor(() =>
      expect(screen.getByText('No contract figures yet')).toBeInTheDocument(),
    )
  })
})
