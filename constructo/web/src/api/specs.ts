// Spec engine API layer — the Material Specification Schedule (spec-desk).
// Mirrors the backend JSON (snake_case). Decimals arrive as strings.

import { ApiError } from './client'
import { getToken } from './auth'
import { API_BASE, USE_MOCKS } from './config'

export type SpecApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface DeskLine {
  id: string
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

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
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

/** Dev-only mock so the no-backend tour shows a real-looking schedule. */
function mockDesk(): DeskOut {
  return {
    grand_total: '75240',
    excluded_total: 2,
    rooms: [
      {
        room: 'Living Room',
        total: '75240',
        excluded: 0,
        lines: [
          {
            id: 'l1', element: 'Floor', location: 'Wall A', category: 'Vitrified Tile',
            brand: 'Kajaria', sku: 'ETW-8080', colour: 'Ivory Beige', finish: 'Matt',
            qty: '450', unit: 'Sq Ft', wastage_pct: '10', unit_rate: '120',
            line_total: '59400', approval_status: 'approved', client_final_code: 'ETW-8080',
          },
          {
            id: 'l2', element: 'Wall – Feature', location: null, category: 'Decorative Panel',
            brand: 'Greenlam', sku: 'GR-FLT-22', colour: 'Warm White', finish: 'Textured',
            qty: '120', unit: 'Sq Ft', wastage_pct: '10', unit_rate: '120',
            line_total: '15840', approval_status: 'pending', client_final_code: null,
          },
        ],
      },
      {
        room: 'Master Bedroom',
        total: '0',
        excluded: 2,
        lines: [
          {
            id: 'l3', element: 'Wardrobe Shutter', location: null, category: 'Laminate',
            brand: 'Merino', sku: 'MR-AG-3210', colour: 'Pearl White', finish: 'High Gloss',
            qty: '180', unit: 'Sq Ft', wastage_pct: '10', unit_rate: null,
            line_total: null, approval_status: 'pending', client_final_code: null,
          },
          {
            id: 'l4', element: 'Wall – General', location: null, category: 'Paint',
            brand: 'Asian Paints', sku: 'AP-W-7002', colour: 'Chantilly White', finish: 'Smooth',
            qty: '780', unit: 'Sq Ft', wastage_pct: '10', unit_rate: null,
            line_total: null, approval_status: 'pending', client_final_code: null,
          },
        ],
      },
    ],
  }
}

export const specsApi = {
  /** Room-grouped spec lines + per-line + per-room + grand-total costing. */
  desk(siteId: string): Promise<DeskOut> {
    if (USE_MOCKS) return Promise.resolve(mockDesk())
    return call<DeskOut>(`/api/v1/specs/desk?site_id=${encodeURIComponent(siteId)}`)
  },
}
