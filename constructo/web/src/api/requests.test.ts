/**
 * requests.ts — API client unit test (web Task E1). Stubs global fetch and
 * asserts `requestsApi.list` hits the correct path per the backend contract
 * (`app/homeowner/router.py::list_requests`), including the optional
 * `?site_id=` filter, and that the response is returned as-is (typed
 * `RequestOut[]`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestsApi } from './requests'

const sample = [
  {
    id: 'req-1', site_id: 'site-1', raised_by: 'ho-1',
    title: 'Leak under the kitchen sink', detail: 'Water pooling since Tuesday',
    status: 'sent', sla_due_at: '2026-07-06T00:00:00Z',
    created_at: '2026-07-03T09:00:00Z', updated_at: '2026-07-03T09:00:00Z',
    voice_url: null,
  },
]

afterEach(() => vi.restoreAllMocks())

describe('requestsApi.list', () => {
  it('GETs /api/v1/homeowner/requests and returns the RequestOut[] as-is', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(sample), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const out = await requestsApi.list()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/v1/homeowner/requests')
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('Leak under the kitchen sink')
    expect(out[0].status).toBe('sent')
  })

  it('passes ?site_id= when a site is given', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    await requestsApi.list('site-9')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('site_id=site-9')
  })
})
