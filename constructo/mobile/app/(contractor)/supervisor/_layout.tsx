/**
 * Supervisor tabs — Neev theme, the fewest/biggest tabs for a gloved,
 * one-thumb field user: Capture (hero, default) · My Sites · Tasks/Asks.
 *
 * The parent (contractor) group already wraps this in
 * <ThemeProvider initial="neev">, so this layout only defines the Tabs.
 * Icons are Ionicons outline + label (never icon-only — semi-literate users). ≥48px row.
 */
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'

const STR = {
  en: { capture: 'Capture', chat: 'Chat', sites: 'My Sites', tasks: 'Tasks/Asks' },
  hi: { capture: 'भेजो', chat: 'चैट', sites: 'मेरी साइट', tasks: 'काम/सवाल' },
} as const

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

export default function SupervisorLayout() {
  const { lang } = useT()
  const { theme } = useTheme()
  const str = STR[lang]
  return (
    <Tabs
      initialRouteName="capture"
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
        tabBarLabelStyle: { fontFamily: theme.name === 'neev' ? 'Mukta-SemiBold' : 'Hind-SemiBold', fontSize: 12 },
      }}
    >
      <Tabs.Screen name="capture" options={{ title: str.capture, tabBarIcon: tabIcon('camera-outline') }} />
      <Tabs.Screen name="chat" options={{ title: str.chat, tabBarIcon: tabIcon('chatbubble-ellipses-outline') }} />
      <Tabs.Screen name="my-sites" options={{ title: str.sites, tabBarIcon: tabIcon('business-outline') }} />
      <Tabs.Screen name="tasks-asks" options={{ title: str.tasks, tabBarIcon: tabIcon('checkbox-outline') }} />
      {/* Pushed from the chat header — no tab entry. */}
      <Tabs.Screen name="action-items" options={{ href: null }} />
    </Tabs>
  )
}
