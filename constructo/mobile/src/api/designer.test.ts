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

import { specsApi } from './specs'
import { siteChangesApi } from './siteChanges'

test('specsApi.list GETs specs scoped by site with auth', async () => {
  mockOk([])
  await specsApi.list('site-1')
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/specs?site_id=site-1')
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
})

test('specsApi.approve POSTs the approve action with status', async () => {
  mockOk({ id: 'sp1', approval_status: 'approved' })
  await specsApi.approve('sp1', { status: 'approved' })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/specs/sp1/approve')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body as string)).toEqual({ status: 'approved' })
})

test('specsApi.route + release POST the routing actions', async () => {
  mockOk({ id: 'sp1', routing_status: 'out_for_approval' })
  await specsApi.route('sp1')
  let [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/specs/sp1/route')
  expect(init.method).toBe('POST')

  mockOk({ id: 'sp1', routing_status: 'released' })
  await specsApi.release('sp1')
  ;[url, init] = mockFetch.mock.calls[1] as [string, RequestInit]
  expect(url).toContain('/api/v1/specs/sp1/release')
  expect(init.method).toBe('POST')
})

test('siteChangesApi.list filters by status', async () => {
  mockOk([])
  await siteChangesApi.list({ status: 'new' })
  const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/site-changes?status=new')
})

test('siteChangesApi.update PATCHes status (link / resolve)', async () => {
  mockOk({ id: 'c1', status: 'resolved' })
  await siteChangesApi.update('c1', { status: 'resolved' })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/site-changes/c1')
  expect(init.method).toBe('PATCH')
  expect(JSON.parse(init.body as string)).toEqual({ status: 'resolved' })
})
