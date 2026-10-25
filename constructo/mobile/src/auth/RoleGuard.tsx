/** Wraps a role's navigator: anyone signed in with another role is redirected
 *  to their own home (see {@link roleGuardRedirect}). */
import type { ReactNode } from 'react'
import { Redirect } from 'expo-router'

import type { Role } from '../api/types'
import { useAuth } from './AuthContext'
import { roleGuardRedirect } from './auth.util'

export function RoleGuard({ role, children }: { role: Role; children: ReactNode }) {
  const { status, role: myRole } = useAuth()
  const redirect = roleGuardRedirect(status, myRole, role)
  if (redirect) return <Redirect href={redirect as never} />
  return <>{children}</>
}
