/** T9: opening Capture offline still knows your site. */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { Site } from '../api/types'
import { loadCachedSites, loadCaptureSites, siteCacheKey } from './siteCache'

const sunrise = { id: 's1', name: 'Sunrise Heights' } as Site
const offline = () => Promise.reject(new TypeError('Network request failed'))

beforeEach(async () => {
  await AsyncStorage.clear()
})

test('a good fetch is returned and remembered for that user', async () => {
  expect(await loadCaptureSites('u1', async () => [sunrise])).toEqual({ sites: [sunrise], source: 'server' })
  expect(await loadCachedSites('u1')).toEqual([sunrise])
  expect(await loadCachedSites('u2')).toBeNull()
})

test('offline, the last good list is used', async () => {
  await loadCaptureSites('u1', async () => [sunrise])
  expect(await loadCaptureSites('u1', offline)).toEqual({ sites: [sunrise], source: 'cache' })
})

test("offline with no cache is 'unavailable', not an empty assignment", async () => {
  expect(await loadCaptureSites('u1', offline)).toEqual({ sites: [], source: 'unavailable' })
})

test("another user's cache is never used", async () => {
  await loadCaptureSites('u1', async () => [sunrise])
  expect((await loadCaptureSites('u2', offline)).source).toBe('unavailable')
})

test('a server that really has no sites for you is an empty server list', async () => {
  expect(await loadCaptureSites('u1', async () => [])).toEqual({ sites: [], source: 'server' })
  expect(await AsyncStorage.getItem(siteCacheKey('u1'))).toBe('[]')
})
