import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { specsApi, ApiError: _ApiError } = await (async () => {
  const specs = await import('../specs')
  const client = await import('../client')
  return { specsApi: specs.specsApi, ApiError: client.ApiError }
})()

function makeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  localStorage.setItem('constructo.token', 'test-token')
})

describe('specsApi.list', () => {
  it('calls GET /api/v1/specs?site_id=... with bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse([]))
    vi.stubGlobal('fetch', fetchMock)
    await specsApi.list('site-abc')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/specs?site_id=site-abc')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer test-token')
  })

  it('returns the spec array', async () => {
    const spec = { id: 's1', label: 'Tile', routing_status: 'draft' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse([spec])))
    const result = await specsApi.list('site-1')
    expect(result).toEqual([spec])
  })
})

describe('specsApi.desk', () => {
  it('calls GET /api/v1/specs/desk?site_id=...', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeResponse({ rooms: [], grand_total: '0', excluded_total: 0 }))
    vi.stubGlobal('fetch', fetchMock)
    await specsApi.desk('site-123')
    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/specs/desk?site_id=site-123')
  })
})

describe('specsApi.create', () => {
  it('calls POST /api/v1/specs with correct JSON body', async () => {
    const created = { id: 's99', label: 'Marble', routing_status: 'draft' }
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(created, 201))
    vi.stubGlobal('fetch', fetchMock)
    await specsApi.create({ site_id: 'site-1', component_id: 'comp-1', label: 'Marble' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/specs')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toMatchObject({ label: 'Marble' })
  })
})

describe('specsApi.update', () => {
  it('calls PATCH /api/v1/specs/{id} with patch body', async () => {
    const updated = { id: 's1', label: 'Marble Updated', routing_status: 'draft' }
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(updated))
    vi.stubGlobal('fetch', fetchMock)
    await specsApi.update('s1', { label: 'Marble Updated', qty: '10' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/specs/s1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ label: 'Marble Updated', qty: '10' })
  })
})

describe('specsApi.route', () => {
  it('calls POST /api/v1/specs/{id}/route with no body', async () => {
    const routed = { id: 's1', routing_status: 'out_for_approval', sent_at: '2026-06-14T10:00:00Z' }
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(routed))
    vi.stubGlobal('fetch', fetchMock)
    await specsApi.route('s1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/specs/s1/route')
    expect(init.method).toBe('POST')
  })
})

describe('specsApi.approve', () => {
  it('calls POST /api/v1/specs/{id}/approve with {status, client_final_code}', async () => {
    const approved = { id: 's1', routing_status: 'approved', approval_status: 'approved' }
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(approved))
    vi.stubGlobal('fetch', fetchMock)
    await specsApi.approve('s1', { status: 'approved', client_final_code: 'OS-001' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/specs/s1/approve')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ status: 'approved', client_final_code: 'OS-001' })
  })

  it('sends only status when client_final_code omitted', async () => {
    const rejected = { id: 's1', routing_status: 'returned', approval_status: 'rejected' }
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(rejected))
    vi.stubGlobal('fetch', fetchMock)
    await specsApi.approve('s1', { status: 'rejected' })
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({ status: 'rejected' })
  })
})

describe('specsApi.release', () => {
  it('calls POST /api/v1/specs/{id}/release with no body', async () => {
    const released = { id: 's1', routing_status: 'released', released_at: '2026-06-14T12:00:00Z' }
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(released))
    vi.stubGlobal('fetch', fetchMock)
    await specsApi.release('s1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/specs/s1/release')
    expect(init.method).toBe('POST')
  })
})

describe('specsApi.extract', () => {
  it('calls POST /api/v1/specs/extract as multipart FormData', async () => {
    const extracted = { spec: { id: 's99', routing_status: 'draft' }, extracted: {} }
    const fetchMock = vi.fn().mockResolvedValue(makeResponse(extracted, 201))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['fake-image'], 'photo.jpg', { type: 'image/jpeg' })
    await specsApi.extract('site-1', 'comp-1', file)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/specs/extract')
    expect(init.method).toBe('POST')
    // Body must be FormData (multipart) — not a string
    expect(init.body).toBeInstanceOf(FormData)
    const fd = init.body as FormData
    expect(fd.get('site_id')).toBe('site-1')
    expect(fd.get('component_id')).toBe('comp-1')
    expect(fd.get('image')).toBeInstanceOf(File)
  })
})

describe('specsApi error handling', () => {
  it('throws ApiError on a non-ok response', async () => {
    const { ApiError } = await import('../client')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: 'Forbidden' })))
    await expect(specsApi.list('site-1')).rejects.toBeInstanceOf(ApiError)
  })
})
