/**
 * Owner (contractor) API surface — H4 native client.
 *
 * Ported from the proven web client modules:
 *   - briefs    ← web/src/api/dashboard.ts + types.ts (OwnerBrief)
 *   - approvals ← web/src/api/approvals.ts (Decision inbox + actions)
 *   - sites     ← web/src/api/types.ts (Site) + the /sites endpoints
 *   - search    ← web/src/api/search.ts (POST /search)
 *
 * Reuses the shared mobile client by IMPORT ONLY — it adds the `request`
 * helper + `ApiError` and never modifies them. All wire shapes are snake_case
 * to mirror the backend; the `{ error: { code, message } }` envelope is unwrapped
 * by the shared `request`.
 */
import { request, ApiError } from './client'
import type { Paginated, Role, Site } from './types'

export { ApiError }

// ============================================================================
// Briefs (the Owner Brief / dashboard hero) — GET /briefs, POST /briefs/run
// Ported from web/src/api/types.ts (OwnerBrief) + dashboard.ts intent.
// ============================================================================

export type RiskSeverity = 'high' | 'med' | 'low'

export interface Risk {
  site_id: string
  kind: string
  severity: RiskSeverity
  message: string
  evidence_event_ids: string[]
}

export interface BriefSiteCounts {
  attendance: number
  deliveries: number
  issues: number
}

export interface BriefSite {
  site_id: string
  name: string
  top_risks: Risk[]
  counts: BriefSiteCounts
}

export interface OwnerBriefPayload {
  brief_date: string
  sites: BriefSite[]
}

export interface OwnerBrief {
  id: string
  company_id: string
  brief_date: string
  payload: OwnerBriefPayload
  text: string
  sent_at: string | null
}

export interface RunBriefRequest {
  company_id?: string
  date?: string
}

export interface RunBriefResponse {
  payload: OwnerBriefPayload
  text: string
  brief_id: string
}

// ============================================================================
// Dashboard home (the command-center per-site cards) — GET /dashboard/home.
// Exceptions-first per-site cards with a status spine + counts.
// ============================================================================

export interface SiteCard {
  site_id: string
  name: string
  status: string // ok | warn | risk
  expected_headcount: number | null
  top_risks: Risk[]
  risk_overflow: number
  counts: Record<string, number>
}

export interface DashboardHome {
  brief_date: string
  needs_attention_count: number
  sites_total: number
  sites_needing_attention: number
  cold_start: boolean
  sites: SiteCard[]
}

// ============================================================================
// Approvals (the decisions inbox) — GET /approvals, POST /approvals/{id}/*
// Ported from web/src/api/approvals.ts.
// ============================================================================

export type DecisionKind =
  | 'approval'
  | 'homeowner_question'
  | 'hold_payment'
  | 'generic'

export type DecisionState =
  | 'pending'
  | 'acknowledged'
  | 'resolved'
  | 'rejected'
  | 'escalated'

export interface Decision {
  id: string
  company_id: string
  site_id: string | null
  kind: DecisionKind
  title: string
  detail: string | null
  raised_by: string | null
  assigned_to: string | null
  state: DecisionState
  sla_due_at: string | null
  resolved_at: string | null
  resolution_note: string | null
  evidence_event_ids: string[]
  created_at: string
  updated_at: string
}

export interface BatchResult {
  updated: string[]
  skipped: string[]
}

/** Create a decision inline from a Brief risk row (web POST /dashboard/decisions).
 * The Brief surfaces risks (not decisions), so an Owner's inline Approve/Hold/
 * Assign chip *creates* the logged decision + its consequence. */
export type DecisionAction = 'approve' | 'hold' | 'assign'

export interface CreateDecisionRequest {
  site_id?: string | null
  action: DecisionAction
  title: string
  detail?: string | null
  assigned_to?: string | null
  evidence_event_ids?: string[]
}

export interface CreateDecisionResponse {
  id: string
  company_id: string
  site_id: string | null
  kind: string
  state: string
  title: string
  detail: string | null
  assigned_to: string | null
  evidence_event_ids: string[]
  created_at: string
}

// ============================================================================
// Team members (assignable users) — GET /api/v1/users (owner/pm scope).
// The Approvals "Assign" member picker reads this and POSTs the chosen user's
// real UUID to /approvals/{id}/assign (replaces the old hard-coded 'pm').
// ============================================================================

export interface Member {
  id: string
  company_id: string
  name: string
  phone: string | null
  role: Role
  is_active: boolean
}

// ============================================================================
// Invite (POST /api/v1/invites) — contractor team member join token.
// ============================================================================
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

// ============================================================================
// HomeownerMemberInvite (POST /api/v1/homeowner/members) — client join code.
// ============================================================================
export interface HomeownerMemberInvite {
  id: string
  site_id: string
  phone: string | null
  display_name: string | null
  join_code: string
  invite_link: string
  status: string
}

