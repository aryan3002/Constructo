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
import { ApiError, homeowner } from '../api/client'
import type { Capabilities, HomeownerSubRole, Me, Role } from '../api/types'
import { clearToken, getToken } from '../store/secure'
import AsyncStorage from '@react-native-async-storage/async-storage'

type Status = 'loading' | 'authed' | 'guest'

const ONBOARDED_KEY = 'constructo.onboarded'
const SITE_ID_KEY = 'constructo.site_id'
const SUB_ROLE_KEY = 'constructo.sub_role'

interface AuthContextValue {
  status: Status
  me: Me | null
  role: Role | null
  /** sub_role for homeowners — plumbed from JoinOut or GET /me/capabilities */
  subRole: HomeownerSubRole | null
  /** The primary site_id from join or capabilities */
  siteId: string | null
  /** True once the homeowner has completed or explicitly skipped onboarding */
  onboarded: boolean
  /** Called after a successful join to persist sub_role + site_id immediately */
  setJoinData: (subRole: HomeownerSubRole, siteId: string) => Promise<void>
  /** Mark onboarding complete (called from intake finish or skip) */
  markOnboarded: () => Promise<void>
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [subRole, setSubRole] = useState<HomeownerSubRole | null>(null)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [onboarded, setOnboarded] = useState(false)

  const refresh = useCallback(async () => {
    const token = await getToken()
    if (!token) {
      setMe(null)
      setSubRole(null)
      setSiteId(null)
      setStatus('guest')
      return
    }
    try {
      const profile = await authApi.me()
      setMe(profile)
      setStatus('authed')
      // Restore persisted sub_role + site_id if they exist.
      const [persistedSubRole, persistedSiteId, persistedOnboarded] = await Promise.all([
        AsyncStorage.getItem(SUB_ROLE_KEY),
        AsyncStorage.getItem(SITE_ID_KEY),
        AsyncStorage.getItem(ONBOARDED_KEY),
      ])
      if (persistedSubRole) setSubRole(persistedSubRole as HomeownerSubRole)
      if (persistedSiteId) setSiteId(persistedSiteId)
      if (persistedOnboarded === '1') setOnboarded(true)
      // For homeowners: if we don't have sub_role yet, pull from capabilities.
      if (profile.role === 'homeowner' && !persistedSubRole) {
        try {
          const caps: Capabilities = await homeowner.capabilities(persistedSiteId ?? undefined)
          setSubRole(caps.sub_role)
          if (persistedSiteId) setSiteId(persistedSiteId)
          await AsyncStorage.setItem(SUB_ROLE_KEY, caps.sub_role)
        } catch {
          /* capabilities fetch is best-effort */
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await clearToken()
      setMe(null)
      setSubRole(null)
      setSiteId(null)
      setStatus('guest')
    }
  }, [])

  const setJoinData = useCallback(async (sr: HomeownerSubRole, sid: string) => {
    setSubRole(sr)
    setSiteId(sid)
    await Promise.all([
      AsyncStorage.setItem(SUB_ROLE_KEY, sr),
      AsyncStorage.setItem(SITE_ID_KEY, sid),
    ])
  }, [])

  const markOnboarded = useCallback(async () => {
    setOnboarded(true)
    await AsyncStorage.setItem(ONBOARDED_KEY, '1')
  }, [])

  const signOut = useCallback(async () => {
    await clearToken()
    await AsyncStorage.multiRemove([ONBOARDED_KEY, SITE_ID_KEY, SUB_ROLE_KEY])
    setMe(null)
    setSubRole(null)
    setSiteId(null)
    setOnboarded(false)
    setStatus('guest')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, role: me?.role ?? null, subRole, siteId, onboarded, setJoinData, markOnboarded, refresh, signOut }),
    [status, me, subRole, siteId, onboarded, setJoinData, markOnboarded, refresh, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}
