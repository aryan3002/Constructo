// Spec engine API layer — the Material Specification Schedule (spec-desk).
// Mirrors the backend JSON (snake_case). Decimals arrive as strings.

import { ApiError } from './client'
import { getToken } from './auth'
import { API_BASE, USE_MOCKS } from './config'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpecApprovalStatus = 'pending' | 'approved' | 'rejected'
export type RoutingStatus = 'draft' | 'out_for_approval' | 'approved' | 'released' | 'returned'

/** Full spec row (mirrors SpecOut from the backend). */
export interface Spec {
  id: string
  company_id: string
  site_id: string
  component_id: string
  material_id: string | null
  label: string
  qty: string | null
  unit: string | null
  wastage_pct: string | null
  unit_rate: string | null
  approval_status: SpecApprovalStatus
  client_final_code: string | null
  assignee_id: string | null
  notes: string | null
  sent_at: string | null
  released_at: string | null
  created_at: string
  routing_status: RoutingStatus
}

export interface DeskLine {
  id: string
  component_id: string
  element: string
  location: string | null
  category: string | null
  brand: string | null
  sku: string | null
  colour: string | null
  finish: string | null
  qty: string | null
  unit: string | null
  wastage_pct: string | null
  unit_rate: string | null
  line_total: string | null
  approval_status: SpecApprovalStatus
  client_final_code: string | null
  // Designer selection lifecycle (added to DeskLine in D1)
  routing_status: RoutingStatus
  sent_at: string | null
  released_at: string | null
  notes: string | null
  material_id: string | null
}

export interface DeskRoom {
  room: string
  total: string
  excluded: number
  lines: DeskLine[]
}

export interface DeskOut {
  rooms: DeskRoom[]
  grand_total: string
  excluded_total: number
}

