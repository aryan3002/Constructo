/**
 * actionItems.ts — API client unit tests (Phase D T3).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { actionItemsApi } from './actionItems'

function mockFetch(json: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok: status < 400, status, statusText: 'OK', json: async () => json } as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}
beforeEach(() => vi.unstubAllGlobals())

describe('actionItemsApi', () => {
  it('list GETs with site_id (+ status + mine)', async () => {
    const f = mockFetch([])
    await actionItemsApi.list('s1', { status: 'open', mine: true })
    expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/action-items\?site_id=s1&status=open&mine=true$/)
  })
  it('list omits filters when not given', async () => {
    const f = mockFetch([])
    await actionItemsApi.list('s1')
    expect(f.mock.calls[0][0]).toMatch(/\/action-items\?site_id=s1$/)
  })
  it('create POSTs the body', async () => {
    const f = mockFetch({ id: 'a1' })
    await actionItemsApi.create({ site_id: 's1', title: 'Order cement', source_message_id: 'm1' })
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('POST')
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ site_id: 's1', title: 'Order cement', source_message_id: 'm1' })
  })
  it('update PATCHes status', async () => {
    const f = mockFetch({ id: 'a1', status: 'done' })
    await actionItemsApi.update('a1', { status: 'done' })
    expect(f.mock.calls[0][0]).toMatch(/\/action-items\/a1$/)
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('PATCH')
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({ status: 'done' })
  })
  it('remove DELETEs the item', async () => {
    const f = mockFetch({ id: 'a1', status: 'cancelled' })
    await actionItemsApi.remove('a1')
    expect(f.mock.calls[0][0]).toMatch(/\/action-items\/a1$/)
    expect((f.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })
})
