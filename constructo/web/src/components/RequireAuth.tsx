import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isAuthenticated } from '../api/auth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  if (!isAuthenticated()) {
    // Come back here after signing in (the landing page picks its own route).
    const here = `${location.pathname}${location.search}`
    const to = location.pathname === '/' ? '/login' : `/login?next=${encodeURIComponent(here)}`
    return <Navigate to={to} replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
