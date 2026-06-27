// Site Health API layer (owned by the health feature).
//
// Reuses shared client primitives by IMPORT ONLY (API_BASE / ApiError / getToken).
// Mirrors the backend GET /api/v1/sites/{id}/health + POST /findings/{id}/...
// contracts (snake_case on the wire).

import { API_BASE } from './config'
import { ApiError } from './client'
import { getToken } from './auth'

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
  counts: Record<string, number> // by severity
  findings: Finding[]
}

function authHeaders(): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return headers
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText
    try {
      const err = await res.json()
      detail = err?.detail ?? err?.message ?? detail
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

/** GET /api/v1/sites/{id}/health. `refresh` recomputes findings live first. */
export async function getSiteHealth(
  siteId: string,
  opts: { refresh?: boolean } = {},
): Promise<SiteHealth> {
  const qs = opts.refresh ? '?refresh=true' : ''
  const res = await fetch(`${API_BASE}/api/v1/sites/${siteId}/health${qs}`, {
    headers: authHeaders(),
  })
  return unwrap<SiteHealth>(res)
}

/** POST /api/v1/findings/{id}/acknowledge. */
export async function acknowledgeFinding(findingId: string): Promise<Finding> {
  const res = await fetch(`${API_BASE}/api/v1/findings/${findingId}/acknowledge`, {
    method: 'POST',
    headers: authHeaders(),
  })
  return unwrap<Finding>(res)
}

/** POST /api/v1/findings/{id}/resolve. */
export async function resolveFinding(findingId: string): Promise<Finding> {
  const res = await fetch(`${API_BASE}/api/v1/findings/${findingId}/resolve`, {
    method: 'POST',
    headers: authHeaders(),
  })
  return unwrap<Finding>(res)
}
