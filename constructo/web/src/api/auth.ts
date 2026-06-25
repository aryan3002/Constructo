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
import { StepUpRequiredError } from './errors'
export { StepUpRequiredError } from './errors'

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
  | 'architect'
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

/** The homeowner-member row minted for a Client invite (mobile join-code flow). */
export interface HomeownerMemberInvite {
  id: string
  site_id: string
  phone: string | null
  display_name: string | null
  join_code: string
  invite_link: string
  status: string
}

export interface InviteAcceptResult {
  token: string
  role: Role
  landing: string
}

/** A company teammate (Setup & Admin → Team & roles, W4.3). */
export interface TeamMember {
  id: string
  company_id: string
  name: string | null
  phone: string
  role: Role
  is_active: boolean
}

/** Owner-only edit to a teammate (partial). */
export type TeamMemberUpdate = { role?: Role; is_active?: boolean }

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

/** The company profile (W4.2 — name + tracking-only GST / address / tz / currency). */
export interface Company {
  id: string
  name: string
  gstin: string | null
  address: string | null
  timezone: string
  currency: string
  logo_url: string | null
}

/** Fields the owner may patch (partial — only provided ones change). */
export type CompanyUpdate = Partial<
  Pick<Company, 'name' | 'gstin' | 'address' | 'timezone' | 'currency'>
> & { logo_key?: string | null }

/** Direct-to-R2 logo upload ticket. */
export interface LogoPresign {
  key: string
  put_url: string | null
  upload_mode: 'presigned' | 'unavailable'
}

/** Company billing-tracking record (Setup & Admin → Billing, W4.8). Tracking-only. */
export interface CompanyBilling {
  plan: string | null
  billing_email: string | null
  billing_contact: string | null
  notes: string | null
}

/** Dev-only mutable company so the no-backend admin tour reads + saves. */
const mockCompany: Company = {
  id: 'mock-co',
  name: 'Demo Construction Co',
  gstin: null,
  address: null,
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  logo_url: null,
}

/** Dev-only mutable team so the no-backend Team & roles tour edits in place. */
const mockTeam: TeamMember[] = [
  // id matches the mock `me()` so the no-backend tour shows the self-lock + "You".
  { id: 'mock-user', company_id: 'mock-co', name: 'Demo Owner', phone: '+919800000001', role: 'owner', is_active: true },
  { id: 'u-pm', company_id: 'mock-co', name: 'Anita Rao', phone: '+919800000002', role: 'pm', is_active: true },
  { id: 'u-acc', company_id: 'mock-co', name: 'Ravi Kumar', phone: '+919800000003', role: 'accountant', is_active: true },
  { id: 'u-sup', company_id: 'mock-co', name: 'Suresh Patel', phone: '+919800000004', role: 'supervisor', is_active: false },
]

/** Dev-only mutable billing record so the no-backend admin tour saves. */
const mockBilling: CompanyBilling = {
  plan: 'Pilot',
  billing_email: null,
  billing_contact: null,
  notes: null,
}

