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

  // --- Sites ---
  sites: () => request<Paginated<Site>>('/api/v1/sites'),

  site: (id: string) => request<Site>(`/api/v1/sites/${id}`),

  siteEvents: (id: string) =>
    request<Paginated<SiteEvent>>(`/api/v1/sites/${id}/events`),

  // --- Search ---
  search: (body: SearchRequest) =>
    request<SearchResponse>('/api/v1/search', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
}
