/**
 * Owner branch — "Calm Cockpit" (daylight) tab set.
 *
 * The owner surface was re-skinned off the dark "neev" look onto the warm
 * daylight Calm-Cockpit system (matching the Neev-2 owner prototype). We wrap the
 * owner subtree in its OWN <ThemeProvider initial="daylight"> so every owner
 * screen + the tab bar read daylight tokens, while the rest of the (contractor)
 * group (PM / supervisor / accountant / …) and the homeowner app are untouched.
 *
 * Prototype tab set (5 tabs): Brief / Sites / Chat / Specs / Approvals.
 * Home = Brief, the cross-site command screen. More/Audit/Survey are pushed
 * (off-tab) from the Brief header + the More hub.
 */
import { Ionicons } from '@expo/vector-icons'
import { Tabs } from 'expo-router'

import { useT } from '../../../src/i18n/I18nProvider'
import { ThemeProvider, useTheme } from '../../../src/theme/ThemeProvider'
import { FACES } from '../../../src/theme/fonts'
import { ToastProvider } from '../../../src/ui'

const LABELS = {
  en: { brief: 'Brief', sites: 'Sites', chat: 'Chat', specs: 'Specs', approvals: 'Approvals', more: 'More', search: 'Search' },
  hi: { brief: 'ब्रीफ़', sites: 'साइट', chat: 'चैट', specs: 'स्पेक', approvals: 'मंज़ूरी', more: 'और', search: 'खोज' },
} as const

const tabIcon =
  (name: keyof typeof Ionicons.glyphMap) =>
  ({ color }: { color: string; size: number }) =>
    <Ionicons name={name} size={22} color={color} />

function OwnerTabs() {
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
      <Tabs.Screen name="sites" options={{ title: L.sites, tabBarIcon: tabIcon('business-outline') }} />
      <Tabs.Screen name="chat" options={{ title: L.chat, tabBarIcon: tabIcon('chatbubble-ellipses-outline') }} />
      <Tabs.Screen name="specs" options={{ title: L.specs, tabBarIcon: tabIcon('color-palette-outline') }} />
      <Tabs.Screen name="approvals" options={{ title: L.approvals, tabBarIcon: tabIcon('checkbox-outline') }} />
      {/* More hub — pushed from the Brief header, off-tab. */}
      <Tabs.Screen name="more" options={{ href: null }} />
      {/* Search stays routable (pushed from More / Brief), off-tab. */}
      <Tabs.Screen name="search" options={{ href: null }} />
      {/* Conversation detail, off-tab. */}
      <Tabs.Screen name="chat/[id]" options={{ href: null }} />
      {/* Nested site-detail route, off-tab. */}
      <Tabs.Screen name="site/[id]" options={{ href: null }} />
      {/* Audit hub + site audit + survey (Site Audit / SiteSync), off-tab. */}
      <Tabs.Screen name="audit" options={{ href: null }} />
      <Tabs.Screen name="audit/[id]" options={{ href: null }} />
      <Tabs.Screen name="survey/[id]" options={{ href: null }} />
      {/* Design profiler: hub + per-site profile + full brief, off-tab. */}
      <Tabs.Screen name="design" options={{ href: null }} />
      <Tabs.Screen name="designsite/[id]" options={{ href: null }} />
      <Tabs.Screen name="dp/[id]" options={{ href: null }} />
      {/* Foresight (portfolio) — pushed from More, off-tab. */}
      <Tabs.Screen name="foresight" options={{ href: null }} />
      {/* Team & roles — pushed from Account hub, off-tab. */}
      <Tabs.Screen name="team" options={{ href: null }} />
      {/* Permits — pushed from Account hub, off-tab. */}
      <Tabs.Screen name="permits" options={{ href: null }} />
      {/* Dispute pack — pushed from the site detail, off-tab. */}
      <Tabs.Screen name="dispute-pack" options={{ href: null }} />
    </Tabs>
  )
}

export default function OwnerLayout() {
  // Override the parent (contractor) neev theme with daylight for the owner subtree.
  return (
    <ThemeProvider initial="daylight">
      <ToastProvider>
        <OwnerTabs />
      </ToastProvider>
    </ThemeProvider>
  )
}
