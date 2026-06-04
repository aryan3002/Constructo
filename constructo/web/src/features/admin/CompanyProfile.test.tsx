import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Company } from '../../api/auth'

const getCompany = vi.fn()
const updateCompany = vi.fn()
vi.mock('../../api/auth', () => ({
  authApi: {
    getCompany: (...a: unknown[]) => getCompany(...a),
    updateCompany: (...a: unknown[]) => updateCompany(...a),
  },
}))

const { CompanyProfile } = await import('./CompanyProfile')

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'co-1',
    name: 'Verma Builders',
    gstin: null,
    address: null,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    ...over,
  }
}

function renderForm(role = 'owner') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <CompanyProfile />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('CompanyProfile (RHF + Zod)', () => {
  beforeEach(() => {
    getCompany.mockReset()
    updateCompany.mockReset()
    getCompany.mockResolvedValue(company())
    updateCompany.mockImplementation((patch) => Promise.resolve(company(patch)))
  })

  it('prefills the current company name + currency for an owner', async () => {
    getCompany.mockResolvedValue(company({ currency: 'USD' }))
    renderForm('owner')
    expect(await screen.findByDisplayValue('Verma Builders')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('USD')).toBeInTheDocument()
  })

  it('blocks an empty name and does not call the API', async () => {
    renderForm('owner')
    const input = await screen.findByDisplayValue('Verma Builders')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/required/i)
    expect(updateCompany).not.toHaveBeenCalled()
  })

  it('saves the full profile, sending empty optionals as null', async () => {
    renderForm('owner')
    const name = await screen.findByDisplayValue('Verma Builders')
    await userEvent.clear(name)
    await userEvent.type(name, 'Rao Constructions')
    await userEvent.type(screen.getByLabelText(/GST number/i), '29ABCDE1234F1Z5')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(updateCompany).toHaveBeenCalled())
    expect(updateCompany.mock.calls[0][0]).toEqual({
      name: 'Rao Constructions',
      gstin: '29ABCDE1234F1Z5',
      address: null, // left blank → null, not ""
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    })
    expect(await screen.findByText(/company saved/i)).toBeInTheDocument()
  })

  it('is read-only for a non-owner (no inputs, no save)', async () => {
    getCompany.mockResolvedValue(company({ gstin: '29ABCDE1234F1Z5' }))
    renderForm('pm')
    expect(await screen.findByText('Verma Builders')).toBeInTheDocument()
    expect(screen.getByText('29ABCDE1234F1Z5')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
