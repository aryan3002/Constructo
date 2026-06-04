// Shared API types mirroring the backend JSON shapes (snake_case).
// Kept dependency-free so a later React Native app can reuse this file as-is.

export interface Paginated<T> {
  items: T[]
  next_cursor: string | null
}

// ---- Auth ----
export interface LoginRequest {
  phone: string
  otp: string
}

export interface LoginResponse {
  token: string
}

// ---- Sites ----
export type SiteStatus = 'active' | 'paused' | 'completed' | string

export interface Site {
  id: string
  company_id: string
  name: string
  location: string
  type: string
  status: SiteStatus
  created_at: string
}

/** Per-site baseline (Setup & Admin → Site baselines, W4.4). */
export interface SiteBaseline {
  site_id: string
  /** Expected daily headcount; null = auto-learn / day-over-day fallback. */
  expected_daily_headcount: number | null
  notes: string | null
  updated_at: string
}

// ---- Briefs ----
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
  // Optional: the backend defaults to the authenticated user's own company.
  company_id?: string
  date?: string
}

export interface RunBriefResponse {
  payload: OwnerBriefPayload
  text: string
  brief_id: string
}

// ---- WhatsApp groups ----
export interface WhatsappGroup {
  id: string
  company_id?: string
  external_group_id: string
  source: string
  site_id: string
  label: string
  created_at?: string
}

export interface CreateWhatsappGroupRequest {
  external_group_id: string
  source: string
  site_id: string
  label: string
}

// ---- Site events ----
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
