/**
 * Root layout: global providers + font gate. Theme is applied per route GROUP
 * (homeowner → Daylight, contractor → Neev) so the surface matches the
 * role; here we only set up Query, i18n, auth, safe-area, and load fonts.
 */
import { useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as Notifications from 'expo-notifications'

import { AuthProvider, useAuth } from '../src/auth/AuthContext'
import { drainChatOutboxOnLaunch } from '../src/chat/useChatThread'
import { I18nProvider } from '../src/i18n/I18nProvider'
import { useAppFonts } from '../src/theme/fonts'

export default function RootLayout() {
  const [fontsLoaded, fontError] = useAppFonts()
  const client = useMemo(() => new QueryClient(), [])

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
 * Routes by role. Best-effort: a malformed/unknown payload is ignored. Mounted
 * inside AuthProvider so `role` + router are ready.
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

function ChatPushDeepLink() {
  const router = useRouter()
  const { role } = useAuth()

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { conversation_id?: string; type?: string }
        | undefined
      if (!data) return

      // Chat notification → open the thread.
      const convId = data.conversation_id
      if (convId) {
        if (role === 'homeowner') {
          router.push({
            pathname: '/(homeowner)/messages/[id]',
            params: { id: convId, kind: 'homeowner' },
          })
        } else {
          // Contractor threads address by conversation id; an undefined `kind`
          // falls back to addressing by conv id in the screen.
          router.push({ pathname: '/(contractor)/owner/chat/[id]', params: { id: convId } })
        }
        return
      }

      // Homeowner content notification → the matching surface.
      if (role !== 'homeowner') return
      switch (data.type) {
        case 'photo':
          router.push('/(homeowner)/photos')
          break
        case 'request':
          router.push('/(homeowner)/requests')
          break
        case 'update':
        case 'weekly_summary':
          router.push('/(homeowner)/updates')
          break
      }
    })
    return () => sub.remove()
  }, [role, router])

  return null
}
