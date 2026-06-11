/** The durable-send seam (Task 13b): a send enqueues to the persisted outbox
 * FIRST, then a drain replays it through the real API. A transient failure keeps
 * the item queued (the bubble stays pending); a success removes it so the real
 * server message replaces the pending one. Exercises performSend + the real
 * outbox with a mocked chatApi. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

const mockSend = jest.fn()
jest.mock('../../api/chat', () => ({
  chatApi: {
    send: (...args: unknown[]) => mockSend(...args),
  },
  newClientMsgId: () => 'cid-test',
}))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { drainChatOutbox, enqueueChatSend, listChatOutbox, retryPermanent } from '../outbox'
import { performSend } from '../useChatThread'
import { pendingForThread } from '../threadState'

const address = { siteId: 'site-1' } as const
const drain = () => drainChatOutbox((item) => performSend(item, address))

beforeEach(async () => {
  await AsyncStorage.clear()
  mockSend.mockReset()
})

test('send enqueues durably; a rejecting drain leaves it queued + still pending', async () => {
  await enqueueChatSend({ clientMsgId: 'c1', address: { site_id: 'site-1' }, body: 'namaste' })

  // The bubble is backed by storage immediately, before any network.
  let outbox = await listChatOutbox()
  expect(pendingForThread('site-1', outbox, [])).toHaveLength(1)

  // Network down → the item stays queued (the pending bubble persists).
  mockSend.mockRejectedValueOnce(Object.assign(new Error('offline')))
  await drain()
  outbox = await listChatOutbox()
  expect(outbox).toHaveLength(1)
  expect(outbox[0].state).toBe('queued')
  expect(outbox[0].attempts).toBe(1)
  expect(pendingForThread('site-1', outbox, [])).toHaveLength(1)
})

test('a successful drain sends the message and removes the outbox item', async () => {
  await enqueueChatSend({ clientMsgId: 'c1', address: { site_id: 'site-1' }, body: 'namaste' })
  mockSend.mockResolvedValueOnce({ id: 'srv-1', seq: 7 })

  await drain()

  expect(mockSend).toHaveBeenCalledTimes(1)
  expect(mockSend).toHaveBeenCalledWith(
    expect.objectContaining({ site_id: 'site-1', client_msg_id: 'c1', body: 'namaste', media_type: 'text' }),
  )
  const outbox = await listChatOutbox()
  expect(outbox).toHaveLength(0) // confirmed → the real server message replaces it
  expect(pendingForThread('site-1', outbox, [])).toHaveLength(0)
})

test('a 4xx parks the item as failed_permanent (never silently dropped)', async () => {
  await enqueueChatSend({ clientMsgId: 'c1', address: { site_id: 'site-1' }, body: 'x' })
  mockSend.mockRejectedValueOnce(Object.assign(new Error('bad'), { status: 422 }))

  await drain()

  const [parked] = await listChatOutbox()
  expect(parked.state).toBe('failed_permanent')
})

test('retry un-parks a failed_permanent item and a successful drain clears it', async () => {
  await enqueueChatSend({ address: { site_id: 'site-1' }, body: 'x', clientMsgId: 'c1' })
  await drainChatOutbox(async () => ({ ok: false, permanent: true }))
  expect((await listChatOutbox())[0].state).toBe('failed_permanent')

  await retryPermanent('c1')
  expect((await listChatOutbox())[0].state).toBe('queued')
  await drainChatOutbox(async () => ({ ok: true, seq: 1 }))
  expect(await listChatOutbox()).toHaveLength(0)
})
