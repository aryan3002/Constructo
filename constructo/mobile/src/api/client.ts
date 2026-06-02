/**
 * Typed fetch client for the Constructo API. Attaches the stored JWT, unwraps
 * the `{error:{code,message}}` envelope into {@link ApiError}, and exposes a
 * small typed surface used by the homeowner screens (H2 extends `homeowner`).
 */
import { API_BASE } from './config'
import { getToken } from '../store/secure'
import type {
  Capabilities,
  ChangesLog,
  DesignConflict,
  DesignProfile,
  DesignReference,
  DesignSelection,
  Drawing,
  Home,
  HomeownerDecision,
  HomeownerJoinRequest,
  HomeownerJoinResponse,
  HomeownerMember,
  HomeownerRequest,
  HouseholdInviteRequest,
  MemberManageRequest,
  Me,
  Milestone,
  Paginated,
  Photo,
  Property,
  QuietPeriod,
  Update,
  WeeklySummary,
} from './types'

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, message: string, code = 'error') {
    super(message)
    this.status = status
    this.code = code
    this.name = 'ApiError'
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = await getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let message = res.statusText
    let code = 'http_error'
    try {
      const body = await res.json()
      message = body?.error?.message ?? body?.detail ?? body?.message ?? message
      code = body?.error?.code ?? code
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message, code)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

/** Homeowner-facing endpoints (see HOMEOWNER_H0.md). */
export const homeowner = {
  join: (body: HomeownerJoinRequest) =>
    request<HomeownerJoinResponse>('/api/v1/homeowner/join', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  me: () => request<Me>('/api/v1/auth/me'),
  members: () => request<HomeownerMember[]>('/api/v1/homeowner/members'),
  home: (siteId?: string) => request<Home>(`/api/v1/homeowner/home${qs({ site_id: siteId })}`),
  photos: (siteId?: string, view: 'all' | 'room' | 'milestone' = 'all') =>
    request<Paginated<Photo>>(`/api/v1/homeowner/photos${qs({ site_id: siteId, view })}`),
  updates: (siteId?: string) =>
    request<Paginated<Update>>(`/api/v1/homeowner/updates${qs({ site_id: siteId })}`),
  weeklySummary: (siteId?: string) =>
    request<WeeklySummary[]>(`/api/v1/homeowner/weekly-summary${qs({ site_id: siteId })}`),
  changes: (siteId?: string) =>
    request<ChangesLog>(`/api/v1/homeowner/changes${qs({ site_id: siteId })}`),
  milestones: (siteId?: string) =>
    request<Milestone[]>(`/api/v1/homeowner/milestones${qs({ site_id: siteId })}`),
  property: (siteId?: string) =>
    request<Property>(`/api/v1/homeowner/property${qs({ site_id: siteId })}`),
  designProfile: (siteId?: string) =>
    request<DesignProfile>(`/api/v1/homeowner/design/profile${qs({ site_id: siteId })}`),
  selections: (siteId?: string) =>
    request<DesignSelection[]>(`/api/v1/homeowner/design/selections${qs({ site_id: siteId })}`),
  /** Published drawings/plans for a property (newest first, read-only — C3). */
  drawings: (siteId?: string) =>
    request<Drawing[]>(`/api/v1/homeowner/drawings${qs({ site_id: siteId })}`),
  /** Attributed inspiration references for a site (survives reload — proposal C). */
  designReferences: (siteId?: string) =>
    request<DesignReference[]>(`/api/v1/homeowner/design/references${qs({ site_id: siteId })}`),
  references: (body: { image_url: string; room_tag?: string; source?: string; site_id?: string }) =>
    request<DesignReference>('/api/v1/homeowner/design/references', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Open "decide together" conflict cards (human-resolved — never AI-picked). */
  designConflicts: (siteId?: string) =>
    request<DesignConflict[]>(`/api/v1/homeowner/design/conflicts${qs({ site_id: siteId })}`),
  /** A human picks one choice to settle a conflict (no AI adjudication). */
  resolveDesignConflict: (body: {
    item: string
    choice: string
    space_id?: string
    site_id?: string
  }) =>
    request<DesignSelection>('/api/v1/homeowner/design/conflicts/resolve', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  requests: (siteId?: string) =>
    request<HomeownerRequest[]>(`/api/v1/homeowner/requests${qs({ site_id: siteId })}`),
  createRequest: (body: { title: string; detail?: string; site_id?: string }) =>
    request<HomeownerRequest>('/api/v1/homeowner/requests', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  decisions: (siteId?: string) =>
    request<HomeownerDecision[]>(`/api/v1/homeowner/decisions${qs({ site_id: siteId })}`),
  respondDecision: (id: string, action: 'approve' | 'comment' | 'request_change', note?: string) =>
    request<HomeownerDecision>(`/api/v1/homeowner/decisions/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ action, note }),
    }),
  capabilities: (siteId?: string) =>
    request<Capabilities>(`/api/v1/homeowner/me/capabilities${qs({ site_id: siteId })}`),

  /** Invite a household member (Primary/Co-owner only). POST /homeowner/members/invite */
  inviteMember: (body: HouseholdInviteRequest) =>
    request<HomeownerMember>('/api/v1/homeowner/members/invite', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Fetch the household roster for the caller's site. GET /homeowner/members/roster */
  roster: (siteId?: string) =>
    request<HomeownerMember[]>(`/api/v1/homeowner/members/roster${qs({ site_id: siteId })}`),

  /** Manage a member — update role, can_design, design_space_id. PATCH /homeowner/members/{id}/manage */
  manageMember: (id: string, body: MemberManageRequest) =>
    request<HomeownerMember>(`/api/v1/homeowner/members/${id}/manage`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  /**
   * Self-PATCH a member's own `notif_prefs` jsonb (no migration; same path the
   * push-token persister uses). The caller passes the full merged prefs object —
   * the server replaces the stored blob. Used by the Notifications screen.
   * PATCH /homeowner/members/{id}
   */
  updateNotifPrefs: (id: string, notif_prefs: Record<string, unknown>) =>
    request<HomeownerMember>(`/api/v1/homeowner/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ notif_prefs }),
    }),

  /** Remove a household member. DELETE /homeowner/members/{id} */
  removeMember: (id: string) =>
    request<void>(`/api/v1/homeowner/members/${id}`, { method: 'DELETE' }),

  /** Confirmed quiet periods for the site. GET /homeowner/quiet-periods
   *
   * Returns only contractor-confirmed windows (drafts are filtered server-
   * side). The most-recent item is the active quiet period when present.
   */
  quietPeriods: (siteId?: string) =>
    request<QuietPeriod[]>(`/api/v1/homeowner/quiet-periods${qs({ site_id: siteId })}`),
}
