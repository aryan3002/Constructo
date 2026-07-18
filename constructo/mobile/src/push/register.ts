/**
 * Push-notification scaffolding. Requests permission, sets up the Android
 * channel, and fetches the Expo push token. The token is persisted server-side
 * WITHOUT a new migration: it is stashed in the homeowner member's
 * `notif_prefs` jsonb via the existing PATCH endpoint (see HOMEOWNER_H0.md).
 *
 * H3 wires the backend → Expo push delivery; H1 only registers + stores.
 */
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

import { homeowner, request } from '../api/client'

/** Ask for permission, configure the channel, and return the Expo push token. */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null // simulators can't get a push token

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Neev',
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: '#f2a100',
    })
  }

  const existing = await Notifications.getPermissionsAsync()
  let granted = existing.granted
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync()
    granted = req.granted
  }
  if (!granted) return null

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
    return token.data
  } catch {
    return null
  }
}

/**
 * Register THIS device's push token against the caller's user row via
 * `POST /api/v1/me/push-token` (C-F). Works for any authenticated user —
 * crucially the contractor (a plain users row with no homeowner_member, so the
 * notif_prefs path below does not apply). Idempotent + best-effort: re-posting
 * the same token just bumps it server-side; failures are swallowed so a missing
 * token never blocks the session.
 *
 * Fetches the Expo token if not supplied. Returns the token registered (or null).
 */
export async function registerDevicePushToken(
  existingToken?: string | null,
): Promise<string | null> {
  try {
    const token = existingToken ?? (await registerForPushNotificationsAsync())
    if (!token) return null
    await request('/api/v1/me/push-token', {
      method: 'POST',
      body: JSON.stringify({
        token,
        platform:
          Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
      }),
    })
    return token
  } catch {
    return null // best-effort
  }
}

/**
 * Persist the push token into the homeowner's first membership notif_prefs
 * (no migration needed). Best-effort; ignores failures.
 */
export async function persistPushToken(token: string): Promise<void> {
  try {
    const members = await homeowner.members()
    const member = members[0]
    if (!member) return
    await request(`/api/v1/homeowner/members/${member.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        notif_prefs: { ...member.notif_prefs, push_token: token },
      }),
    })
  } catch {
    /* best-effort */
  }
}
