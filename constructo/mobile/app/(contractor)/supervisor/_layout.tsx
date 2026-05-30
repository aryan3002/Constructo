/**
 * Supervisor tabs — Blueprint theme, the fewest/biggest tabs for a gloved,
 * one-thumb field user: Capture (hero, default) · My Sites · Tasks/Asks.
 *
 * The parent (contractor) group already wraps this in
 * <ThemeProvider initial="blueprint">, so this layout only defines the Tabs.
 * Icons are glyph + label (never icon-only — semi-literate users). ≥48px row.
 */
import { Text, type ColorValue } from 'react-native'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'

const STR = {
  en: { capture: 'Capture', sites: 'My Sites', tasks: 'Tasks/Asks' },
  hi: { capture: 'भेजो', sites: 'मेरी साइट', tasks: 'काम/सवाल' },
} as const

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ fontSize: 20, color }}>{glyph}</Text>
  )
}

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
        tabBarLabelStyle: { fontFamily: 'Hind-SemiBold', fontSize: 12 },
      }}
    >
      <Tabs.Screen name="capture" options={{ title: str.capture, tabBarIcon: icon('📷') }} />
      <Tabs.Screen name="my-sites" options={{ title: str.sites, tabBarIcon: icon('🏗') }} />
      <Tabs.Screen name="tasks-asks" options={{ title: str.tasks, tabBarIcon: icon('✅') }} />
    </Tabs>
  )
}
