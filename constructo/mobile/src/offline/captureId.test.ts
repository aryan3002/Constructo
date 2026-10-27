/** T9: every capture carries one client_capture_id, from the moment it is made
 *  through every retry, so the server can file a repeat once. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
jest.mock('../store/secure', () => ({ getToken: async () => 'jwt' }))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { newClientCaptureId, submitCapture } from '../api/capture'
import { clear, enqueue, ensureCaptureId, list, setOutboxUser } from './outbox'

const realFetch = global.fetch
afterEach(() => {
  global.fetch = realFetch
})

beforeEach(async () => {
  setOutboxUser('u1')
  await clear()
})

test('ids are unique', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newClientCaptureId()))
  expect(ids.size).toBe(200)
})

test('submitCapture sends the id as a form field', async () => {
  const fetchMock = jest.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ raw_message_id: 'r1', status: 'queued' }), { status: 201 }),
  )
  global.fetch = fetchMock as unknown as typeof fetch
  await submitCapture({ site_id: 's1', text: 'slab done', client_capture_id: 'cap_x' })
  const body = fetchMock.mock.calls[0][1].body as FormData
  expect(body.get('client_capture_id')).toBe('cap_x')
  expect(body.get('site_id')).toBe('s1')
})

test('enqueue keeps the id the screen made, and gives one to a capture without', async () => {
  const kept = await enqueue({
    label: 'voice',
    path: '/api/v1/capture',
    method: 'POST',
    capture: { site_id: 's1', client_capture_id: 'cap_screen' },
  })
  const given = await enqueue({ label: 'att', path: '/api/v1/capture', method: 'POST', capture: { site_id: 's1', text: '3' } })
  expect(kept.capture?.client_capture_id).toBe('cap_screen')
  expect(given.capture?.client_capture_id).toMatch(/^cap_/)
  expect((await list()).map((i) => i.capture?.client_capture_id)).toEqual([
    'cap_screen',
    given.capture?.client_capture_id,
  ])
})

test('a legacy queued capture gets an id before its next send, and keeps it', async () => {
  await AsyncStorage.setItem(
    'constructo.outbox.user.u1',
    JSON.stringify([{ id: 'ob_old', createdAt: 1, label: 'old', path: '/api/v1/capture', method: 'POST', capture: { site_id: 's1', text: 'x' } }]),
  )
  const [legacy] = await list()
  const first = await ensureCaptureId(legacy)
  const again = await ensureCaptureId((await list())[0])
  expect(first.capture?.client_capture_id).toMatch(/^cap_/)
  expect(again.capture?.client_capture_id).toBe(first.capture?.client_capture_id)
  // Plain JSON items are left alone.
  const reply = { id: 'r', createdAt: 1, label: 'r', path: '/x', method: 'POST' as const }
  expect(await ensureCaptureId(reply)).toBe(reply)
})
