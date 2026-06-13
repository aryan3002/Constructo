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

import { drawingsApi, withSupersession, type Drawing } from './drawings'
import { audit } from './ownerAudit'

// ---- drawings -------------------------------------------------------------

test('drawingsApi.list GETs the publish/drawings path scoped by site', async () => {
  mockOk([])
  await drawingsApi.list('site-1')
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/publish/drawings?site_id=site-1')
  expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
})

test('withSupersession derives latest + superseded from the chain', () => {
  const rows: Drawing[] = [
    {
      id: 'c', site_id: 's', title: 'Kitchen layout', version: 'C', file_url: 'x',
      kind: 'plan', published_by: null, published_at: '2026-06-10T00:00:00Z',
      plain_summary_en: null, plain_summary_hi: null, change_note: null, supersedes_id: 'b',
    },
    {
      id: 'b', site_id: 's', title: 'Kitchen layout', version: 'B', file_url: 'x',
      kind: 'plan', published_by: null, published_at: '2026-06-02T00:00:00Z',
      plain_summary_en: null, plain_summary_hi: null, change_note: null, supersedes_id: null,
    },
  ]
  const out = withSupersession(rows)
  const c = out.find((d) => d.id === 'c')!
  const b = out.find((d) => d.id === 'b')!
  expect(c.superseded).toBe(false)
  expect(b.superseded).toBe(true)
  // Both rows resolve their "latest" to revision C.
  expect(c.latest.id).toBe('c')
  expect(b.latest.id).toBe('c')
})

// ---- audit conduct (engineer) ---------------------------------------------

test('audit.upsertSection POSTs the marked checklist', async () => {
  mockOk({ id: 'sec1', name: 'Flooring', items: [] })
  await audit.upsertSection('aud-1', {
    name: 'Flooring',
    items: [{ label: 'Tile lippage within 1mm', status: 'ok' }],
  })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/audits/aud-1/sections')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body as string)).toEqual({
    name: 'Flooring',
    items: [{ label: 'Tile lippage within 1mm', status: 'ok' }],
  })
})

test('audit.addFinding POSTs a defect with severity', async () => {
  mockOk({ id: 'f1' })
  await audit.addFinding('aud-1', { title: 'No honeycombing', severity: 'major', location: 'Civil work' })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/audits/aud-1/findings')
  expect(init.method).toBe('POST')
  expect(JSON.parse(init.body as string).severity).toBe('major')
})

test('audit.score POSTs the finalize path', async () => {
  mockOk({ id: 'aud-1', status: 'completed', score: 88, sections: [], findings: [] })
  await audit.score('aud-1')
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/audits/aud-1/score')
  expect(init.method).toBe('POST')
})
