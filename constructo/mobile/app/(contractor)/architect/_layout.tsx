/**
 * Designer (Anamika) tabs — re-skinned onto the warm daylight "Calm Cockpit"
 * theme to match the Neev-Designer prototype. We wrap the architect subtree in
 * its OWN <ThemeProvider initial="daylight"> (like owner/_layout.tsx), so every
 * designer screen + the field nav read daylight tokens while the rest of the
 * (contractor) group stays on neev.
 *
 * Field nav (custom {@link DesTabBar}): Home · Brief · Selections (center clay
 * FAB) · Chat · More. Brief = the homeowner design profiler; Selections = the
 * material specs the architect routes. Design detail, selection detail, site
 * changes, and profile are pushed off-tab.
 */
import { View } from 'react-native'
import { Tabs } from 'expo-router'

import { ThemeProvider, useTheme } from '../../../src/theme/ThemeProvider'
import { DesTabBar } from './_components'

function ArchitectTabs() {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <Tabs
        initialRouteName="home"
        backBehavior="history"
        tabBar={(props) => <DesTabBar {...props} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.colors.bg } }}
      >
        <Tabs.Screen name="home" options={{ title: 'Home' }} />
        <Tabs.Screen name="brief" options={{ title: 'Brief' }} />
        <Tabs.Screen name="selections" options={{ title: 'Selections' }} />
        <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
        {/* Pushed, off-tab. */}
        <Tabs.Screen name="chat/[id]" options={{ href: null }} />
        <Tabs.Screen name="designsite/[id]" options={{ href: null }} />
        <Tabs.Screen name="dp/[id]" options={{ href: null }} />
        <Tabs.Screen name="selection/[id]" options={{ href: null }} />
        <Tabs.Screen name="changes" options={{ href: null }} />
        <Tabs.Screen name="change/[id]" options={{ href: null }} />
        <Tabs.Screen name="profile" options={{ href: null }} />
      </Tabs>
    </View>
  )
}

export default function ArchitectLayout() {
  return (
    <ThemeProvider initial="daylight">
      <ArchitectTabs />
    </ThemeProvider>
  )
}
