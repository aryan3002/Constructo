/**
 * One place that forgets the signed-in person on this phone (T2). Site phones
 * are shared, so sign-out, account deletion, an expired login and a switch to
 * a different account all run through here: the next person must not see the
 * last one's cached screens or chats, receive their pushes, or have their unsent
 * messages posted under the new login.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { QueryClient } from '@tanstack/react-query'

import { clearThreadCaches } from '../chat/cache'
import { clearChatOutbox } from '../chat/outbox'
import { closeSharedSocket } from '../chat/useChatThread'
import { clear as clearOfflineOutbox } from '../offline/outbox'
import { unregisterDevicePushToken } from '../push/register'
import { clearToken, getToken } from '../store/secure'

/** The user the stored session (and any queued items) belongs to. */
export const SESSION_USER_KEY = 'constructo.session.user'

/** Per-user keys removed outright. */
export const USER_KEYS = [
  'constructo.onboarded',
  'constructo.site_id',
  'constructo.sub_role',
  'constructo.photoPolicy',
  'homeowner.photos.pinned.v1',
  'homeowner.photos.hidden.v1',
]

/** Per-user key families (one key per conversation / site). */
export const USER_KEY_PREFIXES = ['constructo.chat.cache.', 'constructo.ask.session.']

/** Remove the queued-but-unsent work: chat outbox + offline capture outbox. */
export async function clearQueuedWork(): Promise<void> {
  await Promise.all([clearChatOutbox(), clearOfflineOutbox()])
}

export async function resetSession(opts: {
  queryClient: QueryClient
  /** An expired login (401) keeps the unsent chat messages and captures so
   *  the same person can sign back in and have them send. They are dropped at
   *  the next sign-in if a DIFFERENT user signs in (see AuthContext). */
  keepQueued?: boolean
}): Promise<void> {
  // Unregister push with the JWT captured now — the token is cleared below, so
  // the request must not wait on it (and an offline sign-out must not hang).
  const authToken = await getToken()
  void unregisterDevicePushToken(opts.keepQueued ? null : authToken)
  await clearToken()
  closeSharedSocket()
  await opts.queryClient.cancelQueries()
  opts.queryClient.clear()
  try {
    await clearThreadCaches()
    const keys = await AsyncStorage.getAllKeys()
    const prefixed = keys.filter((k) => USER_KEY_PREFIXES.some((p) => k.startsWith(p)))
    await AsyncStorage.multiRemove([
      ...USER_KEYS,
      ...prefixed,
      ...(opts.keepQueued ? [] : [SESSION_USER_KEY]),
    ])
    if (!opts.keepQueued) await clearQueuedWork()
  } catch {
    /* storage is best-effort — the token is already gone */
  }
}
