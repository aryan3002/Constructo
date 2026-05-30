/**
 * Entry gate. Branches on auth status + role:
 *   loading   → a calm splash
 *   guest     → /(auth)/login
 *   homeowner → /(homeowner)/home  (Daylight)
 *   any other → /(contractor)      (Blueprint placeholder; web covers it for now)
 */
import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'

import { useAuth } from '../src/auth/AuthContext'

export default function Index() {
  const { status, role } = useAuth()

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fbfaf7' }}>
        <ActivityIndicator color="#2f8f6f" />
      </View>
    )
  }
  if (status === 'guest') return <Redirect href="/(auth)/login" />
  if (role === 'homeowner') return <Redirect href="/(homeowner)/home" />
  return <Redirect href="/(contractor)" />
}
