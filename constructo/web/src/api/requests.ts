// Homeowner-requests API layer (owner-side read).
//
// Self-contained (mirrors api/approvals.ts): imports only ApiError / API_BASE /
// USE_MOCKS / getToken and declares its own request helper + types. Mirrors the
// backend JSON under GET /api/v1/homeowner/requests (list[RequestOut], newest-first).
import { ApiError } from './client'
import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'

// ---- types (mirror backend RequestOut / HomeownerRequestStatus) -----------

export type HomeownerRequestStatus = 'sent' | 'seen' | 'in_progress' | 'done'

export interface RequestOut {
  id: string
  site_id: string
  raised_by: string | null
  title: string
  detail: string | null
  status: HomeownerRequestStatus
  sla_due_at: string | null
  created_at: string
  updated_at: string
  voice_url: string | null
}

// ---- request helper (identical shape to approvals.ts) ---------------------

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
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// ---- mock fixtures (network-free dev) -------------------------------------

const mockRequests: RequestOut[] = [
  {
    id: 'req-1', site_id: 'site-1', raised_by: 'ho-1',
    title: 'Leak under the kitchen sink', detail: 'Water pooling since Tuesday.',
    status: 'sent', sla_due_at: '2026-07-01T00:00:00Z',
    created_at: '2026-06-29T09:00:00Z', updated_at: '2026-06-29T09:00:00Z',
    voice_url: null,
  },
  {
    id: 'req-2', site_id: 'site-1', raised_by: 'ho-1',
    title: 'Please send a photo of the master bedroom', detail: null,
    status: 'in_progress', sla_due_at: null,
    created_at: '2026-07-02T11:20:00Z', updated_at: '2026-07-02T14:00:00Z',
    voice_url: null,
  },
  {
    id: 'req-3', site_id: 'site-1', raised_by: 'ho-1',
    title: 'Confirm the tile colour for the guest bath', detail: 'Went with the sand beige.',
    status: 'done', sla_due_at: null,
    created_at: '2026-06-20T08:00:00Z', updated_at: '2026-06-24T08:00:00Z',
    voice_url: null,
  },
]

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms))

// ---- public surface -------------------------------------------------------

export const requestsApi = {
  /** List a site's homeowner requests, newest-first (bare array — not paginated). */
  async list(siteId?: string): Promise<RequestOut[]> {
    if (USE_MOCKS) {
      await delay()
      return mockRequests.map((r) => ({ ...r }))
    }
    const q = siteId ? `?site_id=${encodeURIComponent(siteId)}` : ''
    return request<RequestOut[]>(`/api/v1/homeowner/requests${q}`)
  },
}
