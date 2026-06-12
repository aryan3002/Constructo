/**
 * Accountant tabs — Neev theme. The accountant's slice is read-mostly,
 * evidence-anchored, and exceptions-first (CA5). It is TRACKING-ONLY: nothing
 * here moves money — the accountant flags, the owner resolves.
 *
 * The parent (contractor) group already wraps <ThemeProvider initial="neev">,
 * so this layout only defines the Tabs. Icons are Ionicons outline,
 * amber active tint.
 */
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

export default function AccountantLayout() {
  const { t } = useT()
  const { theme } = useTheme()

  return (
    <Tabs
      initialRouteName="reconcile"
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
      <Tabs.Screen
        name="reconcile"
        options={{ title: t('accountant.tabReconcile'), tabBarIcon: tabIcon('card-outline') }}
      />
      <Tabs.Screen
        name="payments"
        options={{ title: t('accountant.tabPayments'), tabBarIcon: tabIcon('cash-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('accountant.tabMore'), tabBarIcon: tabIcon('ellipsis-horizontal-outline') }}
      />
      {/* Site detail is a pushed route, not a tab. */}
      <Tabs.Screen name="site/[id]" options={{ href: null }} />
    </Tabs>
  )
}
