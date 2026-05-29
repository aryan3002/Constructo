// Centralised runtime config read from Vite env vars.

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8000'

export const USE_MOCKS: boolean =
  String(import.meta.env.VITE_USE_MOCKS).toLowerCase() === 'true'

export function todayIso(): string {
  // Local calendar date (NOT UTC). Using toISOString() here would return the
  // UTC date, which is a day ahead for users behind UTC in the evening, so the
  // dashboard would query briefs for the wrong day.
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
