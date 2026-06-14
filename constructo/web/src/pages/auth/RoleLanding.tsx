import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { authApi, type Role } from '../../api/auth'
import { useMe } from '../../auth/useCan'
import { useT } from '../../i18n'
import { Spinner } from '../../components/states'
import { ThemeProvider } from '../../ui'

/**
 * The IA "where do I land" map. After login, each role lands on the home that
 * matches its job (GET /api/v1/auth/me/landing returns the authoritative key;
 * we keep this client map as the source for routing + a safe fallback if the
 * endpoint is unavailable).
 */
const LANDING_ROUTE: Record<string, string> = {
  brief: '/owner',
  today: '/pm',
  capture: '/supervisor/capture',
  attendance: '/mukadam/attendance',
  reconcile: '/reconcile',
  orders: '/reconcile',
  approvals: '/approvals',
  search: '/search',
  spec_desk: '/spec-desk',
}

/** Fallback landing derived purely from the role, used if /me/landing fails. */
const ROLE_FALLBACK: Record<Role, string> = {
  owner: '/owner',
  pm: '/pm',
  architect: '/spec-desk',
  supervisor: '/supervisor/capture',
  accountant: '/reconcile',
  procurement: '/reconcile',
  labor_contractor: '/mukadam/attendance',
}

/**
 * Role-aware landing redirect. Mounted at `/`, it resolves the signed-in user's
 * home and navigates there, so every role lands on its correct screen instead
 * of a one-size-fits-all dashboard.
 */
export function RoleLanding() {
  const t = useT()
  const landing = useQuery({
    queryKey: ['auth', 'landing'],
    queryFn: () => authApi.landing(),
    retry: false,
  })

  if (landing.isLoading) {
    return (
      <ThemeProvider defaultTheme="site">
        <div className="flex min-h-screen items-center justify-center">
          <Spinner label={t('common.loading')} />
        </div>
      </ThemeProvider>
    )
  }

  if (landing.isError || !landing.data) {
    // Last resort: try to read the role and route from that; else show an error.
    return <LandingFromRole />
  }

  const target =
    LANDING_ROUTE[landing.data.landing] ??
    ROLE_FALLBACK[landing.data.role] ??
    '/owner'
  return <Navigate to={target} replace />
}

/** Fallback path: resolve the home from GET /me when /me/landing is unavailable. */
function LandingFromRole() {
  const t = useT()
  const me = useMe()

  if (me.isLoading) {
    return (
      <ThemeProvider defaultTheme="site">
        <div className="flex min-h-screen items-center justify-center">
          <Spinner label={t('common.loading')} />
        </div>
      </ThemeProvider>
    )
  }
  if (me.isError || !me.data) {
    // No backend reachable (e.g. VITE_USE_MOCKS with no API): the owner brief is
    // the safe default landing so the mock-data screens still render.
    return <Navigate to="/owner" replace />
  }
  return <Navigate to={ROLE_FALLBACK[me.data.role] ?? '/owner'} replace />
}
