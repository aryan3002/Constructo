/** T3: queued captures are never dropped because a login expired. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
import { ApiError, TimeoutError } from '../api/client'
import { isPermanentFailure } from './useOutbox'

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
