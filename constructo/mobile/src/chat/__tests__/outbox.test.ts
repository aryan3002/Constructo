/** Durable chat outbox: enqueue survives restarts (AsyncStorage), drain sends
 * FIFO per conversation, retry/backoff states, permanent failures park. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  drainChatOutbox,
  enqueueChatSend,
  listChatOutbox,
  nextAttemptDelayMs,
  type ChatOutboxItem,
} from '../outbox'

beforeEach(() => AsyncStorage.clear())

const addr = { site_id: 'site-1' }

test('enqueue persists to storage and survives a "restart"', async () => {
  await enqueueChatSend({ address: addr, body: 'namaste', clientMsgId: 'c1' })
  const items = await listChatOutbox() // fresh read from AsyncStorage = post-restart
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ state: 'queued', clientMsgId: 'c1', body: 'namaste' })
})

test('drain sends FIFO and removes sent items', async () => {
  await enqueueChatSend({ address: addr, body: 'first', clientMsgId: 'c1' })
  await enqueueChatSend({ address: addr, body: 'second', clientMsgId: 'c2' })
  const sent: string[] = []
  await drainChatOutbox(async (item) => {
    sent.push(item.clientMsgId)
    return { ok: true, seq: sent.length }
  })
  expect(sent).toEqual(['c1', 'c2'])
  expect(await listChatOutbox()).toHaveLength(0)
})

test('network failure keeps item queued with attempt count + backoff', async () => {
  await enqueueChatSend({ address: addr, body: 'x', clientMsgId: 'c1' })
  await drainChatOutbox(async () => ({ ok: false, permanent: false }))
  const [item] = await listChatOutbox()
  expect(item.state).toBe('queued')
  expect(item.attempts).toBe(1)
  expect(item.nextAttemptAt).toBeGreaterThan(Date.now())
})

test('4xx parks the item as failed_permanent (never silently dropped)', async () => {
  await enqueueChatSend({ address: addr, body: 'x', clientMsgId: 'c1' })
  await drainChatOutbox(async () => ({ ok: false, permanent: true }))
  const [item] = await listChatOutbox()
  expect(item.state).toBe('failed_permanent')
})

test('backoff is exponential with a 5-minute cap', () => {
  expect(nextAttemptDelayMs(1)).toBeGreaterThanOrEqual(1000)
  expect(nextAttemptDelayMs(10)).toBeLessThanOrEqual(5 * 60_000 + 1000)
})
