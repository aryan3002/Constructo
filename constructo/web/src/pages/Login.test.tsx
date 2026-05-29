import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// Force the real (non-mock) network path so we can assert fetch + token storage.
vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

// Re-import after stubbing env (config reads import.meta.env at module load).
const { Login } = await import('./Login')
const { getToken, clearToken } = await import('../api/auth')

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (orig) => {
  const actual = await orig<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

describe('Login', () => {
  beforeEach(() => {
    clearToken()
    navigateMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts credentials to the login endpoint and stores the returned token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ token: 'jwt-abc-123' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText(/phone/i), '+919876543210')
    await userEvent.clear(screen.getByLabelText(/otp/i))
    await userEvent.type(screen.getByLabelText(/otp/i), '000000')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      phone: '+919876543210',
      otp: '000000',
    })

    await waitFor(() => expect(getToken()).toBe('jwt-abc-123'))
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true })
  })

  it('shows an error message when login fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ detail: 'Invalid OTP' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText(/phone/i), '+910000000000')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid OTP')
    expect(getToken()).toBeNull()
  })
})
