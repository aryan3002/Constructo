/**
 * Pure auth helpers shared by every signed-out screen (and the welcome gate).
 *
 *   - Phone shaping: the UI shows a fixed `+91` chip and the user types 10
 *     digits; the API always receives E.164 (`+91XXXXXXXXXX`).
 *   - `mapAuthError`: turns a backend `ApiError` into a friendly sentence PLUS
 *     a next step (spec §6) — raw backend strings never reach the user.
 *   - `homeFor`: the one role → home-route map (index, login, welcome share it).
 *
 * No React, no RN imports — this file is fully unit-tested.
 */
import { ApiError } from '../api/client'
import type { Role } from '../api/types'
import type { GuideSectionId } from './guide.content'

// ─── Phone ──────────────────────────────────────────────────────────────────

/**
 * Keep only digits, drop a leading `91` country code or `0` trunk prefix when
 * the user pasted a longer form, and cap at 10 digits (an Indian mobile).
 */
export function digitsOnly(input: string): string {
  let d = input.replace(/\D/g, '')
  if (d.length > 10 && d.startsWith('91')) d = d.slice(2)
  if (d.length > 10 && d.startsWith('0')) d = d.slice(1)
  return d.slice(0, 10)
}

/** `9876543210` → `98765 43210` (the grouping Indians read numbers in). */
export function formatIndianMobile(digits: string): string {
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)} ${digits.slice(5)}`
}

/** Exactly 10 digits, first digit 6–9 (the Indian mobile numbering plan). */
export function isValidIndianMobile(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits)
}

export function toE164(digits: string): string {
  return `+91${digits}`
}

/** `+919876543210` → `+91 98765 43210` for "we texted a code to …" lines. */
export function maskPhone(phone: string): string {
  const m = phone.replace(/\s/g, '').match(/^(?:\+?91)?([6-9]\d{9})$/)
  if (!m) return phone
  return `+91 ${formatIndianMobile(m[1])}`
}

// ─── Errors → guidance ──────────────────────────────────────────────────────

export type AuthErrorAction =
  | 'useJoinCode'
  | 'signIn'
  | 'help'
  | 'retry'
  | 'changeNumber'
  | 'backToCode'

export interface AuthErrorView {
  message: string
  action?: AuthErrorAction
  /** When `action === 'help'`, the guide section to open. */
  helpSection?: GuideSectionId
}

type Translate = (key: string) => string

const CODE_MAP: Record<string, Omit<AuthErrorView, 'message'> & { key: string }> = {
  invalid_otp: { key: 'auth.err.invalid_otp', action: 'retry' },
  not_allowed: { key: 'auth.err.not_allowed', action: 'help', helpSection: 'notEnabled' },
  deactivated: { key: 'auth.err.deactivated', action: 'changeNumber' },
  invalid_code: { key: 'auth.err.invalid_code', action: 'backToCode' },
  not_found: { key: 'auth.err.not_found', action: 'backToCode' },
  already_claimed: { key: 'auth.err.already_claimed', action: 'signIn' },
  phone_mismatch: { key: 'auth.err.phone_mismatch', action: 'changeNumber' },
}

export function mapAuthError(err: unknown, t: Translate): AuthErrorView {
  if (err instanceof ApiError) {
    const hit = CODE_MAP[err.code]
    if (hit) {
      const { key, ...rest } = hit
      return { message: t(key), ...rest }
    }
    return { message: t('auth.err.generic'), action: 'retry' }
  }
  // fetch rejects with a TypeError when the network is unreachable.
  if (err instanceof TypeError) {
    return { message: t('auth.err.network'), action: 'retry' }
  }
  return { message: t('auth.err.generic'), action: 'retry' }
}

// ─── Role → home ────────────────────────────────────────────────────────────

/**
 * Role → home route. We navigate to the resolved home DIRECTLY rather than
 * `router.replace('/')`: from inside the `(auth)` Stack a bare `'/'` resolves to
 * that group's own `index` (the front door) — the bounce we're avoiding.
 */
export function homeFor(role: Role | null): string {
  switch (role) {
    case 'owner':
      return '/(contractor)/owner/brief'
    case 'pm':
      return '/(contractor)/pm/dpr'
    case 'supervisor':
      return '/(contractor)/supervisor/home'
    case 'architect':
      return '/(contractor)/architect/home'
    case 'accountant':
      return '/(contractor)/accountant/reconcile'
    case 'labor_contractor':
      return '/(contractor)/mukadam/attendance'
    case 'homeowner':
      return '/(homeowner)/home'
    default:
      // procurement (Tier-2 placeholder) and any future role
      return '/(contractor)'
  }
}

/** AsyncStorage key for the once-per-user builder welcome tour. */
export function welcomeKey(userId: string): string {
  return `neev.welcome.${userId}`
}
