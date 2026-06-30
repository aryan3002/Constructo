import { contractor } from './contractor'

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response)

beforeEach(() => jest.restoreAllMocks())

test('publishPhoto POSTs to /api/v1/publish/photo with the body', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockReturnValue(okJson({ id: 'p1' }) as never)
  await contractor.publishPhoto({ site_id: 's1', image_url: 'chat/s1/a.jpg', room_tag: 'kitchen' })
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toContain('/api/v1/publish/photo')
  expect(init?.method).toBe('POST')
  expect(JSON.parse(init?.body as string)).toMatchObject({ site_id: 's1', room_tag: 'kitchen' })
})

test('publishedPhotos GETs with site_id + view query', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockReturnValue(okJson([]) as never)
  await contractor.publishedPhotos('s1', 'room')
  const url = String(fetchMock.mock.calls[0][0])
  expect(url).toContain('site_id=s1')
  expect(url).toContain('view=room')
})

test('editPhoto PATCHes the photo id', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockReturnValue(okJson({ id: 'p9' }) as never)
  await contractor.editPhoto('p9', { is_starred: true })
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toContain('/api/v1/publish/photo/p9')
  expect(init?.method).toBe('PATCH')
})
