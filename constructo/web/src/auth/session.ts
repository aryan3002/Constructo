// The signed-in session's two endings, in one place:
//   - signOut(): sends any money action still in its undo window, revokes the
//     token on the server, then forgets it and everything cached for it;
//   - an expired or revoked token: any API call answered 401 invalid_token /
//     not_authenticated ends the session the same way and sends the person to
//     /login with "Your session ended", keeping where they were in `?next`.
// Public pages (/login, /join, /delete-account, /vendor-confirm) never redirect.
import { API_BASE } from '../api/config'
import { authApi, clearToken } from '../api/auth'
import { queryClient } from '../api/queryClient'
import { flushPending } from '../features/owner/pendingDecisions'

/** Set when a session ends on its own; /login reads it once to say so. */
export const SESSION_ENDED_KEY = 'constructo.session_ended'

/** Storage that belongs to the person signed in, removed when they leave. */
const PER_USER_KEYS = ['cstk.capture.queue']

const PUBLIC_PREFIXES = ['/login', '/join', '/delete-account', '/vendor-confirm', '/components']

/** The 401 codes that mean "this token no longer works" (not a wrong OTP). */
const ENDED_CODES = new Set(['invalid_token', 'not_authenticated'])

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** A same-app path to return to after sign-in, or null (no open redirects). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null
  return next
}

type Navigate = (to: string) => void
let navigateTo: Navigate = (to) => window.location.assign(to)

/** The router's navigate, registered by <SessionGuard> (falls back to a reload). */
export function setSessionNavigator(fn: Navigate | null): void {
  navigateTo = fn ?? ((to) => window.location.assign(to))
}

/** Forget the token and everything cached or stored for this person. */
export function clearSession(): void {
  clearToken()
  queryClient.cancelQueries()
  queryClient.clear()
  for (const key of PER_USER_KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* storage unavailable */
    }
  }
}

/** Sign out: send pending money actions, revoke the token, clear the session. */
export async function signOut(): Promise<void> {
  await flushPending()
  try {
    await authApi.logout()
  } catch {
    /* the token is forgotten either way */
  }
  clearSession()
}

let ending = false

/** The token stopped working: clear it and go to sign-in (not on public pages). */
export function endExpiredSession(): void {
  const { pathname, search } = window.location
  if (isPublicPath(pathname) || ending) return
  ending = true
  clearSession()
  try {
    sessionStorage.setItem(SESSION_ENDED_KEY, '1')
  } catch {
    /* the redirect still happens */
  }
  const next = encodeURIComponent(`${pathname}${search}`)
  navigateTo(`/login?next=${next}`)
  ending = false
}

/** Read (and clear) the "session ended" flag for the sign-in screen. */
export function takeSessionEnded(): boolean {
  try {
    const ended = sessionStorage.getItem(SESSION_ENDED_KEY) === '1'
    sessionStorage.removeItem(SESSION_ENDED_KEY)
    return ended
  } catch {
    return false
  }
}

function sentToken(input: RequestInfo | URL, init?: RequestInit): boolean {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  )
  return headers.has('Authorization')
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

/**
 * Wrap `fetch` once so every API module's 401 is handled here, whichever
 * helper made the call. A 401 with another code (a wrong OTP) is left to the
 * caller.
 */
export function installSessionGuard(target: { fetch: typeof fetch } = window): void {
  const original = target.fetch.bind(target)
  target.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await original(input, init)
    if (res.status === 401 && urlOf(input).startsWith(API_BASE) && sentToken(input, init)) {
      try {
        const body = await res.clone().json()
        if (ENDED_CODES.has(body?.error?.code)) endExpiredSession()
      } catch {
        /* not our envelope */
      }
    }
    return res
  }
}
