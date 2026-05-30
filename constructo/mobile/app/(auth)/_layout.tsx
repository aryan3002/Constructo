/** Auth group — warm Daylight surface (the welcoming first impression). */
import { Stack } from 'expo-router'

import { ThemeProvider } from '../../src/theme/ThemeProvider'

export default function AuthLayout() {
  return (
    <ThemeProvider initial="daylight">
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  )
}
