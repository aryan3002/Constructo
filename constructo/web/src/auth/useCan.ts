import { useQuery } from '@tanstack/react-query'
import { authApi, isAuthenticated, type Me, type Role } from '../api/auth'
import { qk } from '../api/queryKeys'
import { roleCan, type Capability } from './permissions'

/**
 * Full /auth/me query result, cached app-wide (read once, staleTime: Infinity).
 * This is the single definition of the query — all other hooks and pages that
 * need the current user derive from here so they all share the same cache entry.
 * Retry is intentionally omitted; tests can set `retry: false` on their
 * QueryClient and it will be respected.
 *
 * Only asked when signed in: on the public pages (/login, /join, ...) shared
 * chrome such as the skin sync and the command palette would otherwise make a
 * failing call. Signing in re-renders those readers, which then fetch.
 */
export function useMe() {
  return useQuery<Me>({
    queryKey: qk.me(),
    queryFn: () => authApi.me(),
    staleTime: Infinity,
    enabled: isAuthenticated(),
  })
}

/**
 * Current user's role, cached app-wide (read once). The server remains the
 * authorization source of truth; this only drives UI shaping.
 */
export function useMeRole(): Role | undefined {
  const { data } = useMe()
  return data?.role
}

/** True if the current user's role has `cap`. Defaults to false while loading. */
export function useCan(cap: Capability): boolean {
  const role = useMeRole()
  return roleCan(role, cap)
}
