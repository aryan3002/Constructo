import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Real (non-mock) network path; we stub fetch. Network-free.
vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { RoleLanding } = await import('./RoleLanding')
const { setToken, clearToken } = await import('../../api/auth')
const { LanguageProvider } = await import('../../i18n')
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

/** Render RoleLanding at "/" with labelled landmark pages it can redirect to. */
function renderLanding() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider defaultLanguage="en">
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<RoleLanding />} />
            <Route path="/owner" element={<p>owner-home</p>} />
            <Route path="/supervisor/capture" element={<p>supervisor-capture</p>} />
            <Route path="/mukadam/attendance" element={<p>mukadam-attendance</p>} />
            <Route path="/reconcile" element={<p>reconcile-home</p>} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  )
}

describe('auth/RoleLanding', () => {
  beforeEach(() => setToken('jwt-test'))
  afterEach(() => {
    clearToken()
    vi.restoreAllMocks()
  })

  it.each([
    ['brief', 'owner', 'owner-home'],
    ['capture', 'supervisor', 'supervisor-capture'],
    ['attendance', 'labor_contractor', 'mukadam-attendance'],
    ['reconcile', 'accountant', 'reconcile-home'],
    ['orders', 'procurement', 'reconcile-home'],
  ])('lands the %s key on its home', async (landing, role, expected) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth/me/landing')) return jsonOk({ role, landing })
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    renderLanding()
    await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument())
  })

  it('falls back to the owner brief when the landing endpoint is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/auth/me/landing'))
          return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }
        if (url.endsWith('/auth/me'))
          return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) }
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    renderLanding()
    await waitFor(() => expect(screen.getByText('owner-home')).toBeInTheDocument())
  })
})
