/** T1: the chat outbox must never lose or wedge a message. Appends that land
 * while a send is on the wire survive the drain's write-back, a parked item
 * doesn't block the messages after it, and 401/429 are retried, not parked. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  MAX_ATTEMPTS,
  drainChatOutbox,
  enqueueChatSend,
  listChatOutbox,
  removeChatOutbox,
  type ChatOutboxItem,
} from '../outbox'
import { classifySendError } from '../useChatThread'

beforeEach(() => AsyncStorage.clear())

test('a message queued while another is in flight is not lost', async () => {
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'A', clientMsgId: 'A' })
  let releaseA: () => void = () => undefined
  const sent: string[] = []
  const drainP = drainChatOutbox(async (item) => {
    sent.push(item.clientMsgId)
    if (item.clientMsgId === 'A') await new Promise<void>((r) => (releaseA = r))
    return { ok: true, seq: sent.length }
  })
  await new Promise((r) => setTimeout(r, 20))
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'B', clientMsgId: 'B' })
  releaseA()
  await drainP
  await drainChatOutbox(async (item) => {
    sent.push(item.clientMsgId)
    return { ok: true, seq: sent.length }
  })
  expect(sent).toEqual(['A', 'B'])
  expect(await listChatOutbox()).toEqual([])
})

test('a message deleted while in flight is not written back', async () => {
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'A', clientMsgId: 'A' })
  let releaseA: () => void = () => undefined
  const drainP = drainChatOutbox(async () => {
    await new Promise<void>((r) => (releaseA = r))
    return { ok: false, permanent: false }
  })
  await new Promise((r) => setTimeout(r, 20))
  await removeChatOutbox('A')
  releaseA()
  await drainP
  expect(await listChatOutbox()).toEqual([])
})

test('a parked item does not block later items in the same conversation', async () => {
  const parked: ChatOutboxItem = {
    clientMsgId: 'P',
    address: { conversation_id: 'c' },
    body: 'rejected',
    state: 'failed_permanent',
    attempts: 1,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  }
  await AsyncStorage.setItem('constructo.chat.outbox', JSON.stringify([parked]))
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'next', clientMsgId: 'N' })
  const sent: string[] = []
  await drainChatOutbox(async (item) => {
    sent.push(item.clientMsgId)
    return { ok: true, seq: 1 }
  })
  expect(sent).toEqual(['N'])
  const left = await listChatOutbox()
  expect(left.map((i) => [i.clientMsgId, i.state])).toEqual([['P', 'failed_permanent']])
})

test('an item that fails permanently mid-drain lets the rest of its conversation send', async () => {
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'bad', clientMsgId: 'X' })
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'good', clientMsgId: 'Y' })
  const sent: string[] = []
  await drainChatOutbox(async (item) => {
    sent.push(item.clientMsgId)
    return item.clientMsgId === 'X' ? { ok: false, permanent: true } : { ok: true, seq: 1 }
  })
  expect(sent).toEqual(['X', 'Y'])
  expect((await listChatOutbox()).map((i) => i.clientMsgId)).toEqual(['X'])
})

test.each([401, 408, 429])('a %i is retried with backoff, not parked', async (status) => {
  const result = classifySendError(Object.assign(new Error('x'), { status }))
  expect(result).toMatchObject({ ok: false, permanent: false })
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'x', clientMsgId: 'c1' })
  await drainChatOutbox(async () => result)
  const [item] = await listChatOutbox()
  expect(item.state).toBe('queued')
  expect(item.nextAttemptAt).toBeGreaterThan(Date.now())
})

test('a 401 pauses the drain without spending an attempt', async () => {
  await enqueueChatSend({ address: { conversation_id: 'a' }, body: 'x', clientMsgId: 'c1' })
  await enqueueChatSend({ address: { conversation_id: 'b' }, body: 'y', clientMsgId: 'c2' })
  const tried: string[] = []
  await drainChatOutbox(async (item) => {
    tried.push(item.clientMsgId)
    return classifySendError(Object.assign(new Error('expired'), { status: 401 }))
  })
  expect(tried).toEqual(['c1'])
  const items = await listChatOutbox()
  expect(items.map((i) => [i.state, i.attempts])).toEqual([
    ['queued', 0],
    ['queued', 0],
  ])
})

test('other 4xx park the item', () => {
  for (const status of [400, 403, 404, 413, 422]) {
    expect(classifySendError({ status })).toEqual({ ok: false, permanent: true })
  }
  expect(classifySendError(new Error('offline'))).toEqual({ ok: false, permanent: false })
  expect(classifySendError({ status: 503 })).toEqual({ ok: false, permanent: false })
})

test(`temporary failures park after ${MAX_ATTEMPTS} attempts`, async () => {
  await enqueueChatSend({ address: { conversation_id: 'c' }, body: 'x', clientMsgId: 'c1' })
  const raw = JSON.parse((await AsyncStorage.getItem('constructo.chat.outbox')) as string)
  raw[0].attempts = MAX_ATTEMPTS - 1
  await AsyncStorage.setItem('constructo.chat.outbox', JSON.stringify(raw))
  await drainChatOutbox(async () => ({ ok: false, permanent: false }))
  const [item] = await listChatOutbox()
  expect(item.state).toBe('failed_permanent')
})