export interface ExtractedSpecOut {
  spec: Spec
  extracted: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// HTTP helper (JSON only — multipart handled separately in extract())
// ---------------------------------------------------------------------------

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (!(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
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

// ---------------------------------------------------------------------------
// Mock roster — an in-memory spec set spanning multiple rooms with varied
// routing_status so the cockpit renders offline.  route/approve/release/update
// mutate this roster so the offline UI is interactive.
// ---------------------------------------------------------------------------

function nowIso() { return new Date().toISOString() }

const MOCK_SPECS: Spec[] = [
  {
    id: 's1', company_id: 'c1', site_id: '__mock__', component_id: 'comp1',
    material_id: 'mat1', label: 'Vitrified Tile – Floor',
    qty: '450', unit: 'Sq Ft', wastage_pct: '10', unit_rate: '120',
    approval_status: 'pending', client_final_code: null, assignee_id: null,
    notes: null, sent_at: null, released_at: null,
    created_at: '2026-06-01T10:00:00Z', routing_status: 'draft',
  },
  {
    id: 's2', company_id: 'c1', site_id: '__mock__', component_id: 'comp1',
    material_id: 'mat2', label: 'Decorative Panel – Feature Wall',
    qty: '120', unit: 'Sq Ft', wastage_pct: '10', unit_rate: '120',
    approval_status: 'pending', client_final_code: null, assignee_id: null,
    notes: 'Match reference image #4',
    sent_at: '2026-06-10T08:00:00Z', released_at: null,
    created_at: '2026-06-02T10:00:00Z', routing_status: 'out_for_approval',
  },
  {
    id: 's3', company_id: 'c1', site_id: '__mock__', component_id: 'comp2',
    material_id: 'mat3', label: 'Laminate – Wardrobe Shutter',
    qty: '180', unit: 'Sq Ft', wastage_pct: '10', unit_rate: '95',
    approval_status: 'approved', client_final_code: 'OS-9006-02', assignee_id: null,
    notes: null, sent_at: '2026-06-08T09:00:00Z', released_at: null,
    created_at: '2026-06-03T10:00:00Z', routing_status: 'approved',
  },
  {
    id: 's4', company_id: 'c1', site_id: '__mock__', component_id: 'comp2',
    material_id: 'mat4', label: 'Paint – Wall General',
    qty: '780', unit: 'Sq Ft', wastage_pct: '10', unit_rate: '18',
    approval_status: 'approved', client_final_code: 'AP-W-7002', assignee_id: null,
    notes: null, sent_at: '2026-06-07T09:00:00Z',
    released_at: '2026-06-11T12:00:00Z',
    created_at: '2026-06-04T10:00:00Z', routing_status: 'released',
  },
  {
    id: 's5', company_id: 'c1', site_id: '__mock__', component_id: 'comp3',
    material_id: 'mat5', label: 'Granite – Counter',
    qty: '60', unit: 'Sq Ft', wastage_pct: '5', unit_rate: '350',
    approval_status: 'rejected', client_final_code: null, assignee_id: null,
    notes: 'Client wants a warmer tone — revise',
    sent_at: '2026-06-09T09:00:00Z', released_at: null,
    created_at: '2026-06-05T10:00:00Z', routing_status: 'returned',
  },
]

function _findMock(id: string): Spec {
  const s = MOCK_SPECS.find((x) => x.id === id)
  if (!s) throw new ApiError(404, 'Spec not found')
  return s
}

function _specToDesk(siteId: string): DeskOut {
  const specs = MOCK_SPECS.filter((s) => s.site_id === siteId || siteId === '__mock__')
  const groups: Record<string, DeskLine[]> = {}
  for (const s of specs) {
    const room = s.component_id === 'comp1' ? 'Living Room'
      : s.component_id === 'comp2' ? 'Master Bedroom' : 'Kitchen'
    ;(groups[room] ??= []).push({
      id: s.id,
      component_id: s.component_id,
      element: s.label.split('–')[0].trim(),
      location: null,
      category: s.label.split('–')[1]?.trim() ?? s.label,
      brand: null, sku: null, colour: null, finish: null,
      qty: s.qty, unit: s.unit, wastage_pct: s.wastage_pct, unit_rate: s.unit_rate,
      line_total: s.qty && s.unit_rate
        ? String(Number(s.qty) * Number(s.unit_rate) * (1 + Number(s.wastage_pct ?? '0') / 100))
        : null,
      approval_status: s.approval_status,
      client_final_code: s.client_final_code,
      routing_status: s.routing_status,
      sent_at: s.sent_at,
      released_at: s.released_at,
      notes: s.notes,
      material_id: s.material_id,
    })
  }
  const rooms = Object.entries(groups).map(([room, lines]) => ({
    room,
    lines,
    total: lines.reduce((acc, l) => acc + (l.line_total ? Number(l.line_total) : 0), 0).toString(),
    excluded: lines.filter((l) => l.line_total === null).length,
  }))
  return {
    rooms,
    grand_total: rooms.reduce((a, r) => a + Number(r.total), 0).toString(),
    excluded_total: rooms.reduce((a, r) => a + r.excluded, 0),
  }
}

// ---------------------------------------------------------------------------
// Mocked desk (original)
// ---------------------------------------------------------------------------

function mockDesk(): DeskOut {
  return _specToDesk('__mock__')
}

// ---------------------------------------------------------------------------
// specsApi
// ---------------------------------------------------------------------------

export const specsApi = {
  /** Room-grouped spec lines + per-line + per-room + grand-total costing. */
  desk(siteId: string): Promise<DeskOut> {
    if (USE_MOCKS) return Promise.resolve(mockDesk())
    return call<DeskOut>(`/api/v1/specs/desk?site_id=${encodeURIComponent(siteId)}`)
  },

  /** Flat list of all specs for a site (full SpecOut shape). */
  list(siteId: string): Promise<Spec[]> {
    if (USE_MOCKS) return Promise.resolve(MOCK_SPECS.filter((s) => s.site_id === siteId || siteId === '__mock__').map((s) => ({ ...s })))
    return call<Spec[]>(`/api/v1/specs?site_id=${encodeURIComponent(siteId)}`)
  },

  /** Create a new spec line manually. */
  create(body: {
    site_id: string
    component_id: string
    material_id?: string | null
    label: string
    qty?: string | null
    unit?: string | null
    wastage_pct?: string | null
    unit_rate?: string | null
    client_final_code?: string | null
    assignee_id?: string | null
    notes?: string | null
  }): Promise<Spec> {
    if (USE_MOCKS) {
      const s: Spec = {
        id: `s${Date.now()}`,
        company_id: 'c1',
        site_id: body.site_id,
        component_id: body.component_id,
        material_id: body.material_id ?? null,
        label: body.label,
        qty: body.qty ?? null,
        unit: body.unit ?? null,
        wastage_pct: body.wastage_pct ?? null,
        unit_rate: body.unit_rate ?? null,
        approval_status: 'pending',
        client_final_code: body.client_final_code ?? null,
        assignee_id: body.assignee_id ?? null,
        notes: body.notes ?? null,
        sent_at: null,
        released_at: null,
        created_at: nowIso(),
        routing_status: 'draft',
      }
      MOCK_SPECS.push(s)
      return Promise.resolve({ ...s })
    }
    return call<Spec>('/api/v1/specs', { method: 'POST', body: JSON.stringify(body) })
  },

  /** Patch editable fields on an existing spec. */
  update(id: string, patch: {
    material_id?: string | null
    label?: string
    qty?: string | null
    unit?: string | null
    wastage_pct?: string | null
    unit_rate?: string | null
    client_final_code?: string | null
    assignee_id?: string | null
    notes?: string | null
  }): Promise<Spec> {
    if (USE_MOCKS) {
      const s = _findMock(id)
      Object.assign(s, patch)
      return Promise.resolve({ ...s })
    }
    return call<Spec>(`/api/v1/specs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  },

  /** Designer routes a selection out for approval (draft → out_for_approval). */
  route(id: string): Promise<Spec> {
    if (USE_MOCKS) {
      const s = _findMock(id)
      s.sent_at = nowIso()
      s.released_at = null
      s.approval_status = 'pending'
      s.routing_status = 'out_for_approval'
      return Promise.resolve({ ...s })
    }
    return call<Spec>(`/api/v1/specs/${encodeURIComponent(id)}/route`, { method: 'POST' })
  },

  /** Owner/PM/Architect approves or rejects a selection. */
  approve(
    id: string,
    body: { status: 'approved' | 'rejected'; client_final_code?: string },
  ): Promise<Spec> {
    if (USE_MOCKS) {
      const s = _findMock(id)
      s.approval_status = body.status
      if (body.client_final_code !== undefined) s.client_final_code = body.client_final_code
      s.routing_status = body.status === 'approved' ? 'approved' : 'returned'
      return Promise.resolve({ ...s })
    }
    return call<Spec>(`/api/v1/specs/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  /** Release an approved selection to site (approved → released). */
  release(id: string): Promise<Spec> {
    if (USE_MOCKS) {
      const s = _findMock(id)
      if (s.approval_status !== 'approved') throw new ApiError(409, 'Only an approved selection can be released to site')
      s.released_at = nowIso()
      s.routing_status = 'released'
      return Promise.resolve({ ...s })
    }
    return call<Spec>(`/api/v1/specs/${encodeURIComponent(id)}/release`, { method: 'POST' })
  },

  /**
   * Extract a proposed spec from a photo.
   *
   * Backend endpoint: POST /api/v1/specs/extract
   * Shape: multipart/form-data with fields:
   *   - site_id (UUID string, Form field)
   *   - component_id (UUID string, Form field)
   *   - image (UploadFile)
   *
   * Returns: ExtractedSpecOut { spec: Spec, extracted: Record<string, unknown> }
   */
  extract(siteId: string, componentId: string, image: File): Promise<ExtractedSpecOut> {
    if (USE_MOCKS) {
      const s: Spec = {
        id: `s${Date.now()}`,
        company_id: 'c1',
        site_id: siteId,
        component_id: componentId,
        material_id: `mat-proposed-${Date.now()}`,
        label: 'Proposed',
        qty: null, unit: null, wastage_pct: null, unit_rate: null,
        approval_status: 'pending',
        client_final_code: null, assignee_id: null,
        notes: 'Proposed from a photo — confirm.',
        sent_at: null, released_at: null,
        created_at: nowIso(),
        routing_status: 'draft',
      }
      MOCK_SPECS.push(s)
      return Promise.resolve({ spec: { ...s }, extracted: { name: image.name, category: 'Proposed', brand: null } })
    }
    const form = new FormData()
    form.append('site_id', siteId)
    form.append('component_id', componentId)
    form.append('image', image)
    // Note: do NOT set Content-Type — the browser sets multipart boundary automatically.
    return call<ExtractedSpecOut>('/api/v1/specs/extract', { method: 'POST', body: form })
  },
}
