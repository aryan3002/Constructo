/**
 * sites.ts — API client unit test (web Slice D1). Stubs global fetch and
 * asserts `sitesApi.create` hits the correct verb / path / body per the
 * backend contract (`app/sites/router.py::create_site`), and that the
 * response is returned as-is (typed `SiteOut`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sitesApi } from './sites'

const OK_SITE = {
  id: 's-new',
  company_id: 'co1',
  name: 'Green Acres Tower B',
  location: '',
  type: 'residential',
  status: 'active',
}

describe('sitesApi.create', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(OK_SITE), { status: 201 })),
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  it('POSTs /api/v1/sites with the create body and returns the SiteOut', async () => {
    const out = await sitesApi.create({ name: 'Green Acres Tower B', type: 'residential' })
    expect(out).toEqual(OK_SITE)
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(url)).toMatch(/\/api\/v1\/sites$/)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Green Acres Tower B',
      type: 'residential',
    })
  })

  it('omits location when not provided and includes it (trimmed) when present', async () => {
    await sitesApi.create({ name: 'A', type: 'villa', location: '  Bandra  ' })
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(JSON.parse(init.body as string)).toEqual({ name: 'A', type: 'villa', location: 'Bandra' })
  })

  it('throws ApiError on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'nope' }), { status: 400 })),
    )
    await expect(sitesApi.create({ name: 'x', type: 'residential' })).rejects.toMatchObject({
      status: 400,
      message: 'nope',
    })
  })
})
