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
  ConsistencyCheck,
  DesignConflict,
  DesignProfile,
  DesignReference,
  DesignSelection,
  Drawing,
  FinishesResponse,
  Home,
  HomeownerAskResult,
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
  VoiceNoteOut,
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
  const existingHeaders =
    init.headers instanceof Headers
      ? Object.fromEntries((init.headers as Headers).entries())
      : (init.headers as Record<string, string> | undefined) ?? {}
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...existingHeaders }
  const token = await getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

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

/** A file part for multipart upload — React Native's FormData file shape. */
export interface UploadFile {
  uri: string
  name: string
  type: string
}

/**
 * Multipart upload (e.g. a homeowner visit photo). Unlike {@link request} we must
 * NOT set Content-Type — `fetch` adds the multipart boundary itself. The JWT is
 * still attached.
 */
export async function uploadMultipart<T>(path: string, form: FormData): Promise<T> {
  const headers = new Headers()
  const token = await getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form, headers })
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
  photos: (siteId?: string, view: 'all' | 'room' | 'milestone' | 'mine' = 'all') =>
    request<Paginated<Photo>>(`/api/v1/homeowner/photos${qs({ site_id: siteId, view })}`),
  /** Upload a homeowner "site visit" photo (R1). Server streams it to R2. */
  uploadVisitPhoto: (file: UploadFile, caption?: string, siteId?: string) => {
    const form = new FormData()
    // RN FormData accepts the {uri,name,type} file shape directly.
    form.append('media', file as unknown as Blob)
    if (caption) form.append('caption', caption)
    if (siteId) form.append('site_id', siteId)
    return uploadMultipart<Photo>('/api/v1/homeowner/photos', form)
  },

  /** Upload a voice note (audio) for an issue/request. The server stores the
   *  audio (private R2) and best-effort transcribes it; returns the key + a
   *  playback URL + transcript. Pass the returned `voice_key` to createRequest. */
  uploadVoiceNote: (file: UploadFile, siteId?: string) => {
    const form = new FormData()
    form.append('media', file as unknown as Blob)
    if (siteId) form.append('site_id', siteId)
    return uploadMultipart<VoiceNoteOut>('/api/v1/homeowner/voice-notes', form)
  },
  /** Delete one of the caller's own visit photos. */
  deleteVisitPhoto: (id: string) =>
    request<void>(`/api/v1/homeowner/photos/${id}`, { method: 'DELETE' }),
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
  /**
   * Save a confirmed design profile, or (when `profile` is omitted) AI-DRAFT one
   * from her intake fingerprint. PUT /design/profile. Honest-AI: omitting
   * `profile` drafts AND persists immediately (not a discardable preview) — the
   * UI confirms by PUTting the edited profile back. Gated server-side (can_design).
   */
  saveDesignProfile: (body: { site_id?: string; profile?: Record<string, unknown> }) =>
    request<DesignProfile>('/api/v1/homeowner/design/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  /**
   * Add a design selection (room-scoped + status-aware). POST /design/selections,
   * gated server-side by `_gate_design_write` — a room-narrowed member may only
   * write their own `space_id`; status defaults to "proposed" when omitted.
   */
  addSelection: (body: {
    item: string
    choice: string
    space_id?: string
    status?: string
    site_id?: string
  }) =>
    request<DesignSelection>('/api/v1/homeowner/design/selections', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /**
   * Advisory fit feedback for an (item, choice) against the saved profile.
   * POST /design/consistency-check — NEVER blocking; returns { fits, feedback }.
   */
  consistencyCheck: (body: { item: string; choice: string; site_id?: string }) =>
    request<ConsistencyCheck>('/api/v1/homeowner/design/consistency-check', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /**
   * "Ask your home" — grounded Q&A over the homeowner's PUBLISHED slice only
   * (the Trust Membrane in question form). Answers in her language, digit-guarded,
   * and abstains (`answerable=false`) to "ask your builder" when the record
   * doesn't hold it. Engine: POST /homeowner/ask (#109). Stateless — the calm
   * answer is instant info, not a tracked request.
   */
  ask: (question: string, siteId?: string) =>
    request<HomeownerAskResult>('/api/v1/homeowner/ask', {
      method: 'POST',
      body: JSON.stringify({ question, site_id: siteId }),
    }),
  requests: (siteId?: string) =>
    request<HomeownerRequest[]>(`/api/v1/homeowner/requests${qs({ site_id: siteId })}`),
  createRequest: (body: {
    title: string
    detail?: string
    site_id?: string
    voice_key?: string
  }) =>
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

  /** Room-grouped material finishes for the homeowner — read-only, cost-firewalled.
   *  GET /api/v1/homeowner/finishes. */
  finishes: (siteId?: string) =>
    request<FinishesResponse>(`/api/v1/homeowner/finishes${qs({ site_id: siteId })}`),
}

// ---- Design Profiler engine (/api/v1/design) ----------------------------
export interface ProfilerArea {
  id: string
  area_kind: string
  area_key: string
  recommended_count: number
  status: string
  confidence: number
  has_conflict: boolean
}
export interface ProfilerContributor {
  id: string
  role: string
  is_decision_owner: boolean
}
export interface ProfilerProfileDetail {
  id: string
  company_id: string
  site_id: string
  scope_type: string
  status: string
  created_at: string
  my_contributor_id: string | null
  areas: ProfilerArea[]
  contributors: ProfilerContributor[]
}
export interface ProfilerTheme {
  id: string
  area_id: string | null
  name: string
  confidence: number
  palette: string[]
  materials: string[]
  rationale: string | null
  evidence_reference_ids: string[]
  status: string
  created_at: string
}
export interface ProfilerConflict {
  id: string
  area_id: string
  dimension: string
  value: string
  resolution_status: string
  decision_note: string | null
}
export interface ProfilerReference {
  id: string
  area_id: string
  source_type: string
  consistency_status: string | null
  created_at: string
}
export interface ProfilerBriefRendering {
  id: string
  brief_id: string
  audience: string
  scope: string
  area_id: string | null
  content_json: Record<string, unknown>
  created_at: string
}
export interface ProfilerClarification {
  id: string
  area_id: string | null
  question: string
  answer: string | null
  asked_at: string
  answered_at: string | null
}
export interface ProfilerBriefApproval {
  id: string
  brief_id: string
  actor_role: string
  action: string
  note: string | null
  created_at: string
}

export const design = {
  profileBySite: (siteId: string) =>
    request<ProfilerProfileDetail>(`/api/v1/design/profiles/by-site/${siteId}`),
  profile: (id: string) => request<ProfilerProfileDetail>(`/api/v1/design/profiles/${id}`),
  references: (profileId: string, areaId: string) =>
    request<ProfilerReference[]>(
      `/api/v1/design/profiles/${profileId}/areas/${areaId}/references`,
    ),
  addReference: (body: {
    area_id: string
    contributor_id?: string
    source_type?: string
    image_r2_key?: string
    source_url?: string
    preset_id?: string
  }) =>
    request<ProfilerReference>(`/api/v1/design/references`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rankReference: (
    refId: string,
    body: { contributor_id: string; stars: number; tags?: Record<string, string[]>; note?: string },
  ) =>
    request<{ ok: boolean }>(`/api/v1/design/references/${refId}/rankings`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  themes: (profileId: string, areaId: string) =>
    request<ProfilerTheme[]>(`/api/v1/design/profiles/${profileId}/areas/${areaId}/themes`),
  conflicts: (profileId: string) =>
    request<ProfilerConflict[]>(`/api/v1/design/profiles/${profileId}/conflicts`),
  brief: (profileId: string, audience: 'homeowner' | 'architect' | 'contractor' = 'homeowner') =>
    request<ProfilerBriefRendering>(
      `/api/v1/design/profiles/${profileId}/brief?audience=${audience}`,
    ),
  clarifications: (profileId: string) =>
    request<ProfilerClarification[]>(`/api/v1/design/profiles/${profileId}/clarifications`),
  answerClarification: (id: string, answer: string) =>
    request<ProfilerClarification>(`/api/v1/design/clarifications/${id}/answer`, {
      method: 'POST',
      body: JSON.stringify({ answer }),
    }),
  actOnBrief: (briefId: string, body: { action: string; note?: string }) =>
    request<{ id: string; state: string }>(`/api/v1/design/briefs/${briefId}/approval`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  approvals: (briefId: string) =>
    request<ProfilerBriefApproval[]>(`/api/v1/design/briefs/${briefId}/approvals`),
}
