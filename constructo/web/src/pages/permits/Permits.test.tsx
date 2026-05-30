import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { LanguageProvider } from '../../i18n'
import type { Paginated } from '../../api/types'
import type { Permit } from '../../api/permits'

const listMock = vi.fn<() => Promise<Paginated<Permit>>>()
const checklistMock = vi.fn<() => Promise<Paginated<Permit>>>()
vi.mock('../../api/permits', () => ({
  permitsApi: {
    list: () => listMock(),
    checklist: () => checklistMock(),
  },
}))

const { Permits } = await import('./Permits')

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/permits" element={<Permits />} />
            <Route path="/permits/site/:siteId" element={<Permits />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

function permit(over: Partial<Permit> = {}): Permit {
  return {
    id: 'pm1',
    company_id: 'c1',
    site_id: 's1',
    permit_type: 'commencement',
    authority: 'Municipal Corporation',
    status: 'approved',
    applied_on: '2026-01-10',
    expected_on: null,
    decided_on: '2026-02-01',
    expiry_on: null,
    reference_no: 'MC-2026-77',
    notes: null,
    created_by: null,
    created_at: '2026-01-10T00:00:00Z',
    ...over,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('Permits', () => {
  it('lists permits and reveals authority + reference proof', async () => {
    listMock.mockResolvedValue({ items: [permit()], next_cursor: null })
    renderAt('/permits')

    expect(await screen.findByText('commencement')).toBeInTheDocument()
    expect(screen.getByText('Approved')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /show proof/i }))
    expect(screen.getAllByText(/MC-2026-77/).length).toBeGreaterThan(0)
  })

  it('uses the per-site checklist endpoint when a siteId param is present', async () => {
    checklistMock.mockResolvedValue({ items: [permit({ permit_type: 'fire-noc' })], next_cursor: null })
    renderAt('/permits/site/s1')

    expect(await screen.findByText('fire-noc')).toBeInTheDocument()
    expect(checklistMock).toHaveBeenCalledTimes(1)
    expect(listMock).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: /site checklist/i })).toBeInTheDocument()
  })

  it('shows a warn pill for a permit expiring soon', async () => {
    const soon = new Date()
    soon.setDate(soon.getDate() + 10)
    const iso = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`
    listMock.mockResolvedValue({
      items: [permit({ status: 'approved', expiry_on: iso })],
      next_cursor: null,
    })
    renderAt('/permits')
    expect(await screen.findByText(/expires in 10 days/i)).toBeInTheDocument()
  })

  it('shows an empty state when there are no permits', async () => {
    listMock.mockResolvedValue({ items: [], next_cursor: null })
    renderAt('/permits')
    await waitFor(() =>
      expect(screen.getByText('No permits tracked yet')).toBeInTheDocument(),
    )
  })
})
