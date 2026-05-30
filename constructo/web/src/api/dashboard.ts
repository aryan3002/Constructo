// Owner Home dashboard API surface (Phase B, feature: brief/owner).
//
// Read-only aggregation (`GET /dashboard/home`) plus the inline decision write
// path (`POST /dashboard/decisions`). Reuses the shared client primitives
// (API_BASE, ApiError, getToken) by import only — it does NOT modify them.
import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

// ---- wire types (snake_case, mirror the backend) --------------------------

export type DashStatus = 'ok' | 'warn' | 'risk' | 'info'
export type PulseKind = 'cash' | 'labor' | 'material' | 'progress'

export interface DashRisk {
  site_id: string
  kind: string
  severity: string
  status: DashStatus
  message: string
  evidence_event_ids: string[]
}

export interface PulseTile {
  kind: PulseKind
  status: DashStatus
  value: number | null
  evidence_event_ids: string[]
  facts: Record<string, number | null>
}

export interface SiteCard {
  site_id: string
  name: string
  status: DashStatus
  expected_headcount: number | null
  top_risks: DashRisk[]
  risk_overflow: number
  counts: {
    attendance: number
    deliveries: number
    issues: number
    total: number
  }
  pulse: PulseTile[]
}

export interface SetupStep {
  key: string
  done: boolean
  title_key: string
}

export interface OwnerHome {
  brief_date: string
  needs_attention_count: number
  sites_total: number
  sites_needing_attention: number
  cold_start: boolean
  setup_checklist: SetupStep[]
  sites: SiteCard[]
}

export type DecisionAction = 'approve' | 'hold' | 'assign'

export interface CreateDecisionRequest {
  site_id?: string | null
  action: DecisionAction
  title: string
  detail?: string | null
  assigned_to?: string | null
  evidence_event_ids?: string[]
}

export interface DecisionResponse {
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

// ---- request helper (mirrors client.ts; uses the shared primitives) -------

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const dashboardApi = {
  async getHome(date: string): Promise<OwnerHome> {
    return request<OwnerHome>(
      `/api/v1/dashboard/home?date=${encodeURIComponent(date)}`,
    )
  },

  async createDecision(
    body: CreateDecisionRequest,
  ): Promise<DecisionResponse> {
    return request<DecisionResponse>('/api/v1/dashboard/decisions', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}
