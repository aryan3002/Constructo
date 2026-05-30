/**
 * Runtime config. The API base is read from the public env var
 * `EXPO_PUBLIC_API_BASE` (inlined at build time by Expo). Falls back to the
 * Android-emulator host loopback in dev.
 */
export const API_BASE: string = (
  process.env.EXPO_PUBLIC_API_BASE ?? 'http://10.0.2.2:8000'
).replace(/\/$/, '')

/** Local calendar date (NOT UTC) as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
