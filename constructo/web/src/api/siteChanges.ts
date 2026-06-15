/**
 * Site Changes API client (D3 — field → designer feedback loop).
 *
 * Endpoints (all authenticated):
 *   GET   /api/v1/site-changes?site_id=&status=  → SiteChange[]  (any role)
 *   GET   /api/v1/site-changes/{id}              → SiteChange    (any role)
 *   PATCH /api/v1/site-changes/{id}              → SiteChange    (architect|owner|pm)
 *
 * PATCH semantics:
 *   • Set linked_drawing_id → auto-promotes status new → linked
 *   • Set status: 'resolved' → stamps resolved_at
 *
 * photo_url: stored as a bare R2 key (not a resolved URL). The UI treats it as
 * opaque: display best-effort via a "View photo" link only (never a broken img
 * tag with a key path). When mocks are resolved URLs we display them as images
 * in tests; in production the backend would need a presign step.
 */

import { API_BASE, USE_MOCKS } from './config'
import { getToken } from './auth'
import { ApiError } from './client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SiteChangeStatus = 'new' | 'linked' | 'resolved'

export interface SiteChange {
  id: string
  company_id: string
  site_id: string
  room: string | null
  title: string
  note: string
  impact: string | null
  /** Bare R2 key or URL — treat as opaque in production; display behind a link. */
  photo_url: string | null
  reported_by: string | null
  /** Human-readable name resolved by the server. Always prefer this over reported_by. */
  reported_by_name?: string | null
  status: SiteChangeStatus
  linked_drawing_id: string | null
  created_at: string
  resolved_at: string | null
}

export interface SiteChangeUpdate {
  status?: SiteChangeStatus
  impact?: string
  linked_drawing_id?: string
}

export interface SiteChangeListOpts {
  siteId?: string
  status?: SiteChangeStatus
}

// ---------------------------------------------------------------------------
// Internal JSON helper (mirrors drawings.ts pattern)
// ---------------------------------------------------------------------------

async function jsonRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
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

// ---------------------------------------------------------------------------
// Mock roster
// ---------------------------------------------------------------------------

/** Module-level roster so mutations persist for the lifetime of the tab. */
const mockRoster: SiteChange[] = [
  {
    id: 'sc-mock-1',
    company_id: 'co-mock-1',
    site_id: 'mock-site-1',
    room: 'Master Bedroom',
    title: 'Beam position shifted 200mm east',
    note: 'Structural beam installed at grid C-3 is 200mm east of the drawing. Ceiling design and AC duct routing will be affected.',
    impact: null,
    photo_url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=400&q=80',
    reported_by: 'mock-user-rajan',
    reported_by_name: 'Site Engineer Rajan',
    status: 'new',
    linked_drawing_id: null,
    created_at: '2026-06-13T09:15:00Z',
    resolved_at: null,
  },
  {
    id: 'sc-mock-2',
    company_id: 'co-mock-1',
    site_id: 'mock-site-1',
    room: 'Kitchen',
    title: 'Window sill height reduced to 800mm',
    note: 'Owner requested window sill height at 800mm instead of the drawn 900mm. Tile layout and countertop splash will need revision.',
    impact: 'Kitchen tile layout revised — splash runs to 800mm sill. Counter detail on KT-02 updated.',
    photo_url: null,
    reported_by: 'mock-user-mukesh',
    reported_by_name: 'Supervisor Mukesh',
    status: 'linked',
    linked_drawing_id: 'drw-mock-2',
    created_at: '2026-06-10T14:30:00Z',
    resolved_at: null,
  },
  {
    id: 'sc-mock-3',
    company_id: 'co-mock-1',
    site_id: 'mock-site-1',
    room: 'Living Room',
    title: 'False ceiling dropped 150mm — existing column clash',
    note: 'False ceiling at 2750mm clashes with existing column on grid A-2. Column is 50mm wider than plan shows.',
    impact: 'False ceiling on north side notched around column. Light cove detail FL-07 updated to reflect the notch.',
    photo_url: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=400&q=80',
    reported_by: 'mock-user-rajan',
    reported_by_name: 'Site Engineer Rajan',
    status: 'resolved',
    linked_drawing_id: 'drw-mock-3',
    created_at: '2026-06-08T11:00:00Z',
    resolved_at: '2026-06-11T16:45:00Z',
  },
  {
    id: 'sc-mock-4',
    company_id: 'co-mock-1',
    site_id: 'mock-site-1',
    room: 'Bathroom — En suite',
    title: 'Plumbing outlet relocated — shower position conflict',
    note: 'Plumber moved the waste outlet 300mm towards the door to avoid the structural slab edge. Shower tray now overhangs the door opening slightly.',
    impact: null,
    photo_url: null,
    reported_by: 'mock-user-mukesh',
    reported_by_name: 'Supervisor Mukesh',
    status: 'new',
    linked_drawing_id: null,
    created_at: '2026-06-14T07:50:00Z',
    resolved_at: null,
  },
]

// ---------------------------------------------------------------------------
// Public API surface
// ---------------------------------------------------------------------------

export const siteChangesApi = {
  /**
   * List site changes. Optionally filter by siteId and/or status.
   * Returns newest-first (matching server order).
   */
  list(opts: SiteChangeListOpts = {}): Promise<SiteChange[]> {
    if (USE_MOCKS) {
      let rows = [...mockRoster]
      if (opts.siteId) rows = rows.filter((r) => r.site_id === opts.siteId)
      if (opts.status) rows = rows.filter((r) => r.status === opts.status)
      return Promise.resolve(rows)
    }
    const params = new URLSearchParams()
    if (opts.siteId) params.set('site_id', opts.siteId)
    if (opts.status) params.set('status', opts.status)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return jsonRequest<SiteChange[]>(`/api/v1/site-changes${qs}`)
  },

  get(id: string): Promise<SiteChange> {
    if (USE_MOCKS) {
      const row = mockRoster.find((r) => r.id === id)
      if (!row) return Promise.reject(new ApiError(404, 'Site change not found'))
      return Promise.resolve({ ...row })
    }
    return jsonRequest<SiteChange>(`/api/v1/site-changes/${encodeURIComponent(id)}`)
  },

  update(id: string, patch: SiteChangeUpdate): Promise<SiteChange> {
    if (USE_MOCKS) {
      const row = mockRoster.find((r) => r.id === id)
      if (!row) return Promise.reject(new ApiError(404, 'Site change not found'))
      if (patch.impact !== undefined) row.impact = patch.impact
      if (patch.linked_drawing_id !== undefined) {
        row.linked_drawing_id = patch.linked_drawing_id
        if (row.status === 'new') row.status = 'linked'
      }
      if (patch.status !== undefined) {
        row.status = patch.status
        row.resolved_at = patch.status === 'resolved' ? new Date().toISOString() : null
      }
      return Promise.resolve({ ...row })
    }
    return jsonRequest<SiteChange>(
      `/api/v1/site-changes/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    )
  },
}
