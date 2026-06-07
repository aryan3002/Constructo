/**
 * Owner branch — Blueprint tab set (Brief / Sites / Approvals / Search / More).
 *
 * The parent (contractor) group already wraps <ThemeProvider initial="blueprint">,
 * so this layout only defines the expo-router Tabs (text-glyph icons, ≥48px,
 * amber active tint). Home = Brief, the 7am cross-site command screen.
 */
import { Text, type ColorValue } from 'react-native'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { useTheme } from '../../../src/theme/ThemeProvider'

const LABELS = {
  en: { brief: 'Brief', chat: 'Chat', sites: 'Sites', approvals: 'Approvals', search: 'Search', more: 'More' },
  hi: { brief: 'ब्रीफ़', chat: 'चैट', sites: 'साइट', approvals: 'मंज़ूरी', search: 'खोज', more: 'और' },
} as const

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ fontSize: 20, color }}>{glyph}</Text>
  )
}

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
        tabBarLabelStyle: { fontFamily: 'Hind-SemiBold', fontSize: 12 },
      }}
    >
      <Tabs.Screen name="brief" options={{ title: L.brief, tabBarIcon: icon('◆') }} />
      <Tabs.Screen name="chat" options={{ title: L.chat, tabBarIcon: icon('✉') }} />
      <Tabs.Screen name="sites" options={{ title: L.sites, tabBarIcon: icon('▦') }} />
      <Tabs.Screen name="approvals" options={{ title: L.approvals, tabBarIcon: icon('✓') }} />
      <Tabs.Screen name="more" options={{ title: L.more, tabBarIcon: icon('☰') }} />
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
