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

// Contract wrappers for the design-loop program (Task 11): self-serve profile
// creation, brief generation, and reference-extraction retry. These are
// mock-fetch URL-shape tests only — they must never hit a real server.

test('selfServeProfile() POSTs to /api/v1/design/profiles/self-serve with site_id body', async () => {
  mockOk({ id: 'profile-1', company_id: 'co-1', site_id: 'site-1', scope_type: 'whole_house', status: 'intake_started', created_at: '2026-07-05T00:00:00Z', my_contributor_id: null, areas: [], contributors: [] })
  await design.selfServeProfile('site-1')
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/profiles/self-serve')
  expect(init.method).toBe('POST')
  const body = JSON.parse(init.body as string)
  expect(body.site_id).toBe('site-1')
})

test('selfServeProfile() omits site_id when not provided', async () => {
  mockOk({ id: 'profile-1', company_id: 'co-1', site_id: 'site-1', scope_type: 'whole_house', status: 'intake_started', created_at: '2026-07-05T00:00:00Z', my_contributor_id: null, areas: [], contributors: [] })
  await design.selfServeProfile()
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/profiles/self-serve')
  expect(init.method).toBe('POST')
  const body = JSON.parse(init.body as string)
  expect(body.site_id).toBeUndefined()
})

test('generateBrief() POSTs to /api/v1/design/profiles/{profileId}/brief with no body', async () => {
  mockOk({ id: 'brief-1', version: 2, state: 'homeowner_review' })
  await design.generateBrief('profile-1')
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/profiles/profile-1/brief')
  expect(init.method).toBe('POST')
  expect(init.body).toBeUndefined()
})

test('retryExtraction() POSTs to /api/v1/design/references/{referenceId}/extract with no body', async () => {
  mockOk({ id: 'ref-1', area_id: 'area-1', source_type: 'upload', image_r2_key: 'k', source_url: null, preset_id: null, image_url: 'https://signed/k', consistency_status: null, created_at: '2026-07-05T00:00:00Z', extraction_status: 'ok' })
  const result = await design.retryExtraction('ref-1')
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/design/references/ref-1/extract')
  expect(init.method).toBe('POST')
  expect(init.body).toBeUndefined()
  expect(result.extraction_status).toBe('ok')
})
