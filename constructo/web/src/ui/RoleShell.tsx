import type { ReactNode } from 'react'
import { useMeRole } from '../auth/useCan'
import { AppShell, useRoleTabs, type Role } from './AppShell'

/**
 * The app frame for a page that has no site switcher of its own: the signed-in
 * person's role tab bar (phone) / sidebar (desktop), around `children`. Until
 * the role is known the nav stays empty rather than flashing another role's.
 */
export function RoleShell({ children }: { children: ReactNode }) {
  const role = useMeRole() as Role | undefined
  const tabs = useRoleTabs(role ?? 'owner')
  return (
    <AppShell role={role ?? 'owner'} tabs={role ? tabs : []}>
      {children}
    </AppShell>
  )
}
