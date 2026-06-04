import type { ReactNode } from 'react'
import type { Capability } from './permissions'
import { useCan } from './useCan'

/**
 * Conditional render by capability. `<Can cap="approve_money">` shows the owner
 * the Approve chip; everyone else gets `fallback` (e.g. "Propose to owner →").
 * UI shaping only — the API still enforces authorization.
 */
export function Can({
  cap,
  children,
  fallback = null,
}: {
  cap: Capability
  children: ReactNode
  fallback?: ReactNode
}) {
  return <>{useCan(cap) ? children : fallback}</>
}
