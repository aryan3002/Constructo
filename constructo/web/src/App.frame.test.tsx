// Every signed-in page sits in the app frame (role nav + main), the same way
// Home does; public pages stay frameless.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { App } = await import('./App')
const { setToken, clearToken } = await import('./api/auth')
const { LanguageProvider } = await import('./i18n')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { MemoryRouter } = await import('react-router-dom')
const { ThemeModeProvider } = await import('./ui/ThemeModeProvider')
const { ToastProvider } = await import('./ui/Toast')

const ME = {
  id: 'u1',
  company_id: 'c1',
  name: 'Asha Rao',
  phone: '+919800000001',
  role: 'owner',
  language: 'en',
  ai_consent_at: '2026-10-01T00:00:00Z',
}

function reply(url: string): unknown {
  if (url.endsWith('/api/v1/auth/me')) return ME
  if (url.includes('/auth/company')) return { id: 'c1', name: 'Sunrise Builders' }
  if (url.includes('/health')) return { site_id: 's1', score: 90, findings: [] }
  if (url.includes('/payments/ledger')) {
    return { site_id: null, totals: { inflow: '0', outflow: '0', net: '0', count: 0 }, items: [], next_cursor: null }
  }
  if (url.includes('/invites/tok-1')) {
    return { role: 'supervisor', company_name: 'Sunrise Builders', name: null, status: 'pending' }
  }
  if (url.includes('/invites') || url.includes('/drawings')) return []
  if (url.includes('/notifications/settings')) return { sla_hours: 24, escalate_overdue: true, daily_digest: true }
  return { items: [], next_cursor: null }
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeModeProvider>
        <LanguageProvider defaultLanguage="en">
          <ToastProvider>
            <MemoryRouter initialEntries={[path]}>
              <App />
            </MemoryRouter>
          </ToastProvider>
        </LanguageProvider>
      </ThemeModeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => new Response(JSON.stringify(reply(String(url))), { status: 200 })),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  clearToken()
})

describe('signed-in pages are in the frame', () => {
  beforeEach(() => setToken('jwt-owner'))

  it.each([
    '/approvals',
    '/payments',
    '/permits',
    '/search',
    '/settings',
    '/settings/admin',
    '/settings/documents',
    '/health/s1',
    '/invite',
  ])('%s', async (path) => {
    renderAt(path)
    const nav = await screen.findByRole('navigation', { name: 'Primary' }, { timeout: 4000 })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    // The owner's own tabs, the same nav Home has.
    await waitFor(() => expect(screen.getAllByRole('link', { name: /latest/i }).length).toBeGreaterThan(0))
  })
})

describe('public pages stay frameless', () => {
  it.each(['/login', '/join/tok-1', '/delete-account', '/vendor-confirm/tok-1'])('%s', async (path) => {
    renderAt(path)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
  })
})