// ============================================================================
// Site events (single-site timeline) — GET /sites/{id}/events
// Ported from web/src/api/types.ts (SiteEvent).
// ============================================================================

export type SiteEventType =
  | 'attendance'
  | 'material_delivery'
  | 'progress_update'
  | 'issue'
  | 'invoice_received'
  | 'drawing_shared'
  | 'approval'
  | 'payment_request'
  | 'unknown'

export interface SiteEvent {
  id: string
  site_id: string
  event_type: SiteEventType
  occurred_on: string
  summary: string
  fields: Record<string, unknown>
  confidence: number
  needs_clarification: boolean
  source_message_ids: string[]
  created_at: string
}

export interface SitePhoto {
  id: string
  site_id: string
  image_url: string
  caption: string | null
  room_tag: string | null
  published_at: string
}

// ============================================================================
// Search — POST /search. Ported from web/src/api/search.ts.
// ============================================================================

export interface SearchRequest {
  q: string
  site_id?: string
  event_type?: SiteEventType
  date_from?: string
  date_to?: string
  limit?: number
}

export interface SearchEvidence {
  source_message_ids: string[]
  confidence: number
  needs_clarification: boolean
}

export interface SearchHit {
  event_id: string
  site_id: string
  site_name: string
  event_type: SiteEventType
  occurred_on: string
  summary: string
  fields: Record<string, unknown>
  score: number
  evidence: SearchEvidence
  created_at: string
}

export interface ParsedQuery {
  semantic_text: string
  event_type: SiteEventType | null
  date_from: string | null
  date_to: string | null
  site_name_hint: string | null
}

export interface SearchResponse {
  query: ParsedQuery
  hits: SearchHit[]
  answerable: boolean
}

// ============================================================================
// Re-export Site/Role/Paginated for screen convenience.
// ============================================================================
export type { Paginated, Role, Site }

// ---- Foresight: forecasting (3.3) · portfolio (3.4) · sentinel (3.1) --------
export interface MaterialForecast {
  material: string
  unit: string
  deliveries: number
  avg_qty_per_delivery: number
  avg_interval_days: number
  days_since_last: number
  expected_next_on: string
  overdue: boolean
  assumptions: string[]
}
export interface CashflowForecast {
  answerable: boolean
  daily_run_rate: number
  projected_next_30d: number
  assumptions: string[]
}
export interface ForecastResult {
  site_id: string
  window_days: number
  reorder: MaterialForecast[]
  overdue_count: number
  materials_skipped_thin: number
  cashflow: CashflowForecast
  summary: string
}

export interface SiteRollup {
  site_id: string
  site_name: string
  worker_days: number | null
  amount_total: number | null
  deliveries: number
  open_disputes: number
  material_qty: number | null
  material_unit: string | null
}
export interface PortfolioResult {
  days: number
  site_count: number
  material: string | null
  sites: SiteRollup[]
  totals: {
    worker_days: number | null
    amount_total: number | null
    deliveries: number
    open_disputes: number
    material_qty: number | null
    material_unit: string | null
  }
  summary: string
}

export interface SentinelSignal {
  kind: string
  severity: 'high' | 'medium' | 'low' | string
  message: string
}
export interface SentinelResult {
  site_id: string
  window_days: number
  signals: SentinelSignal[]
  count: number
  summary: string
}

// ---- Tamper-evident dispute pack (3.6) ------------------------------------
export interface DisputePackResult {
  site_id: string
  counterparty: string
  record_count: number
  records: Array<Record<string, unknown>>
  settlement: {
    counterparty: string
    paid_out: number
    invoiced: number
    unadjusted_advance: number
    warn: boolean
    message: string
  }
  head_hash: string
  watermark: string
  narrative: string
}
export interface PackAskResult {
  answerable: boolean
  answer: string
}

// ---- Advance Ledger / Advance Guard (2.5 L2) ------------------------------
export interface SettlementResult {
  counterparty: string
  paid_out: number
  invoiced: number
  unadjusted_advance: number
  warn: boolean
  message: string
}

