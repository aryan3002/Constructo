import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { DeleteAccount } = await import('./DeleteAccount')
const { clearToken, getToken, setToken } = await import('../../api/auth')
const { LanguageProvider } = await import('../../i18n')

function jsonOk(body: unknown, status = 200) {
  return { ok: true, status, json: async () => body }
}

function jsonErr(status: number, code: string, message: string) {
  return { ok: false, status, statusText: 'error', json: async () => ({ error: { code, message } }) }
}

const ME = {
  id: 'u1',
  company_id: 'c1',
  name: 'Asha',
  phone: '+919876543210',
  role: 'homeowner',
  language: 'en',
}

function renderPage() {
  return render(
    <LanguageProvider defaultLanguage="en">
      <MemoryRouter initialEntries={['/delete-account']}>
        <DeleteAccount />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

/** A server that knows one account. Records every call. */
function server() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (url.endsWith('/auth/request-otp')) return jsonOk({ sent: true, dev_otp: '000000' })
    if (url.endsWith('/auth/login')) {
      const body = JSON.parse(init!.body as string)
      if (body.phone !== ME.phone) return jsonErr(404, 'not_registered', 'not registered')
      return jsonOk({ token: 'jwt-login' })
    }
    if (url.endsWith('/auth/me')) return jsonOk(ME)
    if (url.endsWith('/auth/step-up/request-otp')) return jsonOk({ sent: true })
    if (url.endsWith('/auth/step-up/verify')) return jsonOk({ step_up_token: 'step-1', expires_in: 300 })
    if (url.endsWith('/users/me') && method === 'DELETE') return { ok: true, status: 204, json: async () => ({}) }
    if (url.endsWith('/auth/logout')) return { ok: true, status: 204, json: async () => ({}) }
    throw new Error(`unexpected ${method} ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => clearToken())
afterEach(() => {
  vi.unstubAllGlobals()
  clearToken()
})

describe('DeleteAccount', () => {
  it('explains, signs in without signup, steps up, deletes and signs out', async () => {
    const fetchMock = server()
    renderPage()

    expect(screen.getByText(/Your name and phone number are removed from Neev/)).toBeInTheDocument()
    expect(screen.getByText("This can't be undone.")).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/phone number/i), '9876543210')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.type(await screen.findByLabelText(/one-time code/i), '000000')

    // Step-up: a second code.
    await screen.findByText('Confirm it is you')
    await userEvent.type(screen.getByLabelText(/one-time code/i), '000000')

    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByText('Your account is deleted')).toBeInTheDocument()

    const login = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/login'))!
    expect(JSON.parse((login[1] as RequestInit).body as string)).toEqual({
      phone: '+919876543210',
      otp: '000000',
    })
    const del = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith('/users/me') && (c[1] as RequestInit)?.method === 'DELETE',
    )!
    expect(new Headers((del[1] as RequestInit).headers).get('X-Step-Up-Token')).toBe('step-1')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/auth/logout'))).toBe(true)
    expect(getToken()).toBeNull()
  })

  it('says plainly when no account uses the number', async () => {
    const fetchMock = server()
    renderPage()
    await userEvent.type(screen.getByLabelText(/phone number/i), '9000000000')
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.type(await screen.findByLabelText(/one-time code/i), '000000')

    expect(await screen.findByRole('alert')).toHaveTextContent('No Neev account uses this number.')
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/users/me'))).toBe(false)
    expect(getToken()).toBeNull()
  })

  it('someone already signed in starts at the step-up code', async () => {
    setToken('jwt-existing')
    const fetchMock = server()
    renderPage()
    expect(await screen.findByText('Confirm it is you')).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/auth/step-up/request-otp'))).toBe(
        true,
      ),
    )
    expect(await screen.findByText(/one more code to/)).toBeInTheDocument()
  })
})
