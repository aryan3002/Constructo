import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

function jsonErr(status: number, code: string, message: string) {
  return {
    ok: false,
    status,
    statusText: 'error',
    json: async () => ({ error: { code, message } }),
  }
}

function renderLogin(path = '/login') {
  return render(
    <LanguageProvider defaultLanguage="en">
      <MemoryRouter initialEntries={[path]}>
        <Login />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

/** Step 1: type the 10 local digits, press Continue, land on the OTP step. */
async function goToOtpStep(localDigits = '9876543210') {
  await userEvent.type(screen.getByLabelText(/phone number/i), localDigits)
  await userEvent.click(screen.getByRole('button', { name: /continue/i }))
  return screen.findByLabelText(/one-time code/i)
}

function meOwner(id: string, name: string | null = 'Asha') {
  return {
    id,
    company_id: 'c1',
    name,
    phone: '+919876543210',
    role: 'owner',
    language: 'en',
  }
}

describe('auth/Login', () => {
  beforeEach(() => {
    clearToken()
    navigateMock.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it('phone -> code (auto-submits at 6 digits), sends E.164, stores the token, routes a returning owner home', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/auth/request-otp')) return jsonOk({ sent: true, dev_otp: '000000' })
      if (url.endsWith('/auth/login')) return jsonOk({ token: 'jwt-xyz' })
      if (url.endsWith('/auth/me')) return jsonOk(meOwner('u1'))
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    // Returning owner: already onboarded -> should go to '/'.
    localStorage.setItem('cstk.onboarded.u1', 'true')

    renderLogin()

    // Step 1: the fixed +91 prefix is shown; "Continue" is gated on a valid number.
    expect(screen.getByText('+91')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue/i })).toBeDisabled()

    const otp = await goToOtpStep()

    // Step 2: the code is NEVER pre-filled; the number is echoed masked.
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument()
    expect(otp).toHaveValue('')
    expect(screen.getByText(/we texted a 6-digit code to \+91 98765 43210/i)).toBeInTheDocument()
    expect(screen.getByText('Resend in 30s')).toBeInTheDocument()

    // Typing the 6th digit submits without pressing the button.
    await userEvent.type(otp, '000000')

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
      if (url.endsWith('/auth/me')) return jsonOk(meOwner('u2', null))
      // ownerIsSetUp's site probe -> no sites.
      if (url.includes('/sites')) return jsonOk({ items: [] })
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLogin()
    const otp = await goToOtpStep('9000000000')
    await userEvent.type(otp, '00000')
    // The keyboard path still works: 5 digits + Sign in is disabled, 6 enables it.
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeDisabled()
    await userEvent.type(otp, '0')

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/welcome', { replace: true }),
    )
  })

  it('returns to ?next= (an invite link) after signing in', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/auth/request-otp')) return jsonOk({ sent: true, dev_otp: '000000' })
      if (url.endsWith('/auth/login')) return jsonOk({ token: 'jwt-next' })
      throw new Error(`unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLogin('/login?next=%2Fjoin%2Ftok123')
    const otp = await goToOtpStep()
    await userEvent.type(otp, '000000')

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/join/tok123', { replace: true }),
    )
    // No /auth/me round-trip needed on the invite path.
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/auth/me'))).toBe(false)
  })

  it('shows the friendly wrong-code message and clears the field on 401 invalid_otp', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/auth/request-otp')) return jsonOk({ sent: true, dev_otp: '000000' })
      return jsonErr(401, 'invalid_otp', 'Invalid OTP')
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLogin()
    const otp = await goToOtpStep()
    await userEvent.type(otp, '123456')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("That code didn't match. Check the SMS and try again.")
    expect(alert).not.toHaveTextContent('Invalid OTP')
    expect(otp).toHaveValue('')
    expect(otp).toHaveAttribute('aria-invalid', 'true')
    expect(getToken()).toBeNull()
  })

  it('403 not_allowed offers "What\'s what" which opens the guide at "Number not enabled?"', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.endsWith('/auth/request-otp')) return jsonOk({ sent: true, dev_otp: '000000' })
      return jsonErr(403, 'not_allowed', 'This number is not enabled for the pilot')
    })
    vi.stubGlobal('fetch', fetchMock)

    renderLogin()
    const otp = await goToOtpStep()
    await userEvent.type(otp, '000000')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("This number isn't enabled for Neev yet.")
    await userEvent.click(within(alert).getByRole('button', { name: /what's what/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Number not enabled?')).toBeInTheDocument()
  })

  it('"Change number" goes back to step 1 keeping the number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonOk({ sent: true, dev_otp: '000000' })),
    )
    renderLogin()
    await goToOtpStep()
    await userEvent.click(screen.getByRole('button', { name: /change number/i }))
    expect(await screen.findByLabelText(/phone number/i)).toHaveValue('98765 43210')
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument()
  })
})
