/**
 * chat insight clients (brief / sentinel / recap) — Phase D T1.
 * Stubs global fetch and asserts verb/path per the backend contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { chatApi } from './chat'

function mockFetch(json: unknown) {
  const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => json } as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => vi.unstubAllGlobals())

describe('chat insight clients', () => {
  it('brief GETs /chat/brief?site_id', async () => {
    const f = mockFetch({ site_id: 's1', risk_count: 0, headline: '', risks: [] })
    await chatApi.brief('s1')
    expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/chat\/brief\?site_id=s1$/)
  })

  it('sentinel GETs /sentinel?site_id&window_days', async () => {
    const f = mockFetch({ signals: [] })
    await chatApi.sentinel('s1', 7)
    expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/sentinel\?site_id=s1&window_days=7$/)
  })

  it('sentinel defaults window_days to 1', async () => {
    const f = mockFetch({ signals: [] })
    await chatApi.sentinel('s1')
    expect(f.mock.calls[0][0]).toMatch(/window_days=1$/)
  })

  it('recap GETs /recap?site_id&days', async () => {
    const f = mockFetch({ site_id: 's1', days: 1, event_counts: {}, material_totals: {}, worker_days: null, amount_total: null, open_disputes: 0, summary: '' })
    await chatApi.recap('s1')
    expect(f.mock.calls[0][0]).toMatch(/\/api\/v1\/recap\?site_id=s1&days=1$/)
  })
})
