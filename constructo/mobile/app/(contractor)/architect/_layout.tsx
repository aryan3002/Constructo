/**
 * Architect tabs — Neev theme. The architect is a desk/design role; on mobile
 * the one feature that genuinely needs to be in-pocket is Chat (read + answer
 * site design questions in the crew thread). Heavy design work — the material
 * spec, drawings — stays web-primary. Two tabs: Chat (hero) · More.
 *
 * The parent (contractor) group already wraps <ThemeProvider initial="neev">,
 * so this layout only defines the Tabs. Icons are Ionicons outline, amber
 * active tint, ≥48px rows. Bilingual labels (Devanagari first-class).
 */
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { FACES } from '../../../src/theme/fonts'
import { useTheme } from '../../../src/theme/ThemeProvider'

const STR = {
  en: { chat: 'Chat', more: 'More' },
  hi: { chat: 'चैट', more: 'और' },
} as const

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

export default function ArchitectLayout() {
  const { lang } = useT()
  const { theme } = useTheme()
  const str = STR[lang]

  return (
    <Tabs
      initialRouteName="chat"
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
        name="chat"
        options={{ title: str.chat, tabBarIcon: tabIcon('chatbubble-ellipses-outline') }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: str.more, tabBarIcon: tabIcon('ellipsis-horizontal-outline') }}
      />
      {/* Conversation detail, off-tab (pushed from the Chat inbox). */}
      <Tabs.Screen name="chat/[id]" options={{ href: null }} />
    </Tabs>
  )
}
