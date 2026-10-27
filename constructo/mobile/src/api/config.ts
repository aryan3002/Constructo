/**
 * Runtime config, read from public env vars that Expo inlines at build time
 * (each `process.env.EXPO_PUBLIC_*` must stay a literal read for that). The
 * rules — dev fallbacks, and what a release build refuses to start without —
 * live in config.util.ts.
 */
import { resolveConfig } from './config.util'

const CONFIG = resolveConfig(
  {
    apiBase: process.env.EXPO_PUBLIC_API_BASE,
    webBase: process.env.EXPO_PUBLIC_WEB_BASE,
    privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL,
  },
  typeof __DEV__ === 'undefined' ? false : __DEV__,
)

/** API base. In dev, falls back to the Android-emulator host loopback. */
export const API_BASE: string = CONFIG.apiBase

/**
 * Public web app base — where invite (`/join/:token`) and vendor-confirm
 * (`/vendor-confirm/:token`) links resolve. Set `EXPO_PUBLIC_WEB_BASE` to the
 * deployed web console; falls back to the API host.
 */
export const WEB_BASE: string = CONFIG.webBase

/** Privacy policy and terms pages (store requirement, S7). */
export const PRIVACY_URL: string = CONFIG.privacyUrl
export const TERMS_URL: string = CONFIG.termsUrl

/** Env vars this release build is missing; the app shows a blocking screen
 *  naming them instead of starting. Always empty in development. */
export const MISSING_RELEASE_CONFIG: readonly string[] = CONFIG.missing

/**
 * WebSocket base for the live chat socket (spine A9). Derived from {@link API_BASE}
 * by swapping the http(s) scheme for ws(s) and appending the chat WS path. The
 * socket carries a single-use ticket in the query string (the JWT never rides a URL).
 */
export const CHAT_WS_URL: string = `${API_BASE.replace(/^http/, 'ws')}/api/v1/chat/ws`

/** Local calendar date (NOT UTC) as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
