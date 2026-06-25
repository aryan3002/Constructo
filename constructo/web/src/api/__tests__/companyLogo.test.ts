import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { authApi } = await import('../auth')

beforeEach(() => {
  localStorage.setItem('constructo.token', 'dev')
  vi.restoreAllMocks()
})

describe('authApi.presignCompanyLogo', () => {
  it('POSTs the content_type to the logo presign endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ key: 'branding/c/logo.png', put_url: 'https://put/x', upload_mode: 'presigned' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const out = await authApi.presignCompanyLogo({ content_type: 'image/png' })
    expect(out.upload_mode).toBe('presigned')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/v1/auth/company/logo/presign')
    expect(JSON.parse(String(init?.body))).toEqual({ content_type: 'image/png' })
  })
})
