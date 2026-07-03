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
import { TAB_DETAIL_TRANSITION } from '../../src/theme/motionTokens'
import { AskPill, FloatingTabBar, ToastProvider, useReducedMotion } from '../../src/ui'

function HomeownerTabs() {
  const { t } = useT()
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const askLabel = t('nav.ask')
  // Show the Ask pill ONLY on the 5 top-level tabs. On every pushed full-screen
  // route (chat thread, markup canvas, issue report, settings…) it would collide
  // with that screen's own bottom tools/composer, so hide it there.
  const pathname = usePathname()
  const onMainTab = /^\/(home|photos|updates|messages|design)?$/.test(pathname ?? '')

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Tabs
        initialRouteName="home"
        // Android hardware back retraces the actual navigation history
        // (thread → inbox → home) instead of jumping straight to Home.
        backBehavior="history"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          // Warm-paper scene background so the navigator's default (grey)
          // background never shows behind the floating bar. Each tab screen
          // reserves its own bottom clearance (FLOATING_NAV_CLEARANCE) *inside*
          // its scroll content, so the warm canvas fills to the edge and there
          // is no grey band.
          sceneStyle: { backgroundColor: theme.colors.bg },
          // Pushed detail (href:null) screens settle in with the app's motion;
          // the real tabs below opt back to instant. Skipped under Reduce Motion.
          ...(reduce ? {} : TAB_DETAIL_TRANSITION),
        }}
      >
        <Tabs.Screen name="home" options={{ title: t('nav.home'), animation: 'none' }} />
        <Tabs.Screen name="photos" options={{ title: t('nav.photos'), animation: 'none' }} />
        <Tabs.Screen name="updates" options={{ title: t('nav.updates'), animation: 'none' }} />
        <Tabs.Screen name="messages" options={{ title: t('nav.messages'), animation: 'none' }} />
        <Tabs.Screen name="design" options={{ title: t('nav.design'), animation: 'none' }} />
        {/* Thread detail — pushed from the Messages inbox, no tab bar entry */}
        <Tabs.Screen name="messages/[id]" options={{ href: null }} />
        {/* Full-screen photo lightbox opened from a chat bubble, no tab entry */}
        <Tabs.Screen name="chat-viewer" options={{ href: null }} />
        {/* Design write sub-routes — pushed from the Design tab, no tab bar entry */}
        <Tabs.Screen name="design/select" options={{ href: null }} />
        <Tabs.Screen name="design/profile" options={{ href: null }} />
        {/* Wave 2b — per-room references + drawing detail */}
        <Tabs.Screen name="design/references/[room]" options={{ href: null }} />
        {/* Design Profiler — intake hub, per-area ranking, brief review */}
        <Tabs.Screen name="design/profiler" options={{ href: null }} />
        <Tabs.Screen name="design/profiler/[area]" options={{ href: null }} />
        <Tabs.Screen name="design/brief" options={{ href: null }} />
        <Tabs.Screen name="drawings/[id]" options={{ href: null }} />
        {/* Her To-dos — pushed from the chat thread, no tab bar entry */}
        <Tabs.Screen name="todos" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null, title: t('nav.settings') }} />
        {/* Settings cluster — pushed from the Settings hub, no tab bar entry */}
        <Tabs.Screen name="members" options={{ href: null }} />
        <Tabs.Screen name="notifications" options={{ href: null }} />
        {/* Onboarding screens — no tab bar entry */}
        <Tabs.Screen name="welcome" options={{ href: null }} />
        <Tabs.Screen name="household" options={{ href: null }} />
        {/* Wave 1a — requests, issue-report, decision detail */}
        <Tabs.Screen name="requests" options={{ href: null }} />
        <Tabs.Screen name="issue" options={{ href: null }} />
        <Tabs.Screen name="request-photo" options={{ href: null }} />
        <Tabs.Screen name="markup" options={{ href: null }} />
        <Tabs.Screen name="comments" options={{ href: null }} />
        <Tabs.Screen name="inbox" options={{ href: null }} />
        <Tabs.Screen name="decisions/[id]" options={{ href: null }} />
        {/* Wave 1b — dedicated storage-management screen */}
        <Tabs.Screen name="storage" options={{ href: null }} />
      </Tabs>
      {onMainTab ? <AskPill label={askLabel} /> : null}
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
      <ToastProvider>
        <HomeownerTabs />
      </ToastProvider>
    </ThemeProvider>
  )
}
