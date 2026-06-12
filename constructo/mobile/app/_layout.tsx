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
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

/**
 * Push deep-link (Task 13d): tapping a chat notification (data carries
 * `{conversation_id, seq}` — see backend `_push_offline_members`) opens that
 * thread. Routes by role — the homeowner thread lives under (homeowner)/messages,
 * the contractor thread under (contractor)/owner/chat. Best-effort: a malformed
 * payload is ignored. Mounted inside AuthProvider so `role` + router are ready.
 */
function ChatPushDeepLink() {
  const router = useRouter()
  const { role } = useAuth()

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { conversation_id?: string }
        | undefined
      const convId = data?.conversation_id
      if (!convId) return
      if (role === 'homeowner') {
        router.push({
          pathname: '/(homeowner)/messages/[id]',
          params: { id: convId, kind: 'homeowner' },
        })
      } else {
        // Contractor (owner/pm/supervisor) threads address by conversation id;
        // an undefined `kind` falls back to addressing by conv id in the screen.
        router.push({
          pathname: '/(contractor)/owner/chat/[id]',
          params: { id: convId },
        })
      }
    })
    return () => sub.remove()
  }, [role, router])

  return null
}
