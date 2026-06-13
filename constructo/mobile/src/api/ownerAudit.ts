/**
 * Audit + Survey API surface — the "Site Audit" (AI quality inspection) and
 * "SiteSync" (first-visit survey) features. Backed by the Labs-gated
 * `/api/v1/audits/*` and `/api/v1/surveys/*` routers.
 *
 * Two callers share this client:
 *   - the OWNER reads (list / get / assign findings) and requests audits;
 *   - the SITE ENGINEER (supervisor) CONDUCTS them — `upsertSection` marks a
 *     section's checks pass/observe/fail, `score` finalizes, `addFinding`
 *     records a defect.
 *
 * Determinism doctrine: quality scores / risk scores are computed by the backend
 * in deterministic Python (section score = round(100·(pass+0.5·obs)/total);
 * audit score = mean of section scores); the LLM only drafts the prose (finding
 * notes, the survey AI-analysis). The client never computes or trusts a score it
 * made up.
 */
import { request } from './client'
import type { Paginated } from './types'

// ---- Audit ----------------------------------------------------------------

export type AuditStatus = 'requested' | 'in_progress' | 'completed'
export type ItemStatus = 'ok' | 'obs' | 'fail'
export type FindingSeverity = 'critical' | 'major' | 'minor'
export type FindingStatus = 'open' | 'assigned' | 'resolved'

export interface AuditSectionItem {
  label: string
  status: ItemStatus
}

export interface AuditSection {
  id: string
  audit_id: string
  name: string
  position: number
  score: number | null
  pass_count: number
  obs_count: number
  fail_count: number
  items: AuditSectionItem[]
}

export interface AuditFinding {
  id: string
  audit_id: string
  company_id: string
  site_id: string
  title: string
  severity: FindingSeverity
  room: string | null
  location: string | null
  status: FindingStatus
  assignee_id: string | null
  note: string | null
  photo_url: string | null
  created_at: string
}

export interface Audit {
  id: string
  company_id: string
  site_id: string
  status: AuditStatus
  score: number | null
  requested_by: string | null
  conducted_by: string | null
  scheduled_for: string | null
  requested_at: string
  conducted_at: string | null
  created_at: string
}

export interface AuditDetail extends Audit {
  sections: AuditSection[]
  findings: AuditFinding[]
}

export interface CreateAuditRequest {
  site_id: string
  sections: string[]
  scheduled_for?: 'today' | 'this_week'
  conducted_by?: string | null
}

/** Body for `POST /audits/{id}/sections` — the engineer's marked checklist. */
export interface UpsertSectionRequest {
  name: string
  items: AuditSectionItem[]
}

/** Body for `POST /audits/{id}/findings` — a defect the engineer logs. */
export interface CreateFindingRequest {
  title: string
  severity: FindingSeverity
  room?: string | null
  location?: string | null
  note?: string | null
  photo_url?: string | null
}

/** Body for `PATCH /audits/{id}`. */
export interface PatchAuditRequest {
  status?: AuditStatus
  conducted_by?: string | null
  conducted_at?: string | null
}

// ---- Survey ---------------------------------------------------------------

export type SurveyStatus = 'draft' | 'submitted' | 'onboarded'

export interface SurveyRisk {
  name: string
  level: 'Low' | 'Medium' | 'High'
  tone?: string
}

export interface SurveyPlot {
  no?: string
  facing?: string
  corner?: string
  actual?: string
  shape?: string
  far?: string
  coverage?: string
}

export interface Survey {
  id: string
  company_id: string
  site_id: string | null
  name: string
  code: string | null
  status: SurveyStatus
  risk_score: number | null
  filled_pct: number
  photo_count: number
  area: string | null
  client_name: string | null
  engineer_id: string | null
  architect_name: string | null
  project_type: string | null
  address: string | null
  gps: string | null
  plot: SurveyPlot
  approvals: string[]
  approval_status: string | null
  conditions: [string, string][]
  risks: SurveyRisk[]
  requirement: string | null
  ai_analysis: string | null
  created_by: string | null
  created_at: string
  submitted_at: string | null
}

export interface CreateSurveyRequest {
  name: string
  site_id?: string | null
  code?: string | null
  client_name?: string | null
  project_type?: string | null
  address?: string | null
  requirement?: string | null
}

const qs = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter(([, v]) => v != null) as [string, string][]
  return entries.length ? '?' + new URLSearchParams(entries).toString() : ''
}

export const audit = {
  // --- Audits ---
  list: (siteId?: string, status?: AuditStatus) =>
    request<Paginated<Audit>>(`/api/v1/audits${qs({ site_id: siteId, status })}`),

  get: (id: string) => request<AuditDetail>(`/api/v1/audits/${id}`),

  create: (body: CreateAuditRequest) =>
    request<Audit>('/api/v1/audits', { method: 'POST', body: JSON.stringify(body) }),

  /** Patch an audit (e.g. flip status → in_progress when the engineer starts). */
  patch: (id: string, body: PatchAuditRequest) =>
    request<Audit>(`/api/v1/audits/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  /** Upsert a section's marked checklist — backend scores it deterministically. */
  upsertSection: (id: string, body: UpsertSectionRequest) =>
    request<AuditSection>(`/api/v1/audits/${id}/sections`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  /** Finalize: compute the overall score (mean of sections) + mark completed. */
  score: (id: string) =>
    request<AuditDetail>(`/api/v1/audits/${id}/score`, { method: 'POST' }),

  /** Log a finding (defect) against the audit. */
  addFinding: (id: string, body: CreateFindingRequest) =>
    request<AuditFinding>(`/api/v1/audits/${id}/findings`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  assignFinding: (findingId: string, patch: { status?: FindingStatus; assignee_id?: string; note?: string }) =>
    request<AuditFinding>(`/api/v1/audits/findings/${findingId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  // --- Surveys ---
  surveys: (status?: SurveyStatus, siteId?: string) =>
    request<Paginated<Survey>>(`/api/v1/surveys${qs({ status, site_id: siteId })}`),

  survey: (id: string) => request<Survey>(`/api/v1/surveys/${id}`),

  createSurvey: (body: CreateSurveyRequest) =>
    request<Survey>('/api/v1/surveys', { method: 'POST', body: JSON.stringify(body) }),

  onboardSurvey: (id: string) =>
    request<Survey>(`/api/v1/surveys/${id}/onboard`, { method: 'POST' }),

  /** Analyze a survey — deterministic risk_score/filled_pct + AI prose draft. */
  analyzeSurvey: (id: string) =>
    request<Survey>(`/api/v1/surveys/${id}/analyze`, { method: 'POST' }),
}
