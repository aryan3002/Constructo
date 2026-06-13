/**
 * Designer (Anamika) tabs — re-skinned onto the warm daylight "Calm Cockpit"
 * theme to match the Neev-Designer prototype. We wrap the architect subtree in
 * its OWN <ThemeProvider initial="daylight"> (like owner/_layout.tsx), so every
 * designer screen + the tab bar read daylight tokens while the rest of the
 * (contractor) group stays on neev.
 *
 * Tabs: Home · Brief · Selections · Chat · More. Brief = the homeowner design
 * profiler (the architect's working brief); Selections = the material specs the
 * architect routes. Design detail (site / dp), selection detail, and profile are
 * pushed off-tab.
 */
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../../../src/theme/ThemeProvider'
import { FACES } from '../../../src/theme/fonts'

const LABELS = {
  en: { home: 'Home', brief: 'Brief', selections: 'Selections', chat: 'Chat', more: 'More' },
  hi: { home: 'होम', brief: 'ब्रीफ़', selections: 'चयन', chat: 'चैट', more: 'और' },
} as const

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

function ArchitectTabs() {
  const { lang } = useT()
  const { theme } = useTheme()
  const L = LABELS[lang]

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
        tabBarLabelStyle: { fontFamily: FACES[theme.name].bodyStrong, fontSize: 12 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: L.home, tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="brief" options={{ title: L.brief, tabBarIcon: tabIcon('sparkles-outline') }} />
      <Tabs.Screen name="selections" options={{ title: L.selections, tabBarIcon: tabIcon('color-palette-outline') }} />
      <Tabs.Screen name="chat" options={{ title: L.chat, tabBarIcon: tabIcon('chatbubble-ellipses-outline') }} />
      <Tabs.Screen name="more" options={{ title: L.more, tabBarIcon: tabIcon('grid-outline') }} />
      {/* Pushed, off-tab. */}
      <Tabs.Screen name="chat/[id]" options={{ href: null }} />
      <Tabs.Screen name="designsite/[id]" options={{ href: null }} />
      <Tabs.Screen name="dp/[id]" options={{ href: null }} />
      <Tabs.Screen name="selection/[id]" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  )
}

export default function ArchitectLayout() {
  return (
    <ThemeProvider initial="daylight">
      <ArchitectTabs />
    </ThemeProvider>
  )
}
