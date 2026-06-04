import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Vendor } from '../../api/types'

const listVendors = vi.fn()
const createVendor = vi.fn()
const updateVendor = vi.fn()
vi.mock('../../api/client', () => ({
  api: {
    listVendors: (...a: unknown[]) => listVendors(...a),
    createVendor: (...a: unknown[]) => createVendor(...a),
    updateVendor: (...a: unknown[]) => updateVendor(...a),
  },
}))

const { Vendors } = await import('./Vendors')

function vendor(over: Partial<Vendor> = {}): Vendor {
  return {
    id: 'v1', company_id: 'co', name: 'Ambuja Cement', category: 'material',
    gstin: null, phone: null, notes: null, is_active: true,
    created_at: '2026-02-01T00:00:00Z', ...over,
  }
}

function renderVendors(role = 'owner') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <Vendors />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('Vendors', () => {
  beforeEach(() => {
    listVendors.mockReset()
    createVendor.mockReset()
    updateVendor.mockReset()
    listVendors.mockImplementation((includeArchived: boolean) =>
      Promise.resolve(
        includeArchived
          ? [vendor(), vendor({ id: 'v2', name: 'Old Crane', is_active: false })]
          : [vendor()],
      ),
    )
    createVendor.mockImplementation((b) => Promise.resolve(vendor({ id: 'vN', ...b })))
    updateVendor.mockImplementation((id, patch) => Promise.resolve(vendor({ id, ...patch })))
  })

  it('lists active vendors', async () => {
    renderVendors('owner')
    expect(await screen.findByText('Ambuja Cement')).toBeInTheDocument()
    expect(screen.queryByText('Old Crane')).not.toBeInTheDocument()
  })

  it('adds a vendor through createVendor', async () => {
    renderVendors('owner')
    await screen.findByText('Ambuja Cement')
    await userEvent.type(screen.getByLabelText(/^Name$/i), 'Steel Ltd')
    await userEvent.click(screen.getByRole('button', { name: /add vendor/i }))
    await waitFor(() => expect(createVendor).toHaveBeenCalled())
    expect(createVendor.mock.calls[0][0]).toMatchObject({
      name: 'Steel Ltd',
      category: 'material',
      gstin: null,
      phone: null,
    })
  })

  it('blocks an empty vendor name', async () => {
    renderVendors('owner')
    await screen.findByText('Ambuja Cement')
    await userEvent.click(screen.getByRole('button', { name: /add vendor/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/required/i)
    expect(createVendor).not.toHaveBeenCalled()
  })

  it('archives a vendor', async () => {
    renderVendors('owner')
    const row = (await screen.findByText('Ambuja Cement')).closest('li') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: /archive/i }))
    await waitFor(() =>
      expect(updateVendor).toHaveBeenCalledWith('v1', { is_active: false }),
    )
  })

  it('shows archived vendors when toggled', async () => {
    renderVendors('owner')
    await screen.findByText('Ambuja Cement')
    await userEvent.click(screen.getByRole('checkbox', { name: /show archived/i }))
    expect(await screen.findByText('Old Crane')).toBeInTheDocument()
    await waitFor(() => expect(listVendors).toHaveBeenCalledWith(true))
  })
})
