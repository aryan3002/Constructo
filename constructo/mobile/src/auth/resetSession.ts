/**
 * One place that forgets the signed-in person on this phone (T2). Site phones
 * are shared, so sign-out, account deletion, an expired login and a switch to
 * a different account all run through here: the next person must not see the
 * last one's cached screens or chats, receive their pushes, or have their unsent
 * messages posted under the new login.
 *
 * Unsent site captures are kept, in the person's own queue (T9): nothing is
 * read or sent from it until that same person signs back in.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { QueryClient } from '@tanstack/react-query'

import { authApi } from '../api/auth'
import { clearThreadCaches } from '../chat/cache'
import { clearChatOutbox } from '../chat/outbox'
import { closeSharedSocket } from '../chat/useChatThread'
import { activateOutboxFor } from '../offline/useOutbox'
import { flushPending } from '../owner/pendingDecisions'
import { unregisterDevicePushToken } from '../push/register'
import { clearToken, getToken } from '../store/secure'

/** The user the stored session (and any queued items) belongs to. */
export const SESSION_USER_KEY = 'constructo.session.user'
/** The last /auth/me profile — lets an offline cold start keep the session. */
export const SESSION_ME_KEY = 'constructo.session.me'

/** Per-user keys removed outright. */
export const USER_KEYS = [
  SESSION_ME_KEY,
  'constructo.onboarded',
  'constructo.site_id',
  'constructo.sub_role',
  'constructo.photoPolicy',
  'homeowner.photos.pinned.v1',
  'homeowner.photos.hidden.v1',
]

/** Per-user key families (one key per conversation / site). */
export const USER_KEY_PREFIXES = ['constructo.chat.cache.', 'constructo.ask.session.']

/** Remove the queued-but-unsent chat messages. (Captures live in a per-user
 *  queue and are never removed by sign-out; see src/offline/outbox.) */
export async function clearQueuedWork(): Promise<void> {
  await clearChatOutbox()
}

export async function resetSession(opts: {
  queryClient: QueryClient
  /** An expired login (401) keeps the unsent chat messages so the same person
   *  can sign back in and have them send. They are dropped at the next sign-in
   *  if a DIFFERENT user signs in (see AuthContext). Captures are always kept
   *  in the person's own queue. */
  keepQueued?: boolean
}): Promise<void> {
  // Unregister push, then end the login on the server, with the JWT captured
  // now — the token is cleared below, so neither request may wait on it (and an
  // offline sign-out must not hang). Logout goes second: the unregister needs
  // the token still valid. An expired login (keepQueued) has nothing to end.
  // A money decision still in its undo window is sent while the login is
  // still valid (logout below revokes it on the server).
  await flushPending().catch(() => undefined)
  // Stop reading or sending the capture queue: it stays, keyed to this person.
  activateOutboxFor(null)
  const authToken = await getToken()
  const serverToken = opts.keepQueued ? null : authToken
  void (async () => {
    await unregisterDevicePushToken(serverToken)
    if (serverToken) await authApi.logout(serverToken)
  })()
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