export const authApi = {
  /** Request a login code (no-op in dev; OTP stays 000000). Powers resend. */
  requestOtp(phone: string): Promise<{ sent: boolean; dev_otp: string | null }> {
    if (USE_MOCKS) {
      return Promise.resolve({ sent: true, dev_otp: '000000' })
    }
    return call('/api/v1/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    })
  },

  /** Phone+OTP login. Stores and returns the JWT. */
  async login(phone: string, otp: string): Promise<string> {
    if (USE_MOCKS) {
      if (otp !== '000000') throw new ApiError(401, 'invalid_otp')
      const token = `mock-token-${phone}`
      setToken(token)
      
      // Determine mock role based on the phone number entered
      let role: Role = 'owner'
      if (phone.includes('9800000002') || phone.includes('pm')) role = 'pm'
      else if (phone.includes('9800000003') || phone.includes('accountant')) role = 'accountant'
      else if (phone.includes('9800000004') || phone.includes('supervisor')) role = 'supervisor'
      
      try {
        localStorage.setItem('cstk.mock.role', role)
        localStorage.setItem('cstk.mock.phone', phone)
      } catch {
        /* ignore private mode */
      }
      return token
    }
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
      const phone =
        (typeof localStorage !== 'undefined' &&
          localStorage.getItem('cstk.mock.phone')) ||
        '+919800000001'
      return Promise.resolve({
        id: 'mock-user',
        company_id: 'mock-co',
        name: role === 'owner' ? 'Demo Owner' : role === 'pm' ? 'Anita Rao' : role === 'accountant' ? 'Ravi Kumar' : 'Suresh Patel',
        phone,
        role,
        language: 'en',
      })
    }
    return call('/api/v1/auth/me')
  },

  landing(): Promise<LandingInfo> {
    if (USE_MOCKS) {
      const role =
        (typeof localStorage !== 'undefined' &&
          (localStorage.getItem('cstk.mock.role') as Role | null)) ||
        'owner'
      // IA "where do I land" key: brief | today | capture | reconcile | attendance | approvals
      const landing = role === 'owner' ? 'brief' : role === 'pm' ? 'today' : role === 'supervisor' ? 'capture' : 'brief'
      return Promise.resolve({
        role,
        landing,
      })
    }
    return call('/api/v1/auth/me/landing')
  },

  /** Patch profile / preferred UI language (PATCH /api/v1/users/me). */
  updateProfile(patch: { name?: string; language?: Language }): Promise<Me> {
    if (USE_MOCKS) {
      const role =
        (typeof localStorage !== 'undefined' &&
          (localStorage.getItem('cstk.mock.role') as Role | null)) ||
        'owner'
      const phone =
        (typeof localStorage !== 'undefined' &&
          localStorage.getItem('cstk.mock.phone')) ||
        '+919800000001'
      return Promise.resolve({
        id: 'mock-user',
        company_id: 'mock-co',
        name: patch.name ?? 'Demo Owner',
        phone,
        role,
        language: patch.language ?? 'en',
      })
    }
    return call('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  // ---- owner first-run ----

  /** Read the caller's company profile (GET /api/v1/auth/company). */
  getCompany(): Promise<Company> {
    if (USE_MOCKS) {
      return Promise.resolve({ ...mockCompany })
    }
    return call('/api/v1/auth/company')
  },

  /** Patch the company profile (PATCH /api/v1/auth/company, owner-only). */
  updateCompany(patch: CompanyUpdate): Promise<Company> {
    if (USE_MOCKS) {
      Object.assign(mockCompany, patch)
      return Promise.resolve({ ...mockCompany })
    }
    return call('/api/v1/auth/company', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  /** Owner first-run convenience: name your company (patches just `name`). */
  renameCompany(name: string): Promise<Company> {
    return authApi.updateCompany({ name })
  },

  /** Mint a direct-to-R2 upload ticket for the company logo (owner-only). */
  presignCompanyLogo(opts: { content_type: string }): Promise<LogoPresign> {
    if (USE_MOCKS) {
      return Promise.resolve({ key: 'branding/mock/logo.png', put_url: null, upload_mode: 'unavailable' })
    }
    return call('/api/v1/auth/company/logo/presign', {
      method: 'POST',
      body: JSON.stringify(opts),
    })
  },

  /** Read the company billing-tracking record (GET /api/v1/billing). */
  getBilling(): Promise<CompanyBilling> {
    if (USE_MOCKS) return Promise.resolve({ ...mockBilling })
    return call('/api/v1/billing')
  },

  /** Update billing tracking (PUT /api/v1/billing, owner-only). */
  updateBilling(patch: Partial<CompanyBilling>): Promise<CompanyBilling> {
    if (USE_MOCKS) {
      Object.assign(mockBilling, patch)
      return Promise.resolve({ ...mockBilling })
    }
    return call('/api/v1/billing', { method: 'PUT', body: JSON.stringify(patch) })
  },

  /** Create the first site (name + type only — we learn the rest). */
  createSite(body: { name: string; type: string }): Promise<{ id: string; name: string }> {
    if (USE_MOCKS) {
      return Promise.resolve({ id: `mock-site-${Date.now()}`, name: body.name })
    }
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
    if (USE_MOCKS) {
      return Promise.resolve({
        id: `mock-invite-${Date.now()}`,
        company_id: 'mock-co',
        phone: body.phone,
        role: body.role,
        name: body.name ?? null,
        status: 'pending',
        token: `mock-token-${Date.now()}`,
        created_at: new Date().toISOString(),
      })
    }
    return call('/api/v1/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  listInvites(): Promise<Invite[]> {
    if (USE_MOCKS) {
      return Promise.resolve([])
    }
    return call('/api/v1/invites')
  },

  /**
   * Invite the Client (homeowner) for a site. The homeowner is NOT a contractor
   * web role — they redeem a join code in the mobile app — so this hits the
   * site-scoped homeowner-member endpoint (mints a member + join code), not the
   * contractor `/invites` flow. Returns the join code + `constructo://` deep link.
   */
  inviteClient(body: {
    siteId: string
    phone?: string
    name?: string
  }): Promise<HomeownerMemberInvite> {
    if (USE_MOCKS) {
      return Promise.resolve({
        id: `mock-client-${Date.now()}`,
        site_id: body.siteId,
        phone: body.phone ?? null,
        display_name: body.name ?? null,
        join_code: '123456',
        invite_link: 'constructo://join/123456',
        status: 'pending',
      })
    }
    return call('/api/v1/homeowner/members', {
      method: 'POST',
      body: JSON.stringify({
        site_id: body.siteId,
        sub_role: 'primary_owner',
        phone: body.phone || undefined,
        display_name: body.name || undefined,
      }),
    })
  },

  /** Public pre-login peek at an invite for the join screen. */
  previewInvite(token: string): Promise<InvitePreview> {
    if (USE_MOCKS) {
      return Promise.resolve({
        role: 'pm',
        company_name: 'Demo Construction Co',
        name: 'Demo Team Member',
        status: 'pending',
      })
    }
    return call(`/api/v1/invites/${encodeURIComponent(token)}`)
  },

  /** Accept an invite (caller must be logged in); stores the fresh JWT. */
  async acceptInvite(token: string): Promise<InviteAcceptResult> {
    if (USE_MOCKS) {
      setToken('mock-jwt-token')
      return { token: 'mock-jwt-token', role: 'pm', landing: 'today' }
    }
    const resp = await call<InviteAcceptResult>(
      `/api/v1/invites/${encodeURIComponent(token)}/accept`,
      { method: 'POST' },
    )
    setToken(resp.token)
    return resp
  },

  // ---- team (W4.3) ----

  /** List the company's members (GET /api/v1/users → first page). */
  async listTeam(): Promise<TeamMember[]> {
    if (USE_MOCKS) return mockTeam.map((m) => ({ ...m }))
    const page = await call<{ items: TeamMember[]; next_cursor: string | null }>(
      '/api/v1/users',
    )
    return page.items
  },

  /**
   * Change a teammate's role / active status (PATCH /api/v1/users/{id}).
   *
   * Sensitive changes (deactivating a user or assigning a privileged role) require
   * a fresh step-up token in `X-Step-Up-Token`. When the server responds with
   * 403 `step_up_required` this method throws `StepUpRequiredError` so the caller
   * can run the OTP flow and retry with a token.
   */
  async updateTeamMember(
    id: string,
    patch: TeamMemberUpdate,
    stepUpToken?: string,
  ): Promise<TeamMember> {
    if (USE_MOCKS) {
      const m = mockTeam.find((x) => x.id === id)
      if (!m) return Promise.reject(new ApiError(404, 'User not found'))
      // Mirror the real gate in dev: deactivation or privileged role → demand step-up.
      const PRIVILEGED_ROLES: Role[] = ['owner', 'pm', 'accountant', 'procurement']
      const isSensitive =
        patch.is_active === false ||
        (patch.role !== undefined && PRIVILEGED_ROLES.includes(patch.role))
      if (isSensitive && !stepUpToken) throw new StepUpRequiredError()
      Object.assign(m, patch)
      return Promise.resolve({ ...m })
    }
    const headers = new Headers({ 'Content-Type': 'application/json' })
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (stepUpToken) headers.set('X-Step-Up-Token', stepUpToken)

    const res = await fetch(
      `${API_BASE}/api/v1/users/${encodeURIComponent(id)}`,
      { method: 'PATCH', headers, body: JSON.stringify(patch) },
    )
    if (res.status === 403) {
      let code = ''
      try {
        const body = await res.json()
        code = body?.error?.code ?? ''
      } catch {
        /* non-JSON */
      }
      if (code === 'step_up_required') throw new StepUpRequiredError()
      throw new ApiError(403, 'Forbidden')
    }
    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = await res.json()
        detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
      } catch {
        /* non-JSON */
      }
      throw new ApiError(res.status, detail)
    }
    return (await res.json()) as TeamMember
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
