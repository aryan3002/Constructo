/** T3: queued captures are never dropped because a login expired.
 *  T9: one sender — concurrent flushes send each item once, and an enqueue
 *  during a drain is neither lost nor overwritten. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
const mockRequest = jest.fn()
jest.mock('../api/client', () => {
  const actual = jest.requireActual('../api/client')
  return { ...actual, request: (...a: unknown[]) => mockRequest(...a) }
})
const mockSubmit = jest.fn()
jest.mock('../api/capture', () => ({
  ...jest.requireActual('../api/capture'),
  submitCapture: (...a: unknown[]) => mockSubmit(...a),
}))

import { ApiError, TimeoutError } from '../api/client'
import { clear, enqueue, list } from './outbox'
import { __resetOutboxSyncForTests, flushOutbox, isPermanentFailure } from './useOutbox'

test('401, 408 and 429 keep the capture queued', () => {
  for (const status of [401, 408, 429]) expect(isPermanentFailure(new ApiError(status, 'x'))).toBe(false)
})

test('network failures and timeouts keep the capture queued', () => {
  expect(isPermanentFailure(new TypeError('Network request failed'))).toBe(false)
  expect(isPermanentFailure(new TimeoutError())).toBe(false)
  expect(isPermanentFailure(new ApiError(503, 'x'))).toBe(false)
})

test('a real rejection (403/413/422) is permanent', () => {
  for (const status of [403, 413, 422]) expect(isPermanentFailure(new ApiError(status, 'x'))).toBe(true)
})

describe('the one drainer', () => {
  beforeEach(async () => {
    __resetOutboxSyncForTests()
    await clear()
    mockRequest.mockReset()
    mockSubmit.mockReset()
  })

  const capture = (text: string) => ({
    label: text,
    path: '/api/v1/capture',
    method: 'POST' as const,
    capture: { site_id: 's1', text },
  })

  it('concurrent flushes (several screens on reconnect) send each item once', async () => {
    mockSubmit.mockImplementation(() => new Promise((r) => setTimeout(() => r({ raw_message_id: 'r' }), 5)))
    await enqueue(capture('a'))
    await enqueue(capture('b'))
    await enqueue({ label: 'reply', path: '/api/v1/approvals/d1/respond', method: 'POST', body: { action: 'confirm' } })
    mockRequest.mockResolvedValue({})

    const runs = [flushOutbox(), flushOutbox(), flushOutbox(), flushOutbox(), flushOutbox()]
    expect(new Set(runs).size).toBe(1) // later calls join the running drain
    await Promise.all(runs)

    expect(mockSubmit).toHaveBeenCalledTimes(2)
    expect(mockRequest).toHaveBeenCalledTimes(1)
    expect(await list()).toEqual([])
  })

  it('a legacy capture without an id is sent with one, and retried with the same one', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage')
    await AsyncStorage.setItem(
      'constructo.outbox',
      JSON.stringify([{ id: 'ob_old', createdAt: 1, label: 'old', path: '/api/v1/capture', method: 'POST', capture: { site_id: 's1', text: 'x' } }]),
    )
    mockSubmit.mockRejectedValueOnce(new TimeoutError()).mockResolvedValue({ raw_message_id: 'r' })
    await flushOutbox()
    await flushOutbox()
    const ids = mockSubmit.mock.calls.map((c) => (c[0] as { client_capture_id: string }).client_capture_id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toMatch(/^cap_/)
    expect(ids[1]).toBe(ids[0])
  })

  it('an enqueue during a drain is not lost or overwritten', async () => {
    let release!: () => void
    mockSubmit.mockImplementationOnce(
      () => new Promise((r) => { release = () => r({ raw_message_id: 'r1' }) }),
    )
    mockSubmit.mockResolvedValue({ raw_message_id: 'r2' })
    await enqueue(capture('first'))

    const run = flushOutbox()
    await new Promise((r) => setTimeout(r, 0))
    // A screen enqueues while the first send is in flight, then nudges a drain.
    await enqueue(capture('second'))
    const joined = flushOutbox()
    release()
    await Promise.all([run, joined])

    // The drainer's remove of "first" kept "second", and the same drain sent it.
    expect(mockSubmit.mock.calls.map((c) => (c[0] as { text: string }).text)).toEqual(['first', 'second'])
    expect(await list()).toEqual([])
  })

  it('concurrent enqueues all land (locked read-modify-write)', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => enqueue(capture(`c${i}`))))
    expect((await list()).map((i) => i.label).sort()).toEqual(
      Array.from({ length: 10 }, (_, i) => `c${i}`).sort(),
    )
  })

  it('a transient failure keeps the item and the rest queued', async () => {
    mockSubmit.mockRejectedValue(new TimeoutError())
    await enqueue(capture('a'))
    await enqueue(capture('b'))
    await flushOutbox()
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect((await list()).map((i) => i.label)).toEqual(['a', 'b'])
  })
})
