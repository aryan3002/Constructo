/** Pure thread-state helpers (Task 13b): the durable-outbox → pending-bubble
 * merge, and per-message delivery ticks from the member cursor set. Tested in
 * isolation (no React render) — the load-bearing, brittle-free core. */
import {
  computeDeliveryState,
  deliveryStateMap,
  outboxConvKey,
  pendingForThread,
  syncOrCache,
} from '../threadState'
import type { ChatOutboxItem } from '../outbox'
import type { ChatMessage, CursorOut } from '../../api/chat'

const item = (over: Partial<ChatOutboxItem> = {}): ChatOutboxItem => ({
  clientMsgId: 'c1',
  address: { site_id: 'site-1' },
  body: 'namaste',
  state: 'queued',
  attempts: 0,
  nextAttemptAt: 0,
  createdAt: 1,
  ...over,
})

const msg = (over: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: `id-${over.seq ?? 1}`,
    conversation_id: 'conv',
    sender_id: 'me',
    sender_side: 'contractor',
    seq: 1,
    body: 'x',
    reply_to_id: null,
    media_type: 'text',
    created_at: '2026-06-10T00:00:00Z',
    attachment_url: null,
    events: [],
    ...over,
  }) as ChatMessage

describe('outboxConvKey', () => {
  test('prefers conversation_id, falls back to site_id', () => {
    expect(outboxConvKey({ conversation_id: 'conv-9' })).toBe('conv-9')
    expect(outboxConvKey({ site_id: 'site-5' })).toBe('site-5')
    expect(outboxConvKey({})).toBe('')
  })
})

describe('pendingForThread', () => {
  test('returns only this thread\'s outbox items, oldest-first', () => {
    const outbox = [
      item({ clientMsgId: 'c2', createdAt: 2 }),
      item({ clientMsgId: 'c1', createdAt: 1 }),
      item({ clientMsgId: 'other', address: { site_id: 'site-2' }, createdAt: 3 }),
    ]
    const pending = pendingForThread('site-1', outbox, [])
    expect(pending.map((p) => p.clientMsgId)).toEqual(['c1', 'c2'])
  })

  test('renders failed_permanent state through so the UI can offer retry', () => {
    const pending = pendingForThread('site-1', [item({ state: 'failed_permanent' })], [])
    expect(pending[0].state).toBe('failed_permanent')
  })

  test('a media item with no body has empty text + captured flag + its local uri', () => {
    const pending = pendingForThread(
      'site-1',
      [item({ body: undefined, media: { kind: 'image', localUri: 'file://p.jpg' } })],
      [],
    )
    expect(pending[0].body).toBe('')
    expect(pending[0].captured).toBe(true)
    expect(pending[0].mediaUri).toBe('file://p.jpg')
  })
})

describe('computeDeliveryState', () => {
  const cursors: CursorOut[] = [
    { user_id: 'me', last_delivered_seq: 10, last_read_seq: 10 },
    { user_id: 'bob', last_delivered_seq: 5, last_read_seq: 3 },
  ]

  test("own message with seq <= min(other delivered) reports 'delivered'", () => {
    expect(computeDeliveryState(5, cursors, 'me')).toBe('delivered')
    expect(computeDeliveryState(4, cursors, 'me')).toBe('delivered')
  })

  test("seq <= min(other read) reports 'read'", () => {
    expect(computeDeliveryState(3, cursors, 'me')).toBe('read')
  })

  test("seq beyond every other delivered cursor stays 'sent'", () => {
    expect(computeDeliveryState(6, cursors, 'me')).toBe('sent')
  })

  test('a solo thread (no other members) stays sent', () => {
    expect(
      computeDeliveryState(1, [{ user_id: 'me', last_delivered_seq: 9, last_read_seq: 9 }], 'me'),
    ).toBe('sent')
  })

  test('takes the MIN across multiple other members (slowest wins)', () => {
    const three: CursorOut[] = [
      { user_id: 'me', last_delivered_seq: 10, last_read_seq: 10 },
      { user_id: 'bob', last_delivered_seq: 8, last_read_seq: 8 },
      { user_id: 'cara', last_delivered_seq: 4, last_read_seq: 4 },
    ]
    // seq 6 is delivered to bob (8) but NOT cara (4) → not delivered to all.
    expect(computeDeliveryState(6, three, 'me')).toBe('sent')
    expect(computeDeliveryState(4, three, 'me')).toBe('read')
  })
})

describe('deliveryStateMap', () => {
  test('only the caller\'s own messages get a tick', () => {
    const cursors: CursorOut[] = [
      { user_id: 'me', last_delivered_seq: 10, last_read_seq: 0 },
      { user_id: 'bob', last_delivered_seq: 9, last_read_seq: 0 },
    ]
    const map = deliveryStateMap(
      [
        msg({ seq: 2, sender_id: 'me' }),
        msg({ seq: 3, sender_id: 'bob' }), // someone else's — no tick
      ],
      cursors,
      'me',
    )
    expect(map.get(2)).toBe('delivered')
    expect(map.has(3)).toBe(false)
  })
})

describe('syncOrCache (offline-first thread load)', () => {
  const m = (seq: number): ChatMessage => ({ id: `id-${seq}`, seq } as ChatMessage)

  test('returns the fetched page when the network succeeds', async () => {
    const got = await syncOrCache(
      async () => [m(1), m(2)],
      async () => [m(99)], // cache must NOT be used on success
    )
    expect(got.map((x) => x.seq)).toEqual([1, 2])
  })

  test('falls back to the cache when the fetch fails but cache exists', async () => {
    const got = await syncOrCache(
      async () => {
        throw new Error('offline')
      },
      async () => [m(1), m(2)],
    )
    expect(got.map((x) => x.seq)).toEqual([1, 2]) // no throw → no error state → thread stays
  })

  test('re-throws when the fetch fails and there is no cache', async () => {
    await expect(
      syncOrCache(
        async () => {
          throw new Error('offline')
        },
        async () => [],
      ),
    ).rejects.toThrow('offline')
  })
})
