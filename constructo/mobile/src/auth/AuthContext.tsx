/**
 * Session state. On mount it reads any stored JWT and resolves the current user
 * (`/auth/me`) to learn their role — which the root layout uses to branch the
 * navigation (homeowner → Daylight tabs, contractor → Neev shell).
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
import { registerDevicePushToken } from '../push/register'
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
  /** Re-resolve the session from the stored token. Returns the profile on
   *  success (so callers can navigate deterministically) or null if unauthed. */
  refresh: () => Promise<Me | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [subRole, setSubRole] = useState<HomeownerSubRole | null>(null)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [onboarded, setOnboarded] = useState(false)

  const refresh = useCallback(async (): Promise<Me | null> => {
    const token = await getToken()
    if (!token) {
      setMe(null)
      setSubRole(null)
      setSiteId(null)
      setStatus('guest')
      return null
    }

    // AUTH is decided SOLELY by /auth/me. This is the ONLY place that may set
    // 'guest' after we have a token — a genuine auth failure (401) or a network
    // error fetching the profile.
    let profile: Me
    try {
      profile = await authApi.me()
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) await clearToken()
      setMe(null)
      setSubRole(null)
      setSiteId(null)
      setStatus('guest')
      return null
    }

    setMe(profile)
    setStatus('authed')
    // Register this device's push token (contractor's only token path). Fire-
    // and-forget; fully insulated, never affects the session.
    if (profile.role !== 'homeowner') void registerDevicePushToken()

    // Best-effort restore of persisted sub_role / site_id / onboarded. This MUST
    // NOT be able to demote an already-authenticated session: a flaky
    // AsyncStorage read (seen in Expo Go SDK 54 + new architecture) used to throw
    // here and the old outer catch logged the user straight back out to the
    // chooser. Isolated in its own try so it can only ever ADD context.
    try {
      const [persistedSubRole, persistedSiteId, persistedOnboarded] = await Promise.all([
        AsyncStorage.getItem(SUB_ROLE_KEY),
        AsyncStorage.getItem(SITE_ID_KEY),
        AsyncStorage.getItem(ONBOARDED_KEY),
      ])
      if (persistedSubRole) setSubRole(persistedSubRole as HomeownerSubRole)
      if (persistedSiteId) setSiteId(persistedSiteId)
      if (persistedOnboarded === '1') setOnboarded(true)
      // A homeowner needs BOTH sub_role and site_id client-side after a token-based
      // relaunch. site_id is the one that bites: it powers the get-or-create of her
      // 1:1 builder channel, so without it the channel never appears in Messages.
      // Neither rides on /auth/me, so when either is missing we resolve them from
      // capabilities (which now returns the resolved site_id) and persist for next
      // launch. Isolated + best-effort — this can only ADD context, never demote.
      if (profile.role === 'homeowner' && (!persistedSubRole || !persistedSiteId)) {
        const caps: Capabilities = await homeowner.capabilities(persistedSiteId ?? undefined)
        if (!persistedSubRole) {
          setSubRole(caps.sub_role)
          await AsyncStorage.setItem(SUB_ROLE_KEY, caps.sub_role)
        }
        if (!persistedSiteId && caps.site_id) {
          setSiteId(caps.site_id)
          await AsyncStorage.setItem(SITE_ID_KEY, caps.site_id)
        }
      }
    } catch {
      /* best-effort context restore — never demotes the authed session */
    }
    return profile
  }, [])

  const setJoinData = useCallback(async (sr: HomeownerSubRole, sid: string) => {
    // In-memory first — the session works even if the device store is flaky.
    setSubRole(sr)
    setSiteId(sid)
    try {
      await Promise.all([
        AsyncStorage.setItem(SUB_ROLE_KEY, sr),
        AsyncStorage.setItem(SITE_ID_KEY, sid),
      ])
    } catch {
      /* persistence is best-effort — a failed write must not break the join */
    }
  }, [])

  const markOnboarded = useCallback(async () => {
    setOnboarded(true)
    try {
      await AsyncStorage.setItem(ONBOARDED_KEY, '1')
    } catch {
      /* best-effort */
    }
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
