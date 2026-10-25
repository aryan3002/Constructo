/**
 * Entry gate. Branches on auth status + role (the role → home map is
 * `homeFor` in src/auth/auth.util.ts):
 *   cold start       → the splash plays ONCE (the mark builds itself), then we
 *                      fall through to the role redirects below
 *   loading          → a calm static benchmark mark (never a spinner)
 *   guest            → /(auth)        ("Who are you?" role chooser)
 *   homeowner        → /(homeowner)/home          (Daylight)
 *                      NOTE: For new joins, join.tsx routes directly to welcome
 *                      (bypassing this gate entirely). This gate only handles
 *                      returning sessions (app restart / re-open).
 *   owner            → /(contractor)/owner/brief  (Neev, H4)
 *   supervisor       → /(contractor)/supervisor/home    (Calm Cockpit)
 *   labor_contractor → /(contractor)/mukadam/attendance
 *   pm               → /(contractor)/pm/dpr        (C4 Auto-DPR review)
 *   accountant       → /(contractor)/accountant/reconcile (C4 Reconcile cockpit)
 *   procurement      → /(contractor)               (Tier-2 placeholder; web primary)
 */
import { useState } from 'react'
import { View } from 'react-native'
import { Redirect } from 'expo-router'

import { useAuth } from '../src/auth/AuthContext'
import { homeFor } from '../src/auth/auth.util'
import { BenchmarkMark, Splash } from '../src/ui'

// Module-level: the splash plays ONCE per cold start (this flag lives for the
// JS session, so navigating back to `/` later never replays it).
let splashPlayed = false

export default function Index() {
  const { status, role } = useAuth()
  const [splashDone, setSplashDone] = useState(splashPlayed)

  // Cold start: hand the screen to the splash. Its build + handoff overlaps the
  // auth bootstrap; when it finishes we fall through to the redirects below.
  if (!splashDone) {
    return (
      <Splash
        onDone={() => {
          splashPlayed = true
          setSplashDone(true)
        }}
      />
    )
  }

  // Splash finished but auth still resolving — hold on the calm resolved mark,
  // breathing gently (never a racing spinner).
  if (status === 'loading') {
    return (
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3efe6' }}
      >
        <BenchmarkMark size={88} mode="breathe" />
      </View>
    )
  }

  if (status === 'guest') return <Redirect href="/(auth)" />
  // Role → home is one shared map (also used by login, the tour and the role
  // layouts' guards). Homeowners land on home for returning sessions; new joins
  // are routed to (homeowner)/welcome directly from join.tsx.
  return <Redirect href={homeFor(role) as never} />
}
