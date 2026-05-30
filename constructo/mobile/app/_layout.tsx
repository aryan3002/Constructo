/**
 * Root layout: global providers + font gate. Theme is applied per route GROUP
 * (homeowner → Daylight, contractor → Blueprint) so the surface matches the
 * role; here we only set up Query, i18n, auth, safe-area, and load fonts.
 */
import { useMemo } from 'react'
import { View } from 'react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { AuthProvider } from '../src/auth/AuthContext'
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
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </I18nProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
