/**
 * Homeowner shell — Daylight theme, 4-tab nav (Home / Photos / Updates /
 * Design). Settings lives off-tab (opened from Home). A guard bounces
 * non-homeowners back to the gate. Content for each tab is H2's job; H1 ships
 * the themed, role-branched shell.
 */
import { Text, type ColorValue } from 'react-native'
import { Redirect, Tabs } from 'expo-router'

import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../../src/theme/ThemeProvider'

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ fontSize: 20, color }}>{glyph}</Text>
  )
}

function HomeownerTabs() {
  const { t } = useT()
  const { theme } = useTheme()
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMute,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.line,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: 'Hind-SemiBold', fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: t('nav.home'), tabBarIcon: icon('🏠') }}
      />
      <Tabs.Screen
        name="photos"
        options={{ title: t('nav.photos'), tabBarIcon: icon('🖼') }}
      />
      <Tabs.Screen
        name="updates"
        options={{ title: t('nav.updates'), tabBarIcon: icon('📋') }}
      />
      <Tabs.Screen
        name="design"
        options={{ title: t('nav.design'), tabBarIcon: icon('🎨') }}
      />
      <Tabs.Screen name="settings" options={{ href: null, title: t('nav.settings') }} />
    </Tabs>
  )
}

export default function HomeownerLayout() {
  const { status, role } = useAuth()
  if (status === 'loading') return null
  if (status === 'guest') return <Redirect href="/(auth)/login" />
  if (role !== 'homeowner') return <Redirect href="/(contractor)" />

  return (
    <ThemeProvider initial="daylight">
      <HomeownerTabs />
    </ThemeProvider>
  )
}
