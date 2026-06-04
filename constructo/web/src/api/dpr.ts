// DPR (Daily Progress Report) API — the PM's AI-drafted report, reviewed and
// SHARED by a human (CA1: the AI proposes, the human commits). The web only ever
// drafts/edits/sends; `send` is the single explicit commit that flips draft→sent.
import { ApiError } from './client'
import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'

export type DprStatus = 'draft' | 'sent'

/** Free-form report sections (labour / materials / work_done / blockers / next / summary). */
export type DprSections = Record<string, unknown>

export interface Dpr {
  id: string
  site_id: string
  report_date: string
  sections: DprSections
  status: DprStatus
  generated_at: string
  sent_at: string | null
  evidence_event_ids: string[]
}

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
      detail = body?.error?.message ?? body?.detail ?? body?.message ?? detail
    } catch {
      /* non-JSON */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- mock fixture (network-free dev) --------------------------------------
let mockDpr: Dpr = {
  id: 'dpr-mock',
  site_id: 'mock-site',
  report_date: '2026-06-04',
  status: 'draft',
  generated_at: '2026-06-04T06:00:00Z',
  sent_at: null,
  evidence_event_ids: ['ev-1', 'ev-2', 'ev-3'],
  sections: {
    confidence: 91,
    summary:
      'Slab reinforcement progressed on Tower B; 18 of 24 workers present. One cement delivery pending verification.',
    labour: { headcount: 18, expected: 24, rows: [{ summary: '18 present (3 masons, 15 helpers)' }] },
    materials: { deliveries: [{ summary: 'TMT bars 8t received from Steel Junction' }] },
    work_done: [{ summary: 'Slab reinforcement — bay 3 tied' }],
    blockers: [{ summary: 'Cement invoice ₹17,500 unverified' }],
    next: ['Confirm cement delivery', 'Pour slab bay 3'],
  },
}

export const dprApi = {
  async draft(siteId: string, date?: string): Promise<Dpr> {
    if (USE_MOCKS) {
      mockDpr = { ...mockDpr, site_id: siteId }
      return structuredClone(mockDpr)
    }
    const q = date ? `?report_date=${encodeURIComponent(date)}` : ''
    return request<Dpr>(`/api/v1/dpr/sites/${encodeURIComponent(siteId)}/draft${q}`, {
      method: 'POST',
    })
  },

  async get(siteId: string, date?: string): Promise<Dpr> {
    if (USE_MOCKS) return structuredClone(mockDpr)
    const q = date ? `?report_date=${encodeURIComponent(date)}` : ''
    return request<Dpr>(`/api/v1/dpr/sites/${encodeURIComponent(siteId)}${q}`)
  },

  async edit(dprId: string, sections: DprSections): Promise<Dpr> {
    if (USE_MOCKS) {
      mockDpr = { ...mockDpr, sections }
      return structuredClone(mockDpr)
    }
    return request<Dpr>(`/api/v1/dpr/${encodeURIComponent(dprId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sections }),
    })
  },

  /** The human commit: draft → sent. The ONLY path that shares the report. */
  async send(dprId: string): Promise<Dpr> {
    if (USE_MOCKS) {
      mockDpr = { ...mockDpr, status: 'sent', sent_at: new Date().toISOString() }
      return structuredClone(mockDpr)
    }
    return request<Dpr>(`/api/v1/dpr/${encodeURIComponent(dprId)}/send`, {
      method: 'POST',
    })
  },
}
