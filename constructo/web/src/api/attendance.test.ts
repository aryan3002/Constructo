import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { attendanceApi } = await import('./attendance')
const { setToken, clearToken } = await import('./auth')
const { ApiError } = await import('./client')

describe('attendanceApi', () => {
  beforeEach(() => {
    clearToken()
    setToken('jwt-xyz')
  })
  afterEach(() => vi.restoreAllMocks())

  it('POSTs a capture with the bearer token and JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'ev-1', headcount: 24 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await attendanceApi.capture('site-1', {
      headcount: 24,
      client_capture_id: 'q-1',
    })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/sites/site-1/attendance')
    expect(init.method).toBe('POST')
    expect(init.headers.get('Authorization')).toBe('Bearer jwt-xyz')
    expect(JSON.parse(init.body)).toEqual({ headcount: 24, client_capture_id: 'q-1' })
  })

  it('reads the planned-vs-actual summary with a date query', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ actual: 10, expected: 12, status: 'warn' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await attendanceApi.summary('site-1', '2026-05-29')
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://test-api/api/v1/sites/site-1/attendance/summary?date=2026-05-29',
    )
    expect(out.status).toBe('warn')
  })

  it('surfaces the backend error envelope message as an ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ error: { code: 'forbidden', message: 'Site not in scope' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(attendanceApi.list('site-9')).rejects.toMatchObject({
      status: 403,
      message: 'Site not in scope',
    })
    await expect(attendanceApi.list('site-9')).rejects.toBeInstanceOf(ApiError)
  })
})
