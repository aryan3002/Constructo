/**
 * Auth group. Default surface is warm Daylight (the "Who are you?" chooser +
 * the homeowner join). The staff login overrides to Neev from inside its
 * own screen — the group can't theme by role because the role isn't known until
 * after login.
 */
import { Stack } from 'expo-router'

import { ThemeProvider } from '../../src/theme/ThemeProvider'

export default function AuthLayout() {
  return (
    <ThemeProvider initial="daylight">
      <Stack screenOptions={{ headerShown: false }} initialRouteName="index" />
    </ThemeProvider>
  )
}
