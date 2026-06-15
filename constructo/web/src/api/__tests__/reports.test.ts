import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { reportsApi } = await import('../reports')

beforeEach(() => { localStorage.setItem('constructo.token', 'dev') })

describe('reportsApi', () => {
  it('dprPackPdf returns a Blob', async () => {
    const blob = new Blob([new Uint8Array([0x25,0x50,0x44,0x46])], { type: 'application/pdf' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(blob, { status: 200, headers: { 'Content-Type': 'application/pdf' } })))
    const out = await reportsApi.dprPackPdf('site-1', '2026-06-10')
    expect(out.type).toBe('application/pdf')
  })

  it('dprPackPdf calls the correct URL with bearer token', async () => {
    const blob = new Blob([new Uint8Array([0x25,0x50,0x44,0x46])], { type: 'application/pdf' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob, { status: 200, headers: { 'Content-Type': 'application/pdf' } }))
    vi.stubGlobal('fetch', fetchMock)
    await reportsApi.dprPackPdf('site-abc', '2026-06-14')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/reports/dpr.pdf?site_id=site-abc&date=2026-06-14')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer dev')
  })

  it('progressPdf builds correct URL with siteId', async () => {
    const blob = new Blob([new Uint8Array([0x25,0x50,0x44,0x46])], { type: 'application/pdf' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob, { status: 200, headers: { 'Content-Type': 'application/pdf' } }))
    vi.stubGlobal('fetch', fetchMock)
    await reportsApi.progressPdf('site-1', '2026-06-01', '2026-06-14')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/reports/progress.pdf?site_id=site-1&date_from=2026-06-01&date_to=2026-06-14')
  })

  it('progressPdf omits site_id when null', async () => {
    const blob = new Blob([new Uint8Array([0x25,0x50,0x44,0x46])], { type: 'application/pdf' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(blob, { status: 200, headers: { 'Content-Type': 'application/pdf' } }))
    vi.stubGlobal('fetch', fetchMock)
    await reportsApi.progressPdf(null, '2026-06-01', '2026-06-14')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/reports/progress.pdf?date_from=2026-06-01&date_to=2026-06-14')
    expect(url).not.toContain('site_id')
  })

  it('throws ApiError on non-ok response', async () => {
    const { ApiError } = await import('../client')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: 'Forbidden' })))
    await expect(reportsApi.dprPackPdf('site-1', '2026-06-10')).rejects.toBeInstanceOf(ApiError)
  })
})
