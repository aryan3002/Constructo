import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { CompanyBilling } from '../../api/auth'

const getBilling = vi.fn()
const updateBilling = vi.fn()
vi.mock('../../api/auth', () => ({
  authApi: {
    getBilling: (...a: unknown[]) => getBilling(...a),
    updateBilling: (...a: unknown[]) => updateBilling(...a),
  },
}))

const { Billing } = await import('./Billing')

function billing(over: Partial<CompanyBilling> = {}): CompanyBilling {
  return { plan: 'Pilot', billing_email: null, billing_contact: null, notes: null, ...over }
}

function renderBilling(role = 'owner') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <Billing />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('Billing', () => {
  beforeEach(() => {
    getBilling.mockReset()
    updateBilling.mockReset()
    getBilling.mockResolvedValue(billing())
    updateBilling.mockImplementation((patch) => Promise.resolve(billing(patch)))
  })

  it('states the tracking-only invariant and prefills the plan', async () => {
    renderBilling('owner')
    expect(await screen.findByDisplayValue('Pilot')).toBeInTheDocument()
    expect(screen.getByText(/no payments are processed here/i)).toBeInTheDocument()
  })

  it('saves the billing record, empty optionals as null', async () => {
    renderBilling('owner')
    const email = await screen.findByLabelText(/billing email/i)
    await userEvent.type(email, 'accounts@verma.example')
    await userEvent.click(screen.getByRole('button', { name: /save billing/i }))
    await waitFor(() => expect(updateBilling).toHaveBeenCalled())
    expect(updateBilling.mock.calls[0][0]).toEqual({
      plan: 'Pilot',
      billing_email: 'accounts@verma.example',
      billing_contact: null,
      notes: null,
    })
    expect(await screen.findByText(/billing saved/i)).toBeInTheDocument()
  })

  it('blocks an invalid billing email', async () => {
    renderBilling('owner')
    const email = await screen.findByLabelText(/billing email/i)
    await userEvent.type(email, 'not-an-email')
    await userEvent.click(screen.getByRole('button', { name: /save billing/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid email/i)
    expect(updateBilling).not.toHaveBeenCalled()
  })

  it('is read-only for a non-owner', async () => {
    renderBilling('pm')
    expect(await screen.findByText(/only the owner can change billing/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save billing/i })).not.toBeInTheDocument()
  })
})
