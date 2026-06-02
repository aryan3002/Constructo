/**
 * PM (Project Manager) tabs — Blueprint theme. The hero is DPR: the evening
 * Daily Progress Report that drafts itself from the day's site_events and that
 * the PM reviews + sends (CA1 — never auto-sent).
 *
 * The parent (contractor) group already wraps <ThemeProvider initial="blueprint">,
 * so this layout only defines the Tabs. Icons are premium Feather glyphs (no
 * emoji), amber active tint, ≥48px rows.
 */
import { Feather } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'

type FeatherName = React.ComponentProps<typeof Feather>['name']

function icon(name: FeatherName) {
  return ({ color }: { color: string }) => (
    <Feather name={name} size={20} color={color} />
  )
}

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
        tabBarLabelStyle: { fontFamily: 'Hind-SemiBold', fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="dpr"
        options={{ title: t('pm.tabDpr'), tabBarIcon: icon('file-text') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('pm.tabMore'), tabBarIcon: icon('menu') }}
      />
    </Tabs>
  )
}
