/**
 * Site Engineer (Lokesh) tabs — re-skinned onto the warm daylight "Calm Cockpit"
 * theme to match the Neev Site-Engineer prototype. We wrap the supervisor
 * subtree in its OWN <ThemeProvider initial="daylight">, exactly like
 * owner/_layout.tsx, so every supervisor screen + the field nav read daylight
 * tokens while PM / accountant / mukadam / architect stay on neev.
 *
 * Field nav (custom {@link EngTabBar}): Home · Tasks · Capture (center FAB) ·
 * Chat · More. Audit / Drawings / Profile / task-reply are pushed off-tab.
 */
import { View } from 'react-native'
import { Tabs } from 'expo-router'

import { ThemeProvider, useTheme } from '../../../src/theme/ThemeProvider'
import { ToastProvider } from '../../../src/ui'
import { EngTabBar } from './_eng.components'

function SupervisorTabs() {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Tabs
        initialRouteName="home"
        backBehavior="history"
        tabBar={(props) => <EngTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.bg } }}
      >
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
        <Tabs.Screen name="capture" options={{ title: 'Capture' }} />
        <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
        {/* Pushed, off-tab. */}
        <Tabs.Screen name="task/[id]" options={{ href: null }} />
        <Tabs.Screen name="audit" options={{ href: null }} />
        <Tabs.Screen name="audit/[id]" options={{ href: null }} />
        <Tabs.Screen name="drawings" options={{ href: null }} />
        <Tabs.Screen name="drawing/[id]" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
        {/* Full-screen photo lightbox opened from a chat bubble, off-tab. */}
        <Tabs.Screen name="chat-viewer" options={{ href: null }} />
        {/* Pushed from chat (to-dos from a card). */}
        <Tabs.Screen name="action-items" options={{ href: null }} />
        {/* Legacy screen kept routable but off the field nav (prototype has no
            Sites tab — assigned sites live in Profile + the capture switcher). */}
        <Tabs.Screen name="my-sites" options={{ href: null }} />
        {/* Old asks screen superseded by `tasks` + `task/[id]`; keep off-tab so a
            stale deep-link never 404s. */}
        <Tabs.Screen name="tasks-asks" options={{ href: null }} />
      </Tabs>
    </View>
  )
}

export default function SupervisorLayout() {
  return (
    <ThemeProvider initial="daylight">
      <ToastProvider>
        <SupervisorTabs />
      </ToastProvider>
    </ThemeProvider>
  )
}
