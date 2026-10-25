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
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useT } from '../../../src/i18n/I18nProvider'
import { FACES } from '../../../src/theme/fonts'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { RoleGuard } from '../../../src/auth/RoleGuard'

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

function PmLayoutTabs() {
  const { t } = useT()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      initialRouteName="dpr"
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
        tabBarLabelStyle: { fontFamily: FACES[theme.name].bodyStrong, fontSize: 12, lineHeight: 16 },
      }}
    >
      <Tabs.Screen
        name="dpr"
        options={{ title: t('pm.tabDpr'), tabBarIcon: tabIcon('document-text-outline') }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: t('pm.tabChat'), tabBarIcon: tabIcon('chatbubble-ellipses-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t('pm.tabMore'), tabBarIcon: tabIcon('ellipsis-horizontal-outline') }}
      />
      {/* Conversation detail, off-tab (pushed from the Chat inbox). */}
      <Tabs.Screen name="chat/[id]" options={{ href: null }} />
      <Tabs.Screen name="chat-viewer" options={{ href: null }} />
    </Tabs>
  )
}

export default function PmLayout() {
  return (
    <RoleGuard role="pm">
      <PmLayoutTabs />
    </RoleGuard>
  )
}
