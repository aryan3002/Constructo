/**
 * Entry gate / role→route map. Branches on auth status + role:
 *   loading          → a calm splash
 *   guest            → /(auth)/login
 *   homeowner        → /(homeowner)/home          (Daylight)
 *                      NOTE: For new joins, join.tsx routes directly to welcome
 *                      (bypassing this gate entirely). This gate only handles
 *                      returning sessions (app restart / re-open).
 *   owner            → /(contractor)/owner/brief  (Blueprint, H4)
 *   supervisor       → /(contractor)/supervisor/capture
 *   labor_contractor → /(contractor)/mukadam/attendance
 *   pm               → /(contractor)/pm/dpr        (C4 Auto-DPR review)
 *   accountant       → /(contractor)/accountant/reconcile (C4 Reconcile cockpit)
 *   procurement      → /(contractor)               (Tier-2 placeholder; web primary)
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
  // Homeowners always land on home for returning sessions. New joins are routed
  // to (homeowner)/welcome directly from join.tsx (not through this gate).
  if (role === 'homeowner') return <Redirect href="/(homeowner)/home" />
  // H4 Tier-1 contractor branches (Owner / Supervisor / Mukadam).
  if (role === 'owner') return <Redirect href="/(contractor)/owner/brief" />
  if (role === 'supervisor') return <Redirect href="/(contractor)/supervisor/capture" />
  if (role === 'labor_contractor') {
    return <Redirect href="/(contractor)/mukadam/attendance" />
  }
  // PM (C4) — native Auto-DPR review surface.
  if (role === 'pm') return <Redirect href="/(contractor)/pm/dpr" />
  // Accountant (C4) — native Reconcile cockpit (read-mostly, tracking-only).
  if (role === 'accountant') {
    return <Redirect href="/(contractor)/accountant/reconcile" />
  }
  // Procurement is a HAT, not a seat (correction #3) — no dedicated home; the
  // PM/supervisor wears it. Falls through to the Tier-2 placeholder for now.
  return <Redirect href="/(contractor)" />
}
