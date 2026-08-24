import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// Real (non-mock) network path; we stub fetch. Network-free.
vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { Join } = await import('./Join')
const { clearToken, getToken, setToken } = await import('../../api/auth')
const { LanguageProvider } = await import('../../i18n')

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}
function jsonErr(status: number, code: string, message: string) {
  return { ok: false, status, statusText: 'error', json: async () => ({ error: { code, message } }) }
}

const PREVIEW = { role: 'supervisor', company_name: 'Sharma Constructions', name: null, status: 'pending' }

function renderJoin() {
  return render(
    <LanguageProvider defaultLanguage="en">
      <MemoryRouter initialEntries={['/join/tok123']}>
        <Routes>
          <Route path="/join/:token" element={<Join />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('auth/Join', () => {
  beforeEach(() => {
    clearToken()
    navigateMock.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the role card (what you will do) BEFORE the sign-in button when signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/invites/tok123')) return jsonOk(PREVIEW)
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    renderJoin()

    expect(await screen.findByText('Join Sharma Constructions as Supervisor.')).toBeInTheDocument()
    expect(screen.getByText("As Supervisor, you'll…")).toBeInTheDocument()
    expect(screen.getByText('Tap the big camera or mic to log work — no forms.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    expect(navigateMock).toHaveBeenCalledWith('/login?next=%2Fjoin%2Ftok123')
  })

  it('accepts when signed in, then shows the coachmark and routes home', async () => {
    setToken('jwt-existing')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/invites/tok123') && !init?.method) return jsonOk(PREVIEW)
        if (url.endsWith('/invites/tok123/accept'))
          return jsonOk({ token: 'jwt-fresh', role: 'supervisor', landing: 'capture' })
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    renderJoin()

    await userEvent.click(await screen.findByRole('button', { name: /accept & join/i }))
    expect(await screen.findByText('Welcome to the team!')).toBeInTheDocument()
    expect(getToken()).toBe('jwt-fresh')
    await userEvent.click(screen.getByRole('button', { name: /got it/i }))
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })

  it('409 already_claimed renders the friendly message with a "Sign in" next step', async () => {
    setToken('jwt-existing')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/invites/tok123') && !init?.method) return jsonOk(PREVIEW)
        if (url.endsWith('/invites/tok123/accept'))
          return jsonErr(409, 'already_claimed', 'This invite has already been used.')
        throw new Error(`unexpected fetch ${url}`)
      }),
    )
    renderJoin()
    await userEvent.click(await screen.findByRole('button', { name: /accept & join/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This invite was already used. If that was you, sign in instead.')
    await userEvent.click(screen.getByRole('button', { name: /sign in →/i }))
    expect(navigateMock).toHaveBeenCalledWith('/login?next=%2Fjoin%2Ftok123')
  })

  it('an invalid token shows the invalid-link error as an alert', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(404, 'not_found', 'nope')))
    renderJoin()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('This invite link is no longer valid.'),
    )
  })
})
