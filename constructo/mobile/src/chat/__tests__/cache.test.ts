/** Per-conversation message cache: instant offline open, seq-dedup merge,
 * maxSeq cursor for incremental after_seq sync, capped at 200. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

import AsyncStorage from '@react-native-async-storage/async-storage'

import { loadThreadCache, maxCachedSeq, mergeMessages } from '../cache'

beforeEach(() => AsyncStorage.clear())

const m = (seq: number, body = `m${seq}`) => ({ id: `id-${seq}`, seq, body }) as never

test('merge dedupes by seq and sorts ascending', async () => {
  await mergeMessages('conv-1', [m(2), m(1)])
  await mergeMessages('conv-1', [m(2), m(3)])
  const cached = await loadThreadCache('conv-1')
  expect(cached.map((x: { seq: number }) => x.seq)).toEqual([1, 2, 3])
})

test('maxCachedSeq drives incremental sync', async () => {
  expect(await maxCachedSeq('conv-1')).toBe(0)
  await mergeMessages('conv-1', [m(1), m(2)])
  expect(await maxCachedSeq('conv-1')).toBe(2)
})

test('cache caps at 200 newest messages', async () => {
  await mergeMessages('conv-1', Array.from({ length: 230 }, (_, i) => m(i + 1)))
  const cached = await loadThreadCache('conv-1')
  expect(cached).toHaveLength(200)
  expect(cached[0].seq).toBe(31)
})
