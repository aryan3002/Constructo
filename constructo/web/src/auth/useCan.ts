import { useQuery } from '@tanstack/react-query'
import { authApi, type Me, type Role } from '../api/auth'
import { roleCan, type Capability } from './permissions'

/**
 * Current user's role, cached app-wide (read once). The server remains the
 * authorization source of truth; this only drives UI shaping.
 */
export function useMeRole(): Role | undefined {
  const { data } = useQuery<Me>({
    queryKey: ['me'],
    queryFn: () => authApi.me(),
    staleTime: Infinity,
    retry: 1,
  })
  return data?.role
}

/** True if the current user's role has `cap`. Defaults to false while loading. */
export function useCan(cap: Capability): boolean {
  const role = useMeRole()
  return roleCan(role, cap)
}
