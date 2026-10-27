/** T9: a capture queue per person. Sign-out keeps it, nothing is ever sent
 *  under another user's login, and the same person signing back in sends it. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
const mockSubmit = jest.fn()
jest.mock('../api/capture', () => ({
  ...jest.requireActual('../api/capture'),
  submitCapture: (...a: unknown[]) => mockSubmit(...a),
}))
jest.mock('../store/secure', () => ({ getToken: async () => 'jwt', clearToken: async () => undefined }))
jest.mock('../push/register', () => ({ unregisterDevicePushToken: async () => undefined }))
jest.mock('../api/auth', () => ({ authApi: { logout: async () => undefined } }))
jest.mock('../chat/useChatThread', () => ({ closeSharedSocket: () => undefined }))

import AsyncStorage from '@react-native-async-storage/async-storage'
import { QueryClient } from '@tanstack/react-query'

import { TimeoutError } from '../api/client'
import { resetSession } from '../auth/resetSession'
import {
  LEGACY_OUTBOX_KEY,
  clearOutboxFor,
  enqueue,
  list,
  listFor,
  migrateLegacyOutbox,
} from './outbox'
import { __resetOutboxSyncForTests, activateOutboxFor, flushOutbox } from './useOutbox'

const capture = (text: string) => ({
  label: text,
  path: '/api/v1/capture',
  method: 'POST' as const,
  capture: { site_id: 's1', text },
})

const sentTexts = () => mockSubmit.mock.calls.map((c) => (c[0] as { text: string }).text)

beforeEach(async () => {
  __resetOutboxSyncForTests()
  await AsyncStorage.clear()
  mockSubmit.mockReset()
})

test("A's unsent captures survive A signing out; B never sends them; A back in sends them", async () => {
  // A queues two captures while the network is down.
  mockSubmit.mockRejectedValue(new TimeoutError())
  activateOutboxFor('userA')
  await enqueue(capture('a1'))
  await enqueue(capture('a2'))
  await flushOutbox()
  expect(await listFor('userA')).toHaveLength(2)

  // A signs out: the queue is kept, and nothing reads it.
  await resetSession({ queryClient: new QueryClient() })
  expect(await listFor('userA')).toHaveLength(2)
  expect(await list()).toEqual([])

  // B signs in on the same phone, with a working network.
  mockSubmit.mockReset()
  mockSubmit.mockResolvedValue({ raw_message_id: 'r' })
  activateOutboxFor('userB')
  await enqueue(capture('b1'))
  await flushOutbox()
  expect(sentTexts()).toEqual(['b1'])
  expect(await list()).toEqual([])
  expect(await listFor('userA')).toHaveLength(2)

  // A signs back in: A's captures go out.
  mockSubmit.mockClear()
  activateOutboxFor('userA')
  await flushOutbox()
  expect(sentTexts()).toEqual(['a1', 'a2'])
  expect(await listFor('userA')).toEqual([])
})

test('nothing drains when no one is signed in', async () => {
  await AsyncStorage.setItem(LEGACY_OUTBOX_KEY, JSON.stringify([{ id: 'x', createdAt: 1, ...capture('x') }]))
  await flushOutbox()
  expect(mockSubmit).not.toHaveBeenCalled()
})

test('a sign-out mid-drain stops the drain before the next item', async () => {
  let release!: () => void
  mockSubmit.mockImplementationOnce(() => new Promise((r) => { release = () => r({ raw_message_id: 'r' }) }))
  mockSubmit.mockResolvedValue({ raw_message_id: 'r' })
  activateOutboxFor('userA')
  await enqueue(capture('a1'))
  await enqueue(capture('a2'))
  const run = flushOutbox()
  await new Promise((r) => setTimeout(r, 0))
  activateOutboxFor(null)
  release()
  await run
  expect(sentTexts()).toEqual(['a1'])
  expect((await listFor('userA')).map((i) => i.label)).toEqual(['a2'])
})

test('legacy migration: the old global queue moves into the user, once', async () => {
  await AsyncStorage.setItem(
    LEGACY_OUTBOX_KEY,
    JSON.stringify([{ id: 'ob_1', createdAt: 1, ...capture('old') }]),
  )
  mockSubmit.mockRejectedValue(new TimeoutError()) // keep everything queued
  activateOutboxFor('userA')
  await enqueue(capture('new'))
  await migrateLegacyOutbox('userA')
  await migrateLegacyOutbox('userA')
  expect((await listFor('userA')).map((i) => i.label)).toEqual(['new', 'old'])
  expect(await AsyncStorage.getItem(LEGACY_OUTBOX_KEY)).toBeNull()
})

test('account deletion removes that user\'s queue only', async () => {
  mockSubmit.mockRejectedValue(new TimeoutError())
  activateOutboxFor('userA')
  await enqueue(capture('a1'))
  activateOutboxFor('userB')
  await enqueue(capture('b1'))
  await clearOutboxFor('userA')
  expect(await listFor('userA')).toEqual([])
  expect(await listFor('userB')).toHaveLength(1)
})