// ---- query helper ----------------------------------------------------------
const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [
    string,
    string,
  ][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

// ---- public surface --------------------------------------------------------

export const owner = {
  // --- Briefs ---
  /** Page<OwnerBrief>; the screen takes items[0] as today's brief. */
  briefs: (date?: string) =>
    request<Paginated<OwnerBrief>>(`/api/v1/briefs${qs({ date })}`),

  /** Generate (or rebuild) a brief — the web "run brief now" / pull-to-refresh. */
  runBrief: (body: RunBriefRequest = {}) =>
    request<RunBriefResponse>('/api/v1/briefs/run', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Inline Brief-row decision: logs the decision + notifies (web parity). */
  createDecision: (body: CreateDecisionRequest) =>
    request<CreateDecisionResponse>('/api/v1/dashboard/decisions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // --- Dashboard home (per-site command cards) ---
  home: () => request<DashboardHome>('/api/v1/dashboard/home'),

  // --- Approvals (decisions inbox) ---
  approvals: (state: DecisionState = 'pending') =>
    request<Paginated<Decision>>(`/api/v1/approvals${qs({ state })}`),

  approve: (id: string, note?: string) =>
    request<Decision>(`/api/v1/approvals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    }),

  reject: (id: string, note?: string) =>
    request<Decision>(`/api/v1/approvals/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    }),

  acknowledge: (id: string, note?: string) =>
    request<Decision>(`/api/v1/approvals/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({ note: note ?? null }),
    }),

  assign: (id: string, assignedTo: string) =>
    request<Decision>(`/api/v1/approvals/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigned_to: assignedTo }),
    }),

  batch: (
    action: 'approve' | 'reject' | 'acknowledge',
    ids: string[],
    note?: string,
  ) =>
    request<BatchResult>(`/api/v1/approvals/batch/${action}`, {
      method: 'POST',
      body: JSON.stringify({ ids, note: note ?? null }),
    }),

  // --- Team members (assignable users for the Assign picker + Team screen) ---
  members: () => request<Paginated<Member>>('/api/v1/users'),

  /** Invite a contractor team member. POST /api/v1/invites.
   *  Owner-only. Returns the invite row; the join link is WEB_BASE/join/<token>. */
  invite: (body: { phone: string; role: Role; name?: string }) =>
    request<Invite>('/api/v1/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Invite a homeowner/client for a specific site. POST /api/v1/homeowner/members.
   *  Sends sub_role='primary_owner'; the client redeems the join_code in the mobile app. */
  inviteClient: (body: { site_id: string; phone?: string; name?: string }) =>
    request<HomeownerMemberInvite>('/api/v1/homeowner/members', {
      method: 'POST',
      body: JSON.stringify({
        site_id: body.site_id,
        sub_role: 'primary_owner',
        phone: body.phone || undefined,
        display_name: body.name || undefined,
      }),
    }),

  /** Update a team member's role or active status. PATCH /api/v1/users/{id}.
   *  Owner-only; the backend rejects self-edit with 403.
   *
   *  Sensitive changes (deactivate, privileged role assignment) require a
   *  `step_up_token` obtained via `authApi.stepUpVerify()`. When supplied the
   *  token is forwarded as the `X-Step-Up-Token` request header so the backend
   *  step-up gate is satisfied. Non-sensitive patches (e.g. reactivation, role
   *  changes to non-privileged roles) do NOT need the token — omit it and the
   *  first call succeeds without an OTP prompt. */
  updateMember: (
    id: string,
    patch: { role?: Role; is_active?: boolean },
    stepUpToken?: string,
  ) =>
    request<Member>(`/api/v1/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      ...(stepUpToken ? { headers: { 'X-Step-Up-Token': stepUpToken } } : {}),
    }),

  // --- Sites ---
  sites: () => request<Paginated<Site>>('/api/v1/sites'),

  site: (id: string) => request<Site>(`/api/v1/sites/${id}`),

  siteEvents: (id: string) =>
    request<Paginated<SiteEvent>>(`/api/v1/sites/${id}/events`),

  sitePhotos: (id: string) =>
    request<SitePhoto[]>(`/api/v1/sites/${id}/photos`),

  // --- Search ---
  search: (body: SearchRequest) =>
    request<SearchResponse>('/api/v1/search', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // --- Foresight (Phase 3) ---
  /** Portfolio exact-math rollup across the owner's sites (3.4). */
  portfolio: (days = 30, material?: string) =>
    request<PortfolioResult>(`/api/v1/portfolio/summary${qs({ days: String(days), material })}`),

  /** Per-site deterministic forecast — reorder cadence + cash-flow (3.3). */
  forecast: (siteId: string, windowDays = 60) =>
    request<ForecastResult>(
      `/api/v1/forecast${qs({ site_id: siteId, window_days: String(windowDays) })}`,
    ),

  /** Per-site absence + stuck-thing radar (3.1). */
  sentinel: (siteId: string, windowDays = 14) =>
    request<SentinelResult>(
      `/api/v1/sentinel${qs({ site_id: siteId, window_days: String(windowDays) })}`,
    ),

  /** Tamper-evident dispute pack for a counterparty's advance case (3.6). */
  disputePack: (siteId: string, counterparty: string) =>
    request<DisputePackResult>(
      `/api/v1/dispute-pack${qs({ site_id: siteId, counterparty })}`,
    ),

  /** Ask-the-pack — deterministic money Q&A grounded in the pack (3.6). */
  askPack: (siteId: string, counterparty: string, question: string) =>
    request<PackAskResult>('/api/v1/dispute-pack/ask', {
      method: 'POST',
      body: JSON.stringify({ site_id: siteId, counterparty, question }),
    }),

  /** Advance Guard: a counterparty's company-wide unadjusted advance (2.5 L2). */
  settlement: (counterparty: string) =>
    request<SettlementResult>(`/api/v1/payments/settlement${qs({ counterparty })}`),
}
