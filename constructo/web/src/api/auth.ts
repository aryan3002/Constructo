// Auth API layer for Constructo.
//
// The token-storage helpers (getToken/setToken/clearToken/isAuthenticated) are
// the original, frozen surface — `api/client.ts` and `i18n` import them and
// their signatures MUST NOT change. Below them this file is EXTENDED with the
// auth/onboarding/profile network calls (phone+OTP login, team invites,
// profile + language update, role-landing lookup). Those reuse `API_BASE`
// (../api/config) and `ApiError` (./client) by import only.

import { API_BASE, USE_MOCKS } from './config'
import { ApiError } from './client'

// ---------------------------------------------------------------------------
// Token storage. Token persists in localStorage so a refresh keeps you signed in.
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'constructo.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore (e.g. private mode) */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function isAuthenticated(): boolean {
  return Boolean(getToken())
}

// ---------------------------------------------------------------------------
// Shared types (mirror the backend JSON shapes — snake_case).
// ---------------------------------------------------------------------------

export type Role =
  | 'owner'
  | 'pm'
  | 'supervisor'
  | 'accountant'
  | 'procurement'
  | 'labor_contractor'

export type Language = 'en' | 'hi'

export interface Me {
  id: string
  company_id: string
  name: string | null
  phone: string
  role: Role
  language: Language | null
}

export interface LandingInfo {
  role: Role
  /** IA "where do I land" key: brief | capture | reconcile | attendance | orders. */
  landing: string
}

export interface Invite {
  id: string
  company_id: string
  phone: string
  role: Role
  name: string | null
  status: 'pending' | 'accepted' | 'revoked'
  token: string
  created_at: string
}

export interface InvitePreview {
  role: Role
  company_name: string
  name: string | null
  status: 'pending' | 'accepted' | 'revoked'
}

export interface InviteAcceptResult {
  token: string
  role: Role
  landing: string
}

// ---------------------------------------------------------------------------
// Internal fetch helper. Mirrors api/client.request but lives here so the auth
// surface stays self-contained; reuses the shared ApiError envelope.
// ---------------------------------------------------------------------------

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// Auth + onboarding + profile API.
// ---------------------------------------------------------------------------

export const authApi = {
  /** Request a login code (no-op in dev; OTP stays 000000). Powers resend. */
  requestOtp(phone: string): Promise<{ sent: boolean; dev_otp: string | null }> {
    return call('/api/v1/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    })
  },

  /** Phone+OTP login. Stores and returns the JWT. */
  async login(phone: string, otp: string): Promise<string> {
    const resp = await call<{ token: string }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    })
    setToken(resp.token)
    return resp.token
  },

  /**
   * Re-verify the current user with a fresh OTP to unlock a sensitive action
   * (e.g. Tally export). Returns a short-lived step-up token + its lifetime (s).
   */
  async stepUpVerify(otp: string): Promise<{ token: string; expiresIn: number }> {
    if (USE_MOCKS) {
      if (otp !== '000000') throw new ApiError(401, 'invalid_otp')
      return { token: 'mock-step-up', expiresIn: 300 }
    }
    const resp = await call<{ step_up_token: string; expires_in: number }>(
      '/api/v1/auth/step-up/verify',
      { method: 'POST', body: JSON.stringify({ otp }) },
    )
    return { token: resp.step_up_token, expiresIn: resp.expires_in }
  },

  me(): Promise<Me> {
    if (USE_MOCKS) {
      // Dev-only: lets capability-gated UI (e.g. the owner Approve chips) render
      // without a backend. Override the role via localStorage['cstk.mock.role'].
      const role =
        (typeof localStorage !== 'undefined' &&
          (localStorage.getItem('cstk.mock.role') as Role | null)) ||
        'owner'
      return Promise.resolve({
        id: 'mock-user',
        company_id: 'mock-co',
        name: 'Demo Owner',
        phone: '+919800000001',
        role,
        language: 'en',
      })
    }
    return call('/api/v1/auth/me')
  },

  landing(): Promise<LandingInfo> {
    return call('/api/v1/auth/me/landing')
  },

  /** Patch profile / preferred UI language (PATCH /api/v1/users/me). */
  updateProfile(patch: { name?: string; language?: Language }): Promise<Me> {
    return call('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  // ---- owner first-run ----

  /** Owner first-run: name your company (PATCH /api/v1/auth/company). */
  renameCompany(name: string): Promise<{ id: string; name: string }> {
    return call('/api/v1/auth/company', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    })
  },

  /** Create the first site (name + type only — we learn the rest). */
  createSite(body: { name: string; type: string }): Promise<{ id: string; name: string }> {
    return call('/api/v1/sites', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  // ---- team invites ----

  createInvite(body: {
    phone: string
    role: Role
    name?: string
  }): Promise<Invite> {
    return call('/api/v1/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  listInvites(): Promise<Invite[]> {
    return call('/api/v1/invites')
  },

  /** Public pre-login peek at an invite for the join screen. */
  previewInvite(token: string): Promise<InvitePreview> {
    return call(`/api/v1/invites/${encodeURIComponent(token)}`)
  },

  /** Accept an invite (caller must be logged in); stores the fresh JWT. */
  async acceptInvite(token: string): Promise<InviteAcceptResult> {
    const resp = await call<InviteAcceptResult>(
      `/api/v1/invites/${encodeURIComponent(token)}/accept`,
      { method: 'POST' },
    )
    setToken(resp.token)
    return resp
  },
}

/**
 * Build a shareable WhatsApp/SMS join link for an invite token. Uses the
 * current web origin so the invitee opens the in-app join screen.
 */
export function inviteJoinUrl(token: string): string {
  const origin =
    typeof window !== 'undefined' && window.location
      ? window.location.origin
      : ''
  return `${origin}/join/${encodeURIComponent(token)}`
}

/** wa.me deep link prefilled with the join message (Hindi/Hinglish-friendly). */
export function whatsappShareUrl(phone: string, message: string): string {
  const digits = phone.replace(/[^\d]/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
