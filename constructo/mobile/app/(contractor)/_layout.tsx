/** Contractor shell — Neev theme. Phased (H4+); the web app covers
 * contractors today, so this group is a placeholder behind an auth guard. */
import { Redirect, Stack } from 'expo-router'

import { useAuth } from '../../src/auth/AuthContext'
import { ThemeProvider } from '../../src/theme/ThemeProvider'

export default function ContractorLayout() {
  const { status, role } = useAuth()
  if (status === 'loading') return null
  if (status === 'guest') return <Redirect href="/(auth)/login" />
  if (role === 'homeowner') return <Redirect href="/(homeowner)/home" />

  return (
    <ThemeProvider initial="neev">
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  )
}
