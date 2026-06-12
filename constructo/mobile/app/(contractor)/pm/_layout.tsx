/**
 * PM (Project Manager) tabs — Neev theme. The hero is DPR: the evening
 * Daily Progress Report that drafts itself from the day's site_events and that
 * the PM reviews + sends (CA1 — never auto-sent).
 *
 * The parent (contractor) group already wraps <ThemeProvider initial="neev">,
 * so this layout only defines the Tabs. Icons are Ionicons outline,
 * amber active tint, ≥48px rows.
 */
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { FACES } from '../../../src/theme/fonts'
import { useTheme } from '../../../src/theme/ThemeProvider'

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

export default function PmLayout() {
  const { t } = useT()
  const { theme } = useTheme()

  return (
    <Tabs
      initialRouteName="dpr"
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
      <Tabs.Screen
        name="dpr"
        options={{ title: t('pm.tabDpr'), tabBarIcon: tabIcon('document-text-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('pm.tabMore'), tabBarIcon: tabIcon('ellipsis-horizontal-outline') }}
      />
    </Tabs>
  )
}
