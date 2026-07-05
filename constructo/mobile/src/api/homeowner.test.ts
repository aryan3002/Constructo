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

import { homeowner } from './client'

// Root-cause regression coverage for the broken Design-tab images: a picked
// photo must be uploaded (multipart) to get a real storage key BEFORE that
// key is ever sent as `image_url` — never the raw device URI directly.

test('uploadReferenceImage POSTs multipart form data, not JSON', async () => {
  mockOk({ image_url: 'homeowner/site-1/design/abc123.jpg' })
  const result = await homeowner.uploadReferenceImage({
    uri: 'file:///var/mobile/tmp/photo.jpg',
    name: 'photo.jpg',
    type: 'image/jpeg',
  })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/homeowner/design/references/upload')
  expect(init.method).toBe('POST')
  expect(init.body).toBeInstanceOf(FormData)
  expect((init.headers as Headers).get('Authorization')).toBe('Bearer test-token')
  expect(result.image_url).toBe('homeowner/site-1/design/abc123.jpg')
})

test('references() sends the uploaded key as image_url, never a raw device URI', async () => {
  mockOk({ id: 'ref-1', image_url: 'https://signed/abc123.jpg', room_tag: 'living' })
  await homeowner.references({
    image_url: 'homeowner/site-1/design/abc123.jpg',
    room_tag: 'living',
    source: 'upload',
  })
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
  expect(url).toContain('/api/v1/homeowner/design/references')
  const body = JSON.parse(init.body as string)
  expect(body.image_url).toBe('homeowner/site-1/design/abc123.jpg')
  expect(body.image_url.startsWith('file://')).toBe(false)
})
