/**
 * client.ts — no mock data against a real server. Mock events are a dev aid
 * for VITE_USE_MOCKS=true only; a 404 (or any failure) is an honest error.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function loadClient(useMocks: boolean) {
  vi.stubEnv('VITE_USE_MOCKS', useMocks ? 'true' : 'false')
  vi.resetModules()
  return (await import('./client')).api
}

describe('api.listSiteEvents', () => {
  it('turns a 404 into an error, never mock events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 })),
    )
    const api = await loadClient(false)
    await expect(api.listSiteEvents('site-1', '2026-07-03')).rejects.toMatchObject({ status: 404 })
  })

  it('returns the real events, not flagged as mock', async () => {
    const items = [{ id: 'e1' }]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items, next_cursor: null }), { status: 200 })),
    )
    const api = await loadClient(false)
    await expect(api.listSiteEvents('site-1', '2026-07-03')).resolves.toEqual({
      events: items,
      usedMock: false,
    })
  })

  it('serves mock events only when VITE_USE_MOCKS=true', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const api = await loadClient(true)
    const out = await api.listSiteEvents('site-1', '2026-07-03')
    expect(out.usedMock).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
