/**
 * Owner branch — Neev tab set (Brief / Chat / Sites / Approvals / More).
 *
 * The parent (contractor) group already wraps <ThemeProvider initial="neev">,
 * so this layout only defines the expo-router Tabs (Ionicons outline, ≥48px,
 * amber active tint). Home = Brief, the 7am cross-site command screen.
 */
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'
import { FACES } from '../../../src/theme/fonts'

const LABELS = {
  en: { brief: 'Brief', chat: 'Chat', sites: 'Sites', approvals: 'Approvals', search: 'Search', more: 'More' },
  hi: { brief: 'ब्रीफ़', chat: 'चैट', sites: 'साइट', approvals: 'मंज़ूरी', search: 'खोज', more: 'और' },
} as const

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

export default function OwnerLayout() {
  const { lang } = useT()
  const { theme } = useTheme()
  const L = LABELS[lang]

  return (
    <Tabs
      initialRouteName="brief"
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
      <Tabs.Screen name="brief" options={{ title: L.brief, tabBarIcon: tabIcon('grid-outline') }} />
      <Tabs.Screen name="chat" options={{ title: L.chat, tabBarIcon: tabIcon('chatbubble-ellipses-outline') }} />
      <Tabs.Screen name="sites" options={{ title: L.sites, tabBarIcon: tabIcon('business-outline') }} />
      <Tabs.Screen name="approvals" options={{ title: L.approvals, tabBarIcon: tabIcon('checkbox-outline') }} />
      <Tabs.Screen name="more" options={{ title: L.more, tabBarIcon: tabIcon('ellipsis-horizontal-outline') }} />
      {/* Search stays routable (pushed from More), off-tab. */}
      <Tabs.Screen name="search" options={{ href: null }} />
      {/* Conversation detail, off-tab. */}
      <Tabs.Screen name="chat/[id]" options={{ href: null }} />
      {/* Nested site-detail route, off-tab. */}
      <Tabs.Screen name="site/[id]" options={{ href: null }} />
      {/* Foresight (portfolio) — pushed from More, off-tab. */}
      <Tabs.Screen name="foresight" options={{ href: null }} />
      {/* Dispute pack — pushed from the site detail, off-tab. */}
      <Tabs.Screen name="dispute-pack" options={{ href: null }} />
    </Tabs>
  )
}
