import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'

const getCompany = vi.fn()
const renameCompany = vi.fn()
vi.mock('../../api/auth', () => ({
  authApi: {
    getCompany: (...a: unknown[]) => getCompany(...a),
    renameCompany: (...a: unknown[]) => renameCompany(...a),
  },
}))

const { CompanyProfile } = await import('./CompanyProfile')

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
    renameCompany.mockReset()
    getCompany.mockResolvedValue({ id: 'co-1', name: 'Verma Builders' })
    renameCompany.mockImplementation((name: string) =>
      Promise.resolve({ id: 'co-1', name }),
    )
  })

  it('prefills the current company name for an owner', async () => {
    renderForm('owner')
    expect(await screen.findByDisplayValue('Verma Builders')).toBeInTheDocument()
  })

  it('blocks an empty name and does not call the API', async () => {
    renderForm('owner')
    const input = await screen.findByDisplayValue('Verma Builders')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/required/i)
    expect(renameCompany).not.toHaveBeenCalled()
  })

  it('saves a valid rename through renameCompany', async () => {
    renderForm('owner')
    const input = await screen.findByDisplayValue('Verma Builders')
    await userEvent.clear(input)
    await userEvent.type(input, 'Rao Constructions')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() =>
      expect(renameCompany).toHaveBeenCalledWith('Rao Constructions'),
    )
    expect(await screen.findByText(/company saved/i)).toBeInTheDocument()
  })

  it('is read-only for a non-owner (no input, no save)', async () => {
    renderForm('pm')
    expect(await screen.findByText('Verma Builders')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
