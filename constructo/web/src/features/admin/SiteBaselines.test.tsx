import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LanguageProvider } from '../../i18n'
import type { Site, SiteBaseline } from '../../api/types'

const listSites = vi.fn()
const getBaseline = vi.fn()
const setBaseline = vi.fn()
vi.mock('../../api/client', () => ({
  api: {
    listSites: (...a: unknown[]) => listSites(...a),
    getBaseline: (...a: unknown[]) => getBaseline(...a),
    setBaseline: (...a: unknown[]) => setBaseline(...a),
  },
}))

const { SiteBaselines } = await import('./SiteBaselines')

function site(id: string, name: string): Site {
  return {
    id, company_id: 'co', name, location: 'Pune', type: 'residential',
    status: 'active', created_at: '2026-01-01T00:00:00Z',
  }
}

function baseline(over: Partial<SiteBaseline> = {}): SiteBaseline {
  return {
    site_id: 'site-1', expected_daily_headcount: 24, notes: null,
    updated_at: '2026-06-01T00:00:00Z', ...over,
  }
}

function renderBaselines(role = 'owner') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(['me'], { id: 'u1', role })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <SiteBaselines />
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('SiteBaselines', () => {
  beforeEach(() => {
    listSites.mockReset()
    getBaseline.mockReset()
    setBaseline.mockReset()
    listSites.mockResolvedValue({
      items: [site('site-1', 'Green Valley'), site('site-2', 'Tower B')],
      next_cursor: null,
    })
    getBaseline.mockImplementation((id: string) =>
      Promise.resolve(baseline({ site_id: id, expected_daily_headcount: id === 'site-1' ? 24 : null })),
    )
    setBaseline.mockImplementation((id: string, body: Partial<SiteBaseline>) =>
      Promise.resolve(baseline({ site_id: id, ...body })),
    )
  })

  it('prefills the first site’s headcount', async () => {
    renderBaselines('owner')
    expect(await screen.findByDisplayValue('24')).toBeInTheDocument()
  })

  it('saves a new headcount through setBaseline', async () => {
    renderBaselines('owner')
    const input = await screen.findByDisplayValue('24')
    await userEvent.clear(input)
    await userEvent.type(input, '30')
    await userEvent.click(screen.getByRole('button', { name: /save baseline/i }))
    await waitFor(() =>
      expect(setBaseline).toHaveBeenCalledWith('site-1', {
        expected_daily_headcount: 30,
        notes: null,
      }),
    )
  })

  it('clears the headcount to null when left blank', async () => {
    renderBaselines('owner')
    const input = await screen.findByDisplayValue('24')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: /save baseline/i }))
    await waitFor(() =>
      expect(setBaseline).toHaveBeenCalledWith('site-1', {
        expected_daily_headcount: null,
        notes: null,
      }),
    )
  })

  it('blocks an invalid headcount (0) and does not call the API', async () => {
    renderBaselines('owner')
    const input = await screen.findByDisplayValue('24')
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    await userEvent.click(screen.getByRole('button', { name: /save baseline/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/whole number/i)
    expect(setBaseline).not.toHaveBeenCalled()
  })

  it('loads the chosen site’s baseline when switched', async () => {
    renderBaselines('owner')
    await screen.findByDisplayValue('24')
    await userEvent.selectOptions(screen.getByLabelText(/^Site$/i), 'site-2')
    await waitFor(() => expect(getBaseline).toHaveBeenCalledWith('site-2'))
  })
})
