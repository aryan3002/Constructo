/**
 * Homeowner shell — Daylight theme, 4-tab nav (Home / Photos / Updates /
 * Design). Settings lives off-tab (opened from Home). A guard bounces
 * non-homeowners back to the gate.
 *
 * The bottom bar is the "Calm Cockpit" FLOATING + TRANSLUCENT nav (handoff
 * §2.1) rendered via a custom `tabBar` ({@link FloatingTabBar}) — content
 * scrolls *behind* it, never an opaque edge-to-edge bar (§8). A persistent
 * floating {@link AskPill} (§2.2) sits above the bar on all 4 tabs and opens
 * the grounded assistant. Pushed sub-routes (settings, onboarding) are
 * `href: null`, so they cover the bar full-screen.
 */
import { View } from 'react-native'
import { Redirect, Tabs } from 'expo-router'

import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../../src/theme/ThemeProvider'
import { AskPill, FloatingTabBar } from '../../src/ui'

/**
 * Vertical room reserved below each tab scene so scrolling content clears the
 * floating bar (bar height 64 + ~12 gap + breathing room). The bar itself is
 * absolutely positioned and does not occupy layout space, so screens need this
 * padding to avoid hiding content behind it.
 */
const BAR_CLEARANCE = 92

function HomeownerTabs() {
  const { t } = useT()
  const { theme } = useTheme()
  // No `nav.ask` key in the shared catalog (owned by another agent); use a
  // minimal inline fallback. TODO: add `nav.ask` ("Ask" / "पूछें") to en/hi.
  const askLabel = 'Ask'

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Tabs
        initialRouteName="home"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { paddingBottom: BAR_CLEARANCE },
        }}
      >
        <Tabs.Screen name="home" options={{ title: t('nav.home') }} />
        <Tabs.Screen name="photos" options={{ title: t('nav.photos') }} />
        <Tabs.Screen name="updates" options={{ title: t('nav.updates') }} />
        <Tabs.Screen name="design" options={{ title: t('nav.design') }} />
        <Tabs.Screen name="settings" options={{ href: null, title: t('nav.settings') }} />
        {/* Settings cluster — pushed from the Settings hub, no tab bar entry */}
        <Tabs.Screen name="members" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        {/* Onboarding screens — no tab bar entry */}
        <Tabs.Screen name="welcome" options={{ href: null }} />
        <Tabs.Screen name="household" options={{ href: null }} />
      </Tabs>
      <AskPill label={askLabel} />
    </View>
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
