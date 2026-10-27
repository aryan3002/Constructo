/**
 * Root layout: global providers + font gate. Theme is applied per route GROUP
 * (homeowner → Daylight, contractor → Neev) so the surface matches the
 * role; here we only set up Query, i18n, auth, safe-area, and load fonts.
 */
import { useEffect, useMemo, useRef } from 'react'
import { AppState, Platform, View } from 'react-native'
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
  focusManager,
  useQueryClient,
} from '@tanstack/react-query'
import { Stack, usePathname, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'

import { AuthProvider, useAuth } from '../src/auth/AuthContext'
import { chatApi } from '../src/api/chat'
import { reportMutationError } from '../src/api/mutationErrors'
import { drainChatOutboxOnLaunch } from '../src/chat/useChatThread'
import { flushPending } from '../src/owner/pendingDecisions'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { chatPushRoute } from '../src/push/chat_route.util'
import { designPushRoute } from '../src/push/design_route.util'
import { useAppFonts } from '../src/theme/fonts'

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts()
  // A failed mutation with no error handling of its own shows an error toast
  // (through the mounted ToastProvider) instead of failing silently.
  const client = useMemo(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (err, _vars, _ctx, mutation) => reportMutationError(err, mutation.options),
        }),
      }),
    [],
  )

  // React Query refetches stale queries when the app returns to the foreground
  // (the RN equivalent of refetchOnWindowFocus). Keeps daily screens fresh.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active')
      // A money decision waiting out its undo window goes now: the app may
      // not get another chance to send it.
      if (status !== 'active') void flushPending()
    })
    return () => sub.remove()
  }, [])

  // Hold on a warm canvas until fonts are ready (avoid a flash of system font).
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: '#fbfaf7' }} />
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <I18nProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <ChatPushDeepLink />
            <ChatPushForeground />
            <ChatOutboxLaunchDrain />
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

/**
 * Push deep-link: tapping a notification opens the right place.
 *   - chat (`{conversation_id}` — see backend `_push_offline_members`) → the thread
 *   - homeowner content (`{type: photo|request|update|weekly_summary}` — see
 *     `app.push.sender` callers) → the matching tab/screen
 * Routes by role (each role to its own screens — see chatPushRoute). Best-
 * effort: a malformed/unknown payload is ignored. Mounted inside AuthProvider
 * so `role` + router are ready.
 */
/**
 * Messages queued in a prior session (composed in a dead zone, app killed) send
 * on the NEXT LAUNCH — not only when the user happens to re-open a chat screen.
 * Auth-gated: an unauthenticated drain would just 401 every item into backoff.
 */
function ChatOutboxLaunchDrain() {
  const { me } = useAuth()
  const authed = !!me
  useEffect(() => {
    if (!authed) return
    void drainChatOutboxOnLaunch().catch(() => undefined)
  }, [authed])
  return null
}

/**
 * Foreground push receipts. `addNotificationReceivedListener` fires while the
 * app is OPEN (any screen). For a chat push we (a) advance the DELIVERED cursor
 * so the sender's ✓✓ isn't hours late even when this thread screen isn't
 * mounted, and (b) bump the inbox so an unopened thread's row/unread updates
 * without waiting for the 15s poll. Best-effort: malformed payloads are ignored.
 * (Backgrounded/killed delivery needs a registered background task — out of
 * scope here; this closes the "app open on another screen" case.)
 */
function ChatPushForeground() {
  const qc = useQueryClient()

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      const data = notif.request.content.data as
        | { conversation_id?: string; seq?: number }
        | undefined
      const convId = data?.conversation_id
      if (!convId) return

      if (typeof data?.seq === 'number') {
        void chatApi
          .delivered({ conversationId: convId, lastSeq: data.seq })
          .catch(() => undefined)
      }
      void qc.invalidateQueries({ queryKey: ['homeowner', 'conversations'] })
      void qc.invalidateQueries({ queryKey: ['owner', 'conversations'] })
    })
    return () => sub.remove()
  }, [qc])

  return null
}

// expo-notifications has no notification responses on web (the native method
// throws there), so the web build gets a no-op. Picked once at module load, so
// the hook order is stable.
const useLastNotificationResponse =
  Platform.OS === 'web' ? () => null : Notifications.useLastNotificationResponse

function ChatPushDeepLink() {
  const router = useRouter()
  const pathname = usePathname()
  const { status, role } = useAuth()
  const qc = useQueryClient()
  // Covers both a tap while running AND the tap that launched the app from
  // closed (a listener registered after launch would miss that one).
  const response = useLastNotificationResponse()
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (!response) return
    const key = `${response.notification.request.identifier}:${response.notification.date}`
    if (handled.current === key) return
    // Wait until auth has resolved and the entry gate has handed off to the
    // role's home ('/' is the splash + redirect) — routing earlier would be
    // overridden by that redirect, or route a guest into a signed-in screen.
    if (status === 'loading' || pathname === '/') return
    handled.current = key
    Notifications.clearLastNotificationResponse()
    if (status !== 'authed') return

    const data = response.notification.request.content.data as
      | { conversation_id?: string; type?: string; url?: string; audience?: string }
      | undefined
    if (!data) return

    // Chat notification → open the thread. Invalidate the inbox + the thread
    // we're about to land on FIRST, so a tap while foregrounded doesn't open
    // onto stale data the poll/socket hasn't caught up to yet.
    const convId = data.conversation_id
    if (convId) {
      void qc.invalidateQueries({ queryKey: ['homeowner', 'conversations'] })
      void qc.invalidateQueries({ queryKey: ['owner', 'conversations'] })
      void qc.invalidateQueries({ queryKey: ['chat', 'thread', convId] })
      const route = chatPushRoute(role, convId)
      if (route) router.push(route as never)
      return
    }

    // Design-event notification (see `app.push.sender` design callers) → the
    // brief/profile screen. Can target either a homeowner or (via
    // `audience: 'designer'`) the contractor-side architect, so this check
    // runs before the homeowner-only gate below.
    const designRoute = designPushRoute(data)
    if (designRoute) {
      router.push(designRoute as never)
      return
    }

    // Homeowner content notification → the matching surface. Invalidate its
    // query first so the screen renders fresh, not the last cached grid/list.
    if (role !== 'homeowner') return
    switch (data.type) {
      case 'photo':
        void qc.invalidateQueries({ queryKey: ['photos'] })
        router.push('/(homeowner)/photos')
        break
      case 'request':
        void qc.invalidateQueries({ queryKey: ['homeowner', 'requests'] })
        router.push('/(homeowner)/requests')
        break
      case 'update':
      case 'weekly_summary':
        void qc.invalidateQueries({ queryKey: ['homeowner', 'updates'] })
        void qc.invalidateQueries({ queryKey: ['homeowner', 'weeklySummary'] })
        router.push('/(homeowner)/updates')
        break
    }
  }, [response, status, role, pathname, router, qc])

  return null
}
