/**
 * Session state. On mount it reads any stored JWT and resolves the current user
 * (`/auth/me`) to learn their role — which the root layout uses to branch the
 * navigation (homeowner → Daylight tabs, contractor → Blueprint shell).
 *
 * After a successful login/join the screen calls `refresh()` (the token is
 * already persisted by `authApi`); `signOut()` clears it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { authApi } from '../api/auth'
import { ApiError } from '../api/client'
import type { Me, Role } from '../api/types'
import { clearToken, getToken } from '../store/secure'

type Status = 'loading' | 'authed' | 'guest'

interface AuthContextValue {
  status: Status
  me: Me | null
  role: Role | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [me, setMe] = useState<Me | null>(null)

  const refresh = useCallback(async () => {
    const token = await getToken()
    if (!token) {
      setMe(null)
      setStatus('guest')
      return
    }
    try {
      const profile = await authApi.me()
      setMe(profile)
      setStatus('authed')
    } catch (err) {
      // A stale/invalid token resolves to guest (and is cleared).
      if (err instanceof ApiError && err.status === 401) await clearToken()
      setMe(null)
      setStatus('guest')
    }
  }, [])

  const signOut = useCallback(async () => {
    await clearToken()
    setMe(null)
    setStatus('guest')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, role: me?.role ?? null, refresh, signOut }),
    [status, me, refresh, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}
