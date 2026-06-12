/**
 * Mukadam (labor_contractor) tab shell — the SMALLEST, most accessible nav in
 * the product: 3 enormous tabs (Attendance / My Payments / Help), Neev
 * theme, icon + WORD (never icon-only), extra-large targets for gloved hands in
 * sunlight. Lands on Attendance — the mukadam's one daily job.
 *
 * The parent (contractor) `_layout.tsx` already provides the Neev
 * ThemeProvider and the auth guard; this layout only defines the Tabs.
 */
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { FACES } from '../../../src/theme/fonts'

const STR = {
  en: { attendance: 'Attendance', payments: 'My Pay', help: 'Help' },
  hi: { attendance: 'हाज़िरी', payments: 'मेरी पेमेंट', help: 'मदद' },
} as const

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

export default function MukadamLayout() {
  const { lang } = useT()
  const { theme } = useTheme()
  const str = STR[lang]
  return (
    <Tabs
      initialRouteName="attendance"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accentDeep,
        tabBarInactiveTintColor: theme.colors.textMute,
        // Extra-large bar for low-literacy, gloved, one-thumb use.
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.line,
          height: 78,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontFamily: FACES[theme.name].bodyStrong, fontSize: 14 },
        tabBarIconStyle: { marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="attendance"
        options={{ title: str.attendance, tabBarIcon: tabIcon('people-outline') }}
      />
      <Tabs.Screen
        name="my-payments"
        options={{ title: str.payments, tabBarIcon: tabIcon('cash-outline') }}
      />
      <Tabs.Screen name="help" options={{ title: str.help, tabBarIcon: tabIcon('help-circle-outline') }} />
    </Tabs>
  )
}
