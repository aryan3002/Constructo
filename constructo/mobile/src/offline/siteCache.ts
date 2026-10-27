/**
 * The capture screen's site list, cached per user (T9), so opening Capture
 * offline still knows the supervisor's site instead of saying "No site
 * assigned". Sign-out clears it with the other per-user keys (resetSession).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

import type { Site } from '../api/types'

export const SITE_CACHE_PREFIX = 'constructo.capture.sites.'

export function siteCacheKey(userId: string): string {
  return `${SITE_CACHE_PREFIX}${userId}`
}

export async function loadCachedSites(userId: string): Promise<Site[] | null> {
  try {
    const raw = await AsyncStorage.getItem(siteCacheKey(userId))
    return raw ? (JSON.parse(raw) as Site[]) : null
  } catch {
    return null
  }
}

export async function saveCachedSites(userId: string, sites: Site[]): Promise<void> {
  try {
    await AsyncStorage.setItem(siteCacheKey(userId), JSON.stringify(sites))
  } catch {
    /* best-effort */
  }
}

/** Where the list came from: the server, the cache (offline / fetch failed),
 *  or nowhere (offline with no cache: "your sites will load when you're
 *  back online", never "no site assigned"). */
export type SiteSource = 'server' | 'cache' | 'unavailable'

export interface SiteLoad {
  sites: Site[]
  source: SiteSource
}

/** Fetch the sites; on success remember them, on failure fall back to the last
 *  good list for this user. */
export async function loadCaptureSites(
  userId: string | null,
  fetchSites: () => Promise<Site[]>,
): Promise<SiteLoad> {
  try {
    const sites = await fetchSites()
    if (userId) await saveCachedSites(userId, sites)
    return { sites, source: 'server' }
  } catch {
    const cached = userId ? await loadCachedSites(userId) : null
    return cached ? { sites: cached, source: 'cache' } : { sites: [], source: 'unavailable' }
  }
}
