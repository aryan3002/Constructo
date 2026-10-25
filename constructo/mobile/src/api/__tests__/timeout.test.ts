/** Every API call has a deadline (RN's Android client has none): a stalled
 * request rejects with a status-less TimeoutError, which retry classifiers
 * treat as a network failure. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
jest.mock('../../store/secure', () => ({ getToken: async () => null }))

import { classifySendError } from '../../chat/useChatThread'
import { JSON_TIMEOUT_MS, TimeoutError, UPLOAD_TIMEOUT_MS, request, uploadMultipart } from '../client'

const realFetch = global.fetch

function hangingFetch() {
  return jest.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
      }),
  )
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => {
  jest.useRealTimers()
  global.fetch = realFetch
})

test('a JSON request that stalls rejects with TimeoutError after ~15s', async () => {
  global.fetch = hangingFetch() as unknown as typeof fetch
  let done = false
  const p = request('/api/v1/x').catch((e) => {
    done = true
    throw e
  })
  const settled = expect(p).rejects.toBeInstanceOf(TimeoutError)
  await jest.advanceTimersByTimeAsync(JSON_TIMEOUT_MS - 1)
  expect(done).toBe(false)
  await jest.advanceTimersByTimeAsync(1)
  await settled
})

test('uploads get the longer deadline', async () => {
  global.fetch = hangingFetch() as unknown as typeof fetch
  let done = false
  const p = uploadMultipart('/api/v1/up', new FormData()).catch((e) => {
    done = true
    throw e
  })
  const settled = expect(p).rejects.toBeInstanceOf(TimeoutError)
  await jest.advanceTimersByTimeAsync(JSON_TIMEOUT_MS + 1000)
  expect(done).toBe(false)
  await jest.advanceTimersByTimeAsync(UPLOAD_TIMEOUT_MS)
  await settled
})

test('a timeout is retryable for the chat outbox', () => {
  expect(classifySendError(new TimeoutError())).toEqual({ ok: false, permanent: false })
})

test('a response in time clears the timer', async () => {
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })) as unknown as typeof fetch
  await expect(request('/api/v1/x')).resolves.toEqual({ ok: 1 })
  expect(jest.getTimerCount()).toBe(0)
})
