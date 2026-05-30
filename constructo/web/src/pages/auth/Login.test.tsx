import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Real (non-mock) network path; we stub fetch and assert calls. Network-free.
vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { Login } = await import('./Login')
const { getToken, clearToken } = await import('../../api/auth')
const { LanguageProvider } = await import('../../i18n')

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}

function renderLogin() {
  return render(
    <LanguageProvider defaultLanguage="en">
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('auth/Login', () => {
  beforeEach(() => {
    clearToken()
    navigateMock.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('runs the two-step phone -> OTP flow, stores the token, routes a returning owner home', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/auth/request-otp')) return jsonOk({ sent: true, dev_otp: '000000' })
      if (url.endsWith('/auth/login')) return jsonOk({ token: 'jwt-xyz' })
      if (url.endsWith('/auth/me'))
        return jsonOk({
          id: 'u1',
          company_id: 'c1',
          name: 'Asha',
          phone: '+919876543210',
          role: 'owner',
          language: 'en',
        })
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    // Returning owner: already onboarded -> should go to '/'.
    localStorage.setItem('cstk.onboarded.u1', 'true')

    renderLogin()

    // Step 1: phone -> send code.
    await userEvent.type(screen.getByLabelText(/phone number/i), '+919876543210')
    await userEvent.click(screen.getByRole('button', { name: /send code/i }))

    // Step 2: OTP field appears (prefilled 000000) -> sign in.
    const otp = await screen.findByLabelText(/one-time code/i)
    expect(otp).toHaveValue('000000')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => expect(getToken()).toBe('jwt-xyz'))
    const loginCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/login'))
    expect(loginCall).toBeTruthy()
    expect(JSON.parse((loginCall![1] as RequestInit).body as string)).toEqual({
      phone: '+919876543210',
      otp: '000000',
    })
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }))
  })

  it('sends a brand-new owner to the first-run flow', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/auth/request-otp')) return jsonOk({ sent: true, dev_otp: '000000' })
      if (url.endsWith('/auth/login')) return jsonOk({ token: 'jwt-new' })
      if (url.endsWith('/auth/me'))
        return jsonOk({
          id: 'u2',
          company_id: 'c2',
          name: null,
          phone: '+910000000000',
          role: 'owner',
          language: 'en',
        })
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLogin()
    await userEvent.type(screen.getByLabelText(/phone number/i), '+910000000000')
    await userEvent.click(screen.getByRole('button', { name: /send code/i }))
    await screen.findByLabelText(/one-time code/i)
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/welcome', { replace: true }),
    )
  })

  it('shows an error when login fails', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/auth/request-otp')) return jsonOk({ sent: true, dev_otp: '000000' })
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { code: 'invalid_otp', message: 'Invalid OTP' } }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLogin()
    await userEvent.type(screen.getByLabelText(/phone number/i), '+910000000000')
    await userEvent.click(screen.getByRole('button', { name: /send code/i }))
    await screen.findByLabelText(/one-time code/i)
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid OTP')
    expect(getToken()).toBeNull()
  })
})
