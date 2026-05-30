/**
 * Entry gate / role→route map. Branches on auth status + role:
 *   loading          → a calm splash
 *   guest            → /(auth)/login
 *   homeowner        → /(homeowner)/home          (Daylight)
 *   owner            → /(contractor)/owner/brief  (Blueprint, H4)
 *   supervisor       → /(contractor)/supervisor/capture
 *   labor_contractor → /(contractor)/mukadam/attendance
 *   pm/accountant/procurement → /(contractor)     (Tier-2 placeholder; web primary)
 */
import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'

import { useAuth } from '../src/auth/AuthContext'

export default function Index() {
  const { status, role } = useAuth()

  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#fbfaf7',
        }}
      >
        <ActivityIndicator color="#2f8f6f" />
      </View>
    )
  }
  if (status === 'guest') return <Redirect href="/(auth)/login" />
  if (role === 'homeowner') return <Redirect href="/(homeowner)/home" />
  // H4 Tier-1 contractor branches (Owner / Supervisor / Mukadam).
  if (role === 'owner') return <Redirect href="/(contractor)/owner/brief" />
  if (role === 'supervisor') return <Redirect href="/(contractor)/supervisor/capture" />
  if (role === 'labor_contractor') {
    return <Redirect href="/(contractor)/mukadam/attendance" />
  }
  // Tier-2 roles (PM/accountant/procurement) — placeholder; web is primary.
  return <Redirect href="/(contractor)" />
}
