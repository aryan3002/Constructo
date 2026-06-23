/**
 * groups.ts — API client unit tests (web Phase C). Stubs global fetch and
 * asserts each method hits the correct verb / path / body per the backend
 * contract (groups_router.py).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { groupsApi } from './groups'

function mockFetch(json: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    statusText: 'OK',
    json: async () => json,
  } as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => vi.unstubAllGlobals())

describe('groupsApi', () => {
  it('create POSTs to /groups with the body', async () => {
    const fetchFn = mockFetch({ id: 'g1', name: 'Crew', site_id: null, archived: false, members: [] })
    await groupsApi.create({ name: 'Crew', site_id: null, member_user_ids: ['u1'] })
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/chat\/groups$/)
    expect((init as RequestInit).method).toBe('POST')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      name: 'Crew',
      site_id: null,
      member_user_ids: ['u1'],
    })
  })

  it('addableUsers GETs with site_id + group_id query', async () => {
    const fetchFn = mockFetch([])
    await groupsApi.addableUsers({ siteId: 's1', groupId: 'g1' })
    expect(fetchFn.mock.calls[0][0]).toMatch(/addable-users\?site_id=s1&group_id=g1$/)
  })

  it('addableUsers omits the query when no opts', async () => {
    const fetchFn = mockFetch([])
    await groupsApi.addableUsers()
    expect(fetchFn.mock.calls[0][0]).toMatch(/addable-users$/)
  })

  it('members GETs the roster path', async () => {
    const fetchFn = mockFetch({ members: [] })
    await groupsApi.members('g1')
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/groups\/g1\/members$/)
  })

  it('addMembers POSTs {user_ids}', async () => {
    const fetchFn = mockFetch({ id: 'g1', name: null, site_id: null, archived: false, members: [] })
    await groupsApi.addMembers('g1', ['u2', 'u3'])
    expect(JSON.parse((fetchFn.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      user_ids: ['u2', 'u3'],
    })
  })

  it('removeMember DELETEs the member path', async () => {
    const fetchFn = mockFetch(null, 204)
    await groupsApi.removeMember('g1', 'u2')
    expect(fetchFn.mock.calls[0][0]).toMatch(/\/groups\/g1\/members\/u2$/)
    expect((fetchFn.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })

  it('patch PATCHes the group fields', async () => {
    const fetchFn = mockFetch({ id: 'g1', name: 'Renamed', site_id: null, archived: false, members: [] })
    await groupsApi.patch('g1', { name: 'Renamed', member_role: { user_id: 'u2', role: 'admin' } })
    const init = fetchFn.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Renamed',
      member_role: { user_id: 'u2', role: 'admin' },
    })
  })
})
