// Centralised runtime config read from Vite env vars.

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ??
  'http://localhost:8000'

export const USE_MOCKS: boolean =
  String(import.meta.env.VITE_USE_MOCKS).toLowerCase() === 'true'

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}
