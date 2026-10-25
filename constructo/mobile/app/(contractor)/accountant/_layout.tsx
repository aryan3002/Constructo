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
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { RoleGuard } from '../../../src/auth/RoleGuard'

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

function AccountantLayoutTabs() {
  const { t } = useT()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      initialRouteName="reconcile"
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMute,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.line,
          // Explicit height/padding override bottom-tabs' own safe-area
          // handling, so add the bottom inset back (home indicator / Android nav).
          // Tall enough for the icon plus a full label line (it was clipped).
          height: 70 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: theme.name === 'neev' ? 'Mukta-SemiBold' : 'Hind-SemiBold', fontSize: 12, lineHeight: 16 },
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

export default function AccountantLayout() {
  return (
    <RoleGuard role="accountant">
      <AccountantLayoutTabs />
    </RoleGuard>
  )
}
