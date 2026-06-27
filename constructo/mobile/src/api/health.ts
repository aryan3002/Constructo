// Site Health API (proactive intelligence) — mirrors the backend
// GET /api/v1/sites/{id}/health + POST /findings/{id}/acknowledge|resolve.
import { request } from './client'

export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical'
export type FindingStatus = 'open' | 'acknowledged' | 'resolved'
export type HealthBand = 'healthy' | 'watch' | 'at_risk'

export interface Finding {
  id: string
  finding_type: string
  severity: FindingSeverity
  status: FindingStatus
  headline: string
  detail: string
  phase: string | null
  evidence: string[]
  detected_on: string // YYYY-MM-DD
}

export interface SiteHealth {
  site_id: string
  score: number // 0-100
  band: HealthBand
  counts: Record<string, number>
  findings: Finding[]
}

export const health = {
  /** GET /api/v1/sites/{id}/health. `refresh` recomputes findings live first. */
  status: (siteId: string, refresh = false) =>
    request<SiteHealth>(`/api/v1/sites/${siteId}/health${refresh ? '?refresh=true' : ''}`),

  /** POST /api/v1/findings/{id}/acknowledge. */
  acknowledge: (findingId: string) =>
    request<Finding>(`/api/v1/findings/${findingId}/acknowledge`, { method: 'POST' }),

  /** POST /api/v1/findings/{id}/resolve. */
  resolve: (findingId: string) =>
    request<Finding>(`/api/v1/findings/${findingId}/resolve`, { method: 'POST' }),
}
