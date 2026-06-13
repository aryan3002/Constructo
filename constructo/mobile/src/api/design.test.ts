jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../store/secure', () => ({ getToken: jest.fn().mockResolvedValue('test-token') }))

const mockFetch = jest.fn()
;(globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch
function mockOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body })
}
afterEach(() => jest.clearAllMocks())

import { design } from './client'

test('profileBySite GETs the by-site path with auth', async () => {
  mockOk({ id: 'p1', areas: [], contributors: [] })
  await design.profileBySite('site-1')
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/profiles/by-site/site-1')
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
})

test('rankReference POSTs stars + contributor', async () => {
  mockOk({ ok: true })
  await design.rankReference('ref-1', { contributor_id: 'c1', stars: 5 })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/references/ref-1/rankings')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body as string)).toEqual({ contributor_id: 'c1', stars: 5 })
})

test('actOnBrief POSTs the action', async () => {
  mockOk({ id: 'b1', state: 'architect_review' })
  await design.actOnBrief('b1', { action: 'send_to_architect' })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/briefs/b1/approval')
  expect(JSON.parse(init.body as string)).toEqual({ action: 'send_to_architect' })
})
