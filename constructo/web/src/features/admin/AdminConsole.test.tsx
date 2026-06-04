import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LanguageProvider } from '../../i18n'

const getCompany = vi.fn()
const updateCompany = vi.fn()
vi.mock('../../api/auth', () => ({
  authApi: {
    getCompany: (...a: unknown[]) => getCompany(...a),
    updateCompany: (...a: unknown[]) => updateCompany(...a),
  },
}))

const { AdminConsole } = await import('./AdminConsole')

function renderConsole(role = 'owner', initial = '/settings/admin') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter initialEntries={[initial]}>
          <AdminConsole />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('AdminConsole', () => {
  beforeEach(() => {
    getCompany.mockReset()
    updateCompany.mockReset()
    getCompany.mockResolvedValue({
      id: 'co-1',
      name: 'Verma Builders',
      gstin: null,
      address: null,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    })
  })

  it('shows the Company section panel to an owner', async () => {
    renderConsole('owner')
    expect(
      await screen.findByRole('heading', { name: /company profile/i }),
    ).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Verma Builders')).toBeInTheDocument()
    // The section rail lists the control-plane map.
    expect(screen.getByRole('button', { name: /team & roles/i })).toBeInTheDocument()
  })

  it('blocks a non-owner with an owner-only notice', async () => {
    renderConsole('pm')
    expect(await screen.findByText(/owner only/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /team & roles/i }),
    ).not.toBeInTheDocument()
  })

  it('switches to an unbuilt section showing the coming-soon panel', async () => {
    renderConsole('owner')
    await screen.findByRole('heading', { name: /company profile/i })
    await userEvent.click(screen.getByRole('button', { name: /team & roles/i }))
    await waitFor(() =>
      expect(screen.getByText(/coming soon/i)).toBeInTheDocument(),
    )
  })

  it('deep-links to a section via the ?section= param', async () => {
    renderConsole('owner', '/settings/admin?section=integrations')
    expect(
      await screen.findByRole('heading', { name: /integrations/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
