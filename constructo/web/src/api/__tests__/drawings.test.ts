import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { drawingsApi } = await import('../drawings')

beforeEach(() => {
  localStorage.setItem('constructo.token', 'dev')
})

describe('drawingsApi', () => {
  it('listRegister() GETs /api/v1/publish/drawings/register and returns rows', async () => {
    const rows = [
      {
        id: 'drw-1',
        site_id: 'site-1',
        title: 'Ground Floor Plan',
        version: 'v1',
        kind: 'plan',
        change_note: null,
        published_at: '2026-06-10T10:00:00Z',
        supersedes_id: null,
        site_name: 'Test Site',
        is_current: true,
        file_url: 'https://cdn.example.com/plan.pdf',
      },
    ]
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(rows), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await drawingsApi.listRegister()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/publish/drawings/register')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer dev')
    expect(result).toEqual(rows)
  })

  it('listRegister("site-1") includes ?site_id=site-1', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await drawingsApi.listRegister('site-1')

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/publish/drawings/register?site_id=site-1')
  })

  it('presign() POSTs body and returns {key, put_url, mode}', async () => {
    const ticket = { key: 'drawings/site-1/plan.pdf', put_url: 'https://r2.example.com/put', mode: 'presigned' }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(ticket), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await drawingsApi.presign('site-1', 'plan.pdf', 'application/pdf')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/publish/drawings/presign')
    expect(init.method).toBe('POST')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody).toEqual({ site_id: 'site-1', filename: 'plan.pdf', content_type: 'application/pdf' })
    expect(result).toEqual(ticket)
  })

  it('publish() POSTs to /api/v1/publish/drawings with body', async () => {
    const created = {
      id: 'drw-new',
      site_id: 'site-1',
      title: 'Section A',
      version: 'v1',
      kind: 'section',
      change_note: 'Initial issue',
      published_at: '2026-06-14T09:00:00Z',
      supersedes_id: null,
      site_name: 'Test Site',
      is_current: true,
      file_url: 'drawings/site-1/section-a.pdf',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const body = {
      site_id: 'site-1',
      title: 'Section A',
      version: 'v1',
      file_url: 'drawings/site-1/section-a.pdf',
      kind: 'section' as const,
      change_note: 'Initial issue',
    }
    const result = await drawingsApi.publish(body)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/publish/drawings')
    expect(init.method).toBe('POST')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody).toMatchObject({ site_id: 'site-1', title: 'Section A', version: 'v1' })
    expect(result).toEqual(created)
  })

  it('throws ApiError on non-ok response', async () => {
    const { ApiError } = await import('../client')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: 'Forbidden' })),
    )
    await expect(drawingsApi.listRegister()).rejects.toBeInstanceOf(ApiError)
  })
})
