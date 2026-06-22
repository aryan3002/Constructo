/**
 * disputes.ts — API client unit tests (Phase D T2).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { disputesApi } from './disputes'

function mockFetch(json: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, statusText: 'OK', json: async () => json } as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}
beforeEach(() => vi.unstubAllGlobals())

describe('disputesApi', () => {
  it('list GETs /events/{id}/disputes', async () => {
    const f = mockFetch([])
    await disputesApi.list('E1')
    expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/events\/E1\/disputes$/)
  })
  it('raise POSTs {reason}', async () => {
    const f = mockFetch({ id: 'd1' })
    await disputesApi.raise('E1', { reason: 'wrong qty' })
    expect(f.mock.calls[0][0]).toMatch(/\/events\/E1\/disputes$/)
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ reason: 'wrong qty' })
  })
  it('resolve POSTs to /disputes/{id}/resolve', async () => {
    const f = mockFetch({ id: 'd1', status: 'resolved' })
    await disputesApi.resolve('d1', { resolution_note: 'kept' })
    expect(f.mock.calls[0][0]).toMatch(/\/disputes\/d1\/resolve$/)
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ resolution_note: 'kept' })
  })
  it('withdraw POSTs to /disputes/{id}/withdraw', async () => {
    const f = mockFetch({ id: 'd1', status: 'withdrawn' })
    await disputesApi.withdraw('d1')
    expect(f.mock.calls[0][0]).toMatch(/\/disputes\/d1\/withdraw$/)
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('POST')
  })
})
