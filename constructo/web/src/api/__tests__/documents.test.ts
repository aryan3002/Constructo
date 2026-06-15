import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('VITE_USE_MOCKS', 'false')
vi.stubEnv('VITE_API_BASE', 'http://test-api')

const { documentsApi } = await import('../documents')

beforeEach(() => {
  localStorage.setItem('constructo.token', 'dev')
})

describe('documentsApi', () => {
  it('listDocuments() GETs /api/v1/documents and returns docs', async () => {
    const docs = [
      {
        id: 'doc-1',
        company_id: 'company-1',
        site_id: null,
        doc_type: 'contract',
        title: 'Main Contract',
        file_url: 'https://cdn.example.com/contract.pdf',
        expiry_on: null,
        notes: null,
        is_active: true,
        created_by: 'user-1',
        created_at: '2026-05-01T10:00:00Z',
      },
    ]
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(docs), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await documentsApi.listDocuments()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/documents')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer dev')
    expect(result).toEqual(docs)
  })

  it('listDocuments({ siteId, includeArchived }) adds encoded query params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await documentsApi.listDocuments({ siteId: 's1', includeArchived: true })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/documents?site_id=s1&include_archived=true')
  })

  it('presign() POSTs body and returns {key, put_url, mode}', async () => {
    const ticket = { key: 'docs/c.pdf', put_url: 'https://r2.example.com/put', mode: 'presigned' }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(ticket), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await documentsApi.presign('c.pdf', 'application/pdf', 's1')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/documents/presign')
    expect(init.method).toBe('POST')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody).toEqual({ filename: 'c.pdf', content_type: 'application/pdf', site_id: 's1' })
    expect(result).toEqual(ticket)
  })

  it('presign() omits site_id when not provided', async () => {
    const ticket = { key: 'docs/c.pdf', put_url: null, mode: 'unavailable' }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(ticket), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await documentsApi.presign('c.pdf', 'application/pdf')

    const [, init] = fetchMock.mock.calls[0]
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody).not.toHaveProperty('site_id')
  })

  it('create() POSTs to /api/v1/documents with body', async () => {
    const created = {
      id: 'doc-new',
      company_id: 'company-1',
      site_id: 's1',
      doc_type: 'noc',
      title: 'NOC from Municipality',
      file_url: 'docs/noc.pdf',
      expiry_on: '2027-06-01',
      notes: 'Approved',
      is_active: true,
      created_by: 'user-1',
      created_at: '2026-06-14T09:00:00Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(created), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const body = {
      site_id: 's1',
      doc_type: 'noc' as const,
      title: 'NOC from Municipality',
      file_url: 'docs/noc.pdf',
      expiry_on: '2027-06-01',
      notes: 'Approved',
    }
    const result = await documentsApi.create(body)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/documents')
    expect(init.method).toBe('POST')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody).toMatchObject({ doc_type: 'noc', title: 'NOC from Municipality', site_id: 's1' })
    expect(result).toEqual(created)
  })

  it('update() PATCHes /api/v1/documents/{id} with patch', async () => {
    const updated = {
      id: 'id1',
      company_id: 'company-1',
      site_id: null,
      doc_type: 'insurance',
      title: 'Insurance Policy',
      file_url: 'docs/insurance.pdf',
      expiry_on: null,
      notes: null,
      is_active: false,
      created_by: 'user-1',
      created_at: '2026-05-10T00:00:00Z',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await documentsApi.update('id1', { is_active: false })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://test-api/api/v1/documents/id1')
    expect(init.method).toBe('PATCH')
    const sentBody = JSON.parse(init.body as string)
    expect(sentBody).toEqual({ is_active: false })
    expect(result).toEqual(updated)
  })

  it('throws ApiError on non-ok response', async () => {
    const { ApiError } = await import('../client')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 403, statusText: 'Forbidden' })),
    )
    await expect(documentsApi.listDocuments()).rejects.toBeInstanceOf(ApiError)
  })
})
