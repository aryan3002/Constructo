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
  useRef,
  useState,
  type ReactNode,
} from 'react'
import NetInfo from '@react-native-community/netinfo'
import { useRouter } from 'expo-router'

import { authApi } from '../api/auth'
import { homeowner, setUnauthorizedHandler } from '../api/client'
import {
  persistPushToken,
  registerDevicePushToken,
  registerForPushNotificationsAsync,
} from '../push/register'
import type { Capabilities, HomeownerSubRole, Me, Role } from '../api/types'
import { getToken } from '../store/secure'
import { syncLanguageWithServer } from '../i18n/activeLang'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useQueryClient } from '@tanstack/react-query'
import { meFailureKind } from './auth.util'
import { clearQueuedWork, resetSession, SESSION_ME_KEY, SESSION_USER_KEY } from './resetSession'
import { migrateLegacyOutbox } from '../offline/outbox'
import { activateOutboxFor } from '../offline/useOutbox'

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
  /** True after an expired login signed the user out (the sign-in screen says
   *  so); cleared by the next successful sign-in. */
  sessionExpired: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [me, setMe] = useState<Me | null>(null)
  const [subRole, setSubRole] = useState<HomeownerSubRole | null>(null)
  const [siteId, setSiteId] = useState<string | null>(null)
  const [onboarded, setOnboarded] = useState(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  const queryClient = useQueryClient()
  const router = useRouter()
  const statusRef = useRef<Status>('loading')
  statusRef.current = status
  const meRef = useRef<Me | null>(null)
  meRef.current = me
  // Set when the session is running on the cached profile (offline / server
  // error at cold start) — re-checked when connectivity returns.
  const needsRecheck = useRef(false)
  const expiring = useRef(false)

  const clearSessionState = useCallback(() => {
    setMe(null)
    setSubRole(null)
    setSiteId(null)
    setStatus('guest')
  }, [])

  // The login is no longer valid (any API call got a 401 for the stored
  // token). Forget the session but keep the queued messages/captures for when
  // the same person signs back in, then go to sign-in with a short note.
  const expireSession = useCallback(async () => {
    if (expiring.current) return
    expiring.current = true
    try {
      const wasAuthed = statusRef.current === 'authed'
      await resetSession({ queryClient, keepQueued: true })
      setOnboarded(false)
      setSessionExpired(true)
      clearSessionState()
      if (wasAuthed) router.replace('/(auth)')
    } finally {
      expiring.current = false
    }
  }, [queryClient, router, clearSessionState])

  useEffect(() => {
    setUnauthorizedHandler(() => void expireSession())
    return () => setUnauthorizedHandler(null)
  }, [expireSession])

  const refresh = useCallback(async (): Promise<Me | null> => {
    const token = await getToken()
    if (!token) {
      setMe(null)
      setSubRole(null)
      setSiteId(null)
      setStatus('guest')
      return null
    }

    // AUTH is decided SOLELY by /auth/me. A 401 ends the session (via the
    // client's unauthorized handler); a network / timeout / 5xx failure keeps
    // it on the last known profile.
    let profile: Me
    try {
      profile = await authApi.me()
      needsRecheck.current = false
    } catch (err) {
      const kind = meFailureKind(err)
      if (kind === 'unreachable') {
        // Offline / timeout / 5xx says nothing about the login: keep the
        // session on the last known profile and re-check once back online.
        needsRecheck.current = true
        if (statusRef.current === 'authed') return meRef.current
        try {
          const raw = await AsyncStorage.getItem(SESSION_ME_KEY)
          const cached = raw ? (JSON.parse(raw) as Me) : null
          if (cached) {
            // Offline cold start: the person's queued captures are theirs.
            activateOutboxFor(cached.id)
            setMe(cached)
            setStatus('authed')
            return cached
          }
        } catch {
          /* no usable cached profile */
        }
      }
      // A 401 already ran expireSession() through the client's handler.
      clearSessionState()
      return null
    }

    // A different person signed in on this phone: unsent chat messages belong
    // to the previous user (kept across an expired login) and must not post
    // under this one. Captures sit in per-user queues, so the previous user's
    // stay put (sent when they sign back in) and only this user's queue drains.
    // Runs before `me` is set, i.e. before any drain.
    try {
      const previousUser = await AsyncStorage.getItem(SESSION_USER_KEY)
      if (previousUser && previousUser !== profile.id) await clearQueuedWork()
      // First run after per-user queues: the old global queue belongs to the
      // session's user (Batch B cleared it on every switch of user).
      await migrateLegacyOutbox(previousUser ?? profile.id)
      await AsyncStorage.multiSet([
        [SESSION_USER_KEY, profile.id],
        [SESSION_ME_KEY, JSON.stringify(profile)],
      ])
    } catch {
      /* best-effort */
    }

    activateOutboxFor(profile.id)
    setMe(profile)
    setStatus('authed')
    setSessionExpired(false)
    // The language saved on the server wins (a reinstall keeps Hindi), unless
    // this phone has a choice the server hasn't heard yet. Best-effort.
    void syncLanguageWithServer(profile.language).catch(() => undefined)
    // Register this device's push token. Fire-and-forget; fully insulated, never
    // affects the session. A homeowner also stashes the token in their member
    // notif_prefs (the path notify_site_homeowners reads); a contractor only has
    // the users-row path.
    if (profile.role !== 'homeowner') {
      void registerDevicePushToken()
    } else {
      void (async () => {
        const tok = await registerForPushNotificationsAsync()
        if (tok) {
          void persistPushToken(tok)
          void registerDevicePushToken(tok)
        }
      })()
    }

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
  }, [clearSessionState])

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
    await resetSession({ queryClient })
    setOnboarded(false)
    setSessionExpired(false)
    clearSessionState()
  }, [queryClient, clearSessionState])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Cold start ran on the cached profile → confirm it with the server as soon
  // as the network is back (a 401 then signs out via the client handler).
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        if (s.isConnected && needsRecheck.current) void refresh()
      }),
    [refresh],
  )

  const value = useMemo<AuthContextValue>(
    () => ({ status, me, role: me?.role ?? null, subRole, siteId, onboarded, setJoinData, markOnboarded, refresh, signOut, sessionExpired }),
    [status, me, subRole, siteId, onboarded, setJoinData, markOnboarded, refresh, signOut, sessionExpired],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>')
  return ctx
}
