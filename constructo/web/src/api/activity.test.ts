import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

// Force the mock branch on for this suite (config reads import.meta.env at module load).
vi.mock('./config', async () => {
  const actual = await vi.importActual<typeof import('./config')>('./config')
  return { ...actual, USE_MOCKS: true, API_BASE: 'http://test.local' }
})

const { activityApi } = await import('./activity')
const { qk } = await import('./queryKeys')

describe('activityApi (mock branch)', () => {
  it('page() returns a summary + a first page of items with the shared shape', async () => {
    const page = await activityApi.page({ limit: 20 })
    expect(page.summary).toEqual(
      expect.objectContaining({
        updates_today: expect.any(Number),
        needs_decision_count: expect.any(Number),
        sites_total: expect.any(Number),
      }),
    )
    expect(page.items.length).toBeGreaterThan(0)
    const item = page.items[0]
    expect(item.id).toMatch(/^[a-z_]+:/) // "{kind}:{uuid}"
    expect(item).toEqual(
      expect.objectContaining({
        kind: expect.any(String),
        site_id: expect.any(String),
        site_name: expect.any(String),
        title: expect.any(String),
        occurred_at: expect.any(String),
        link: expect.objectContaining({ type: expect.any(String), id: expect.any(String) }),
        severity: expect.stringMatching(/^(info|success|warning)$/),
      }),
    )
  })

  it('mock feed_photo items include a scroll_message_id target', async () => {
    const page = await activityApi.page({ limit: 20 })
    const photo = page.items.find((item) => item.link.type === 'feed_photo')
    expect(photo?.link.scroll_message_id).toBe('msg-photo-1')
  })

  it('page() paginates: passing the returned cursor yields a different (or empty) page and eventually a null cursor', async () => {
    const first = await activityApi.page({ limit: 3 })
    expect(first.items).toHaveLength(3)
    expect(first.next_cursor).not.toBeNull()
    const second = await activityApi.page({ cursor: first.next_cursor!, limit: 3 })
    const firstIds = new Set(first.items.map((i) => i.id))
    for (const i of second.items) expect(firstIds.has(i.id)).toBe(false)
    // Walk to the end — the last page must report a null cursor.
    let cursor = second.next_cursor
    let guard = 0
    while (cursor && guard++ < 20) {
      const p = await activityApi.page({ cursor, limit: 3 })
      cursor = p.next_cursor
    }
    expect(cursor).toBeNull()
  })

  it('page({ siteId }) returns only items for that site', async () => {
    const all = await activityApi.page({ limit: 50 })
    const site = all.items[0].site_id
    const filtered = await activityApi.page({ siteId: site, limit: 50 })
    expect(filtered.items.length).toBeGreaterThan(0)
    for (const i of filtered.items) expect(i.site_id).toBe(site)
  })

  it('qk.activity is stable and namespaced', () => {
    expect(qk.activity()).toEqual(['activity', null])
    expect(qk.activity('s1')).toEqual(['activity', 's1'])
  })

  it('qk.activitySummary is a sibling key, not a descendant of qk.activity() — invalidating one does NOT refetch the other', () => {
    // Pins down real React Query v5 matching semantics (not just array-literal
    // intuition) so a future caller (e.g. D3's NewProjectModal) doesn't assume
    // a single invalidateQueries({ queryKey: qk.activity() }) also refreshes
    // the hero summary — it must invalidate qk.activitySummary() separately.
    const qc = new QueryClient()
    qc.setQueryData(qk.activity(), { items: [], summary: null, next_cursor: null })
    qc.setQueryData(qk.activitySummary(), { updates_today: 1, needs_decision_count: 0, sites_total: 1 })

    qc.invalidateQueries({ queryKey: qk.activity() })

    expect(qc.getQueryState(qk.activity())?.isInvalidated).toBe(true)
    expect(qc.getQueryState(qk.activitySummary())?.isInvalidated).toBe(false)
  })
})
