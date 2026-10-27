/** T9: an item the server refuses for good goes to the user's "Couldn't send"
 *  list with the reason; Retry puts it back in the queue, Delete removes it. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
const mockSubmit = jest.fn()
jest.mock('../api/capture', () => ({
  ...jest.requireActual('../api/capture'),
  submitCapture: (...a: unknown[]) => mockSubmit(...a),
}))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { ApiError } from '../api/client'
import { refusalText } from '../api/errorText'
import { clearOutboxFor, deleteFailed, enqueue, listFailed, listFor, retryFailed } from './outbox'
import {
  __resetOutboxSyncForTests,
  activateOutboxFor,
  flushOutbox,
  outboxSnapshot,
  refreshOutbox,
} from './useOutbox'

const capture = (text: string) => ({
  label: text,
  path: '/api/v1/capture',
  method: 'POST' as const,
  capture: { site_id: 's1', text },
})

beforeEach(async () => {
  __resetOutboxSyncForTests()
  await AsyncStorage.clear()
  mockSubmit.mockReset()
  activateOutboxFor('u1')
  await flushOutbox()
})

test('a permanent refusal moves the item to "Couldn\'t send" and the rest still go', async () => {
  mockSubmit
    .mockRejectedValueOnce(new ApiError(403, 'You are not assigned to this site', 'forbidden'))
    .mockResolvedValue({ raw_message_id: 'r' })
  await enqueue(capture('wrong site'))
  await enqueue(capture('good'))
  await flushOutbox()

  expect(mockSubmit).toHaveBeenCalledTimes(2)
  expect(await listFor('u1')).toEqual([])
  const failed = await listFailed()
  expect(failed).toHaveLength(1)
  expect(failed[0]).toMatchObject({ status: 403, code: 'forbidden', item: { label: 'wrong site' } })
  expect(refusalText(failed[0].status, failed[0].code, 'en')).toBe("You don't have permission to do this. (403)")
  expect(refusalText(413, 'media_too_large', 'hi')).toBe('यह फ़ाइल भेजने के लिए बहुत बड़ी है। (413)')
})

test('Retry puts it back in the queue and it sends', async () => {
  mockSubmit.mockRejectedValueOnce(new ApiError(422, 'bad', 'invalid_fields'))
  const item = await enqueue(capture('fix me'))
  await flushOutbox()
  expect(await listFailed()).toHaveLength(1)

  mockSubmit.mockResolvedValue({ raw_message_id: 'r' })
  await retryFailed(item.id)
  expect(await listFailed()).toEqual([])
  expect((await listFor('u1')).map((i) => i.id)).toEqual([item.id])
  await flushOutbox()
  expect(await listFor('u1')).toEqual([])
  // The retry repeats the capture's id, so a refusal that did land isn't doubled.
  const ids = mockSubmit.mock.calls.map((c) => (c[0] as { client_capture_id: string }).client_capture_id)
  expect(ids[1]).toBe(ids[0])
})

test('Delete removes it for good', async () => {
  mockSubmit.mockRejectedValue(new ApiError(413, 'too big', 'media_too_large'))
  const item = await enqueue(capture('huge'))
  await flushOutbox()
  await deleteFailed(item.id)
  expect(await listFailed()).toEqual([])
  expect(await listFor('u1')).toEqual([])
})

test('the sync status counts them, per user; account deletion clears them', async () => {
  mockSubmit.mockRejectedValue(new ApiError(403, 'x', 'forbidden'))
  await enqueue(capture('a'))
  await flushOutbox()
  await refreshOutbox()
  expect(outboxSnapshot()).toMatchObject({ pending: 0, failed: 1 })
  expect(await listFailed('u1')).toHaveLength(1)
  expect(await listFailed('u2')).toEqual([])
  await clearOutboxFor('u1')
  expect(await listFailed('u1')).toEqual([])
})
