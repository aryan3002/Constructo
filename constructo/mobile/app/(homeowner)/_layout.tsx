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
import { Redirect, Tabs, usePathname } from 'expo-router'

import { useAuth } from '../../src/auth/AuthContext'
import { useT } from '../../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../../src/theme/ThemeProvider'
import { AskPill, FloatingTabBar } from '../../src/ui'

function HomeownerTabs() {
  const { t } = useT()
  const { theme } = useTheme()
  const askLabel = t('nav.ask')
  // Hide the Ask pill on the pushed chat thread — it has its own composer, and
  // the thread covers the bar full-screen (the bar is hidden there too).
  const pathname = usePathname()
  const onThread = /^\/messages\/[^/]+$/.test(pathname ?? '')

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Tabs
        initialRouteName="home"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          // Warm-paper scene background so the navigator's default (grey)
          // background never shows behind the floating bar. Each tab screen
          // reserves its own bottom clearance (FLOATING_NAV_CLEARANCE) *inside*
          // its scroll content, so the warm canvas fills to the edge and there
          // is no grey band.
          sceneStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Tabs.Screen name="home" options={{ title: t('nav.home') }} />
        <Tabs.Screen name="photos" options={{ title: t('nav.photos') }} />
        <Tabs.Screen name="updates" options={{ title: t('nav.updates') }} />
        <Tabs.Screen name="messages" options={{ title: t('nav.messages') }} />
        <Tabs.Screen name="design" options={{ title: t('nav.design') }} />
        {/* Thread detail — pushed from the Messages inbox, no tab bar entry */}
        <Tabs.Screen name="messages/[id]" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null, title: t('nav.settings') }} />
        {/* Settings cluster — pushed from the Settings hub, no tab bar entry */}
        <Tabs.Screen name="members" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        {/* Onboarding screens — no tab bar entry */}
        <Tabs.Screen name="welcome" options={{ href: null }} />
        <Tabs.Screen name="household" options={{ href: null }} />
      </Tabs>
      {!onThread ? <AskPill label={askLabel} /> : null}
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
