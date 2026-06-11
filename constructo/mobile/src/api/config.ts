/**
 * Runtime config. The API base is read from the public env var
 * `EXPO_PUBLIC_API_BASE` (inlined at build time by Expo). Falls back to the
 * Android-emulator host loopback in dev.
 */
export const API_BASE: string = (
  process.env.EXPO_PUBLIC_API_BASE ?? 'http://10.0.2.2:8000'
).replace(/\/$/, '')

/**
 * Public web app base — where vendor-facing links (e.g. the no-install confirm
 * page `/vendor-confirm/:token`) resolve. Set `EXPO_PUBLIC_WEB_BASE` to the
 * deployed web URL; falls back to the API host in dev.
 */
export const WEB_BASE: string = (
  process.env.EXPO_PUBLIC_WEB_BASE ?? API_BASE
).replace(/\/$/, '')

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
